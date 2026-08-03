---
name: "Code maintenance"
description: "Definition of done, the npm scripts, where each source file lives, and what a pull request has to carry."
applyTo: "src/**,tests/**,scripts/**,package.json,tsconfig.json,eslint.config.js,vite.config.ts"
---

# Code maintenance

## Definition of done

- Run `npm run verify` before claiming a change is ready.
- Never claim a change works without running the check that proves it. For a pull
  request, that check is `npm run verify`.
- Never weaken, skip, or delete a check to make it pass. If a check is wrong,
  change that check separately and explain why.
- Formatting is handled by `npm run format`; do not spend attention on manual
  brace, quote, or wrapping preferences.

`npm run verify` runs lint, format check, docs check, build, Vitest, the art
contract, and the headless Chrome shot run, in that order. It is also the whole
of what CI runs, so a script added to `verify` is a check added to CI.

**A green run on your own machine is not the same evidence as a green run in
CI**, and the difference is not pedantry. CI is slower, which changes what the
browser checks see: a celebration that looked continuous locally turned out to
leave a visible gap in the balloons, and a button that was never hit locally
started catching taps meant for what was behind it. Both were real faults in the
game rather than flaky tests, and both passed locally first. A rasteriser one
version apart has failed the art check the same way. So run `npm run verify`
before pushing, and then wait for `gh pr checks` before saying a change is done.

The build itself now enforces a **bundle budget**: four numbers in
`scripts/check-bundle.mjs` for what a child downloads before the first level
appears and what the whole game weighs, raw and gzipped. It prints the table
whether it passes or fails. Raising a budget is allowed and raising one quietly
is not - say in the pull request what grew and why it earned the space - but
never ship less art than the game needs, or weaken a check, to stay underneath
one. See
[decision 20260729T223500](../../docs/decisions/20260729T223500-a-chapter-is-warmed-before-it-is-needed.md).

Markdown is listed in `.prettierignore`: the prose is hand-wrapped and
deliberately worded, so wrap it yourself at about 80 columns rather than
expecting the formatter to.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run verify` | Single check that has to pass before a pull request: lint, format check, docs check, build, tests, audio check, art check, and screenshot run |
| `npm run lint` | ESLint |
| `npm run format` | Formats with Prettier |
| `npm run build` | Type-check, production build into `dist/`, then the bundle budget |
| `npm run budget` | Prints what the last build weighs - what loads before the first level, what arrives later, raw and gzipped - and fails when a budget is exceeded |
| `npm run test` | Unit tests (Vitest) |
| `npm run docs:check` | Checks that every cross-reference between Markdown files still resolves |
| `npm run art` | Renders the animal art to `.art/contact-sheet.png` for review; `npm run art -- rabbit` renders one animal large; `npm run art -- scenes` renders the picture scenes, and `npm run art -- farmyard` one scene with its cut grids over it |
| `npm run art:check` | Checks every animal against the asset contract (structure, containment, foot level), that no two in one theme read alike, and that its committed slice recipes still cut it well; and every scene against the scene contract, including that no piece of it is featureless at any grid the levels cut at |
| `npm run art:slices` | Re-measures where every animal is cut and rewrites `src/slice-recipes.json`. Run it after redrawing an animal |
| `npm run audio` | Renders every sound offline and draws `.art/audio/sheet.png`, so a human can see what nobody can hear in review |
| `npm run audio:check` | Renders every sound through a real `OfflineAudioContext` in Chromium and measures the samples: peak, onset and release continuity, duration, spectral centroid, and bit-silence with sound off |
| `npm run shot` | Drives real drags in headless Chromium and screenshots the result (run `npm run build` first) |
| `npm run shot:sheet` | Rebuilds `.art/shots/contact-sheet.png` from the last run's screenshots |

## Running locally

`npm install`, then `npm run dev`. `npm run art` and `npm run art:check` need
`rsvg-convert` and ImageMagick, which are not npm packages; on Debian or Ubuntu,
`sudo apt-get install librsvg2-bin imagemagick`. `npm run shot` and
`npm run audio:check` need a headless Chrome binary and honour `CHROME_BIN`;
`npm run audio` also wants `rsvg-convert` to rasterise its sheet, and writes the
SVG regardless if it is missing.

Both browser checks run silent: `scripts/chrome.mjs` launches Chromium with
`--mute-audio`. `npm run shot` plays the game for real, so without it a check
somebody started in the background sings its way through the levels out of the
laptop speakers. The flag mutes the browser's *output device* only, so
`npm run audio:check`, which measures an `OfflineAudioContext` rendered into a
buffer that never reaches a device, still hears every sound unchanged.

`CHROME_BIN` is only needed when the browser is not called `chromium` - that is
the default, and CI sets the variable because a runner has `google-chrome`.
Setting it to a full path on a machine where `chromium` is already on `PATH`
changes nothing; it is not a step to copy around.

### When a browser check goes wrong

The two checks that drive a browser - `npm run shot` and `npm run audio:check` -
each start their own and talk to it on a fixed port. Three things used to go
wrong here in ways that pointed somewhere else entirely, so each now stops with
its own message rather than failing later as something unrelated:

- **A browser is already on the port.** Nearly always one left behind by an
  interrupted run. Nothing would stop the check attaching to it and driving
  *that* browser, on whatever page the old run left on screen - which surfaces
  as an assertion failing for reasons that make no sense, like a fresh player
  not starting on level 1. The check now refuses to attach to a browser it did
  not start, and prints how to find and stop the old one. Do that, then run it
  again; there is nothing wrong with the code.
- **There is no build, or the build is older than the code.** The run serves
  `dist/`, so without `npm run build` the page is empty and the first thing to
  go wrong is far from the cause. A *stale* build is worse: the run passes or
  fails on code that is no longer in the tree. That happens most often when
  `npm run build` failed its type-check - which type-checks `tests/` too, so a
  broken test type leaves the last build standing. Both stop the run now.
- **Importing `scripts/shot.mjs` runs it.** There is no entry point to call:
  the file is a script, and importing it serves the build and plays the game.
  Reaching for `await import(...)` to check the file parses is how a stray
  browser gets created in the first place. It now refuses to be imported; use
  `node --check scripts/shot.mjs`.

Why each of those stops the run rather than being written down and hoped for is
[decision 20260730T113000](../../docs/decisions/20260730T113000-a-check-explains-its-own-environment.md).

### Lint rules worth knowing before they surprise you

- `@typescript-eslint/unbound-method` fires when a method written in shorthand
  is pulled off its object, which includes destructuring a test helper. Declare
  helpers as properties holding arrows - `readonly f: () => T` - rather than
  methods.
- `@typescript-eslint/no-unnecessary-type-assertion` and `tsc` disagree about
  indexing a readonly tuple such as `CHAPTERS[i]`: one wants the assertion the
  other calls redundant. Iterate the thing instead of indexing it and both are
  satisfied.

## Source map

| File | Role |
| --- | --- |
| `src/geometry.ts` | Pure maths: screen↔logical mapping, snapping, clamping |
| `src/piece.ts` | What a piece is: `PieceId` and `PieceShape`, independent of any provider |
| `src/puzzle.ts` | What a kind of puzzle is: the `PuzzleKind` contract the host plugs into |
| `src/levels.ts` | The thirty levels: the whole difficulty ramp, in one table, and the deal |
| `src/themes.ts` | The themed casts a level can deal from: farm, sea, jungle, vehicles |
| `src/progress.ts` | What is remembered between sittings: the level, and the grown-up settings |
| `src/kinds/registry.ts` | Resolves a level's kind by id, and refuses one nobody registered. Also where the bundle is cut: chapters 1 and 2 are inline, the other four kinds are a chunk each |
| `src/kinds/shape-match.ts` | The animal-and-hole game, as one `PuzzleKind` |
| `src/kinds/sliced.ts` | One animal in two to four slices, assembled in one hole |
| `src/slices.ts` | Rebuilds a slice's cell from a recipe, and cuts an animal into pieces |
| `src/slice-recipes.json` | Where each animal is cut, measured offline and committed |
| `src/kinds/polygon.ts` | One picture built out of plain shapes, any two the same interchangeable |
| `src/scenes.ts` | The shape-picture catalogue: geometric forms, generated, and what makes two of them the same. Not the jigsaw scenes - those are `src/pictures.ts` |
| `src/kinds/jigsaw.ts` | One picture cut into interlocking pieces, rebuilt over a guide of itself |
| `src/jigsaw.ts` | The cutter: every internal cut minted once and handed to both its neighbours |
| `src/kinds/shatter.ts` | One picture broken into irregular convex shards, no two alike |
| `src/shatter.ts` | The shatterer: recursive half-plane splits, searched until every shard clears the floors |
| `src/picture-pieces.ts` | Mints a frame, the clipped pieces and the dimmed guide. Shared by both cut-up-picture kinds |
| `src/cut.ts` | How a piece of a bigger drawing is cut out and edged: the two clips - the cut, and the cut spread by a hair for once the drawing is whole - and the white line that fades once the piece is home. Shared by the slicer and both cut-up-picture kinds |
| `src/kinds/play.ts` | Cause and effect: the bubbles, the peekaboo bushes and the scene that answers |
| `src/pop.ts` | The pop engine: a thing that floats and bursts. Shared - a chapter celebration bursts balloons with it |
| `src/motion.ts` | Whether the player asked for less motion. The one place `prefers-reduced-motion` is read |
| `src/layout.ts` | Composes a level's layout from its cast, and all tunable constants |
| `src/fit.ts` | The sizing search under `layout.ts`: how the board is split between the tray and the play area, over plain sizes |
| `src/scenery.ts` | Generates the background for a layout: one landscape, and a themed palette and props per theme |
| `src/assets.ts` | Loads and validates the animal SVGs, as piece shapes |
| `src/pictures.ts` | Loads and validates the picture scenes, as artwork safe to inline and cut up |
| `src/assets/scenes/` | The hand-drawn scenes a jigsaw or shatter level cuts into pieces |
| `src/board.ts` | Builds the SVG scene graph for one level |
| `src/icons.ts` | The hand-drawn SVG icons used by the chrome around the puzzle |
| `src/drag.ts` | Pointer-event drag engine |
| `src/game.ts` | The host: drag state, settling, sound, sparkles, level lifecycle |
| `src/grownups.ts` | The grown-up panel: the hold that opens it, the level map, the switches |
| `src/audio.ts` | Every sound in the game, as data: one pentatonic ladder, voices, phrases, and the single gate the sound toggle sits on |
| `src/celebrate.ts` | Sparkles and the next-puzzle button |
| `src/hint.ts` | The idle hint: how long a board is left alone, which piece it is about, and the glow at both ends |
| `src/rest.ts` | What the game does when nobody is playing it: the two-minute wait, the freeze that stops every animation and repeating timer, and the touch that undoes it |
| `src/celebration.ts` | What the end of a chapter looks like, and what the end of the game looks like. Six celebrations, all played rather than watched. A chunk of its own, asked for when a chapter-ending level is dealt |
| `src/warm.ts` | Pulls every deferred chunk in during play, in the order the levels will want it, so no level seam ever waits for the network |
| `scripts/preview.mjs` | Renders the art for review: a contact sheet, one animal large, or a scene under its cut grids |
| `scripts/check-art.mjs` | Enforces the asset contract on every animal SVG and every scene |
| `scripts/pictures.mjs` | Judges a scene from pixels: the grids the levels cut at, and whether every piece has something in it |
| `scripts/slices.mjs` | Judges a cut from pixels: whole, fair, grabbable. Shared by the two above |
| `scripts/slice-recipes.mjs` | Searches for where to cut every animal, and writes the table |
| `scripts/check-docs.mjs` | Enforces that Markdown cross-references resolve |
| `scripts/check-bundle.mjs` | Holds the build to the bundle budget, and prints what everything weighs |
| `scripts/check-audio.mjs` | Renders every sound offline in Chromium, measures the samples, and optionally draws the waveform sheet |
| `scripts/audio-probe.mjs` | The half of that which runs in the browser: `OfflineAudioContext` renders, an FFT and the measurements |
| `scripts/chrome.mjs` | Starts headless Chromium and speaks the debugging protocol to it. Shared by the screenshot run and the audio render |
| `scripts/shot.mjs` | End-to-end drag and touch test in headless Chromium. Also the only place the network is taken away: what a child sees when a chapter's chunk is missing is checked here, because nothing else can |
| `scripts/shot-sheet.mjs` | Packs the run's screenshots into one image to attach to a pull request |
| `scripts/tools.mjs` | Resolves the external art tools, with one clear message when they are missing |
| `vite.config.ts` | Build configuration. `base` is relative, so one bundle works both at a server root and under the Pages path: see [decision 20260728T103610](../../docs/decisions/20260728T103610-deploy-to-github-pages.md). Also writes `.art/bundle.json`, which is what the budget check reads |

## Pull request expectations

- Prefer one issue per pull request.
- Keep evidence stronger than assertion: name the command you ran and the result.
- Leave checks intact and explain any separate check change in its own right.
- CI runs the full verification, but it will not show anyone what the change
  looks like. Attaching that is your job.
- Routine version bumps of actions are Dependabot's job, not yours.

### When one pull request is based on another

Work that arrives as a chain - each branch based on the one before it, so the
last contains everything - is reviewed from the bottom up and merged in order.
Two things about that are easy to learn the expensive way:

- **A review from Copilot does not start by itself when the base is not
  `main`.** Ask for it once CI is green, or the pull request sits there looking
  reviewed and is not:

      gh api -X POST repos/<owner>/<repo>/pulls/<n>/requested_reviewers \
        -f "reviewers[]=copilot-pull-request-reviewer[bot]"

- **Never push to a branch something else is based on.** The pull request on
  top goes to a state where **CI does not run at all**, and `gh pr checks`
  reports "no checks reported" rather than a failure - so it is silence, not a
  red mark, and nobody notices. If the base has genuinely moved, *merge* it into
  the branch above rather than rebasing: other branches point at those commits.

`docs/decisions/README.md` is the file every change touches, so it is where two
branches collide. Keep an edit to it to the single row for the record being
added.

CI runs the whole of `npm run verify` on every pull request. It does not post
the screenshots: the author attaches them, having run the same command. Why that
way round is
[decision 20260727T105836](../../docs/decisions/20260727T105836-screenshots-come-from-the-author.md).
A pull request also does not need an approving review to merge; why is
[decision 20260727T151749](../../docs/decisions/20260727T151749-no-required-approving-review.md).

Once a change is on `main` and its CI run is green, a second workflow builds that
same commit and publishes it to
[the live site](https://jbj.github.io/toddler-puzzle/). It waits for CI rather
than deploying on the push, and it commits nothing to any branch; why is
[decision 20260728T103610](../../docs/decisions/20260728T103610-deploy-to-github-pages.md). Breaking
`main` therefore leaves the previous site up rather than replacing it with a
broken one.

## Attaching screenshots

`npm run verify` leaves the screenshots and a combined
`.art/shots/contact-sheet.png` in `.art/shots/`. Attach the contact sheet to the
pull request body, and an individual shot as well when one detail deserves a
closer look.

Nothing verifies that the images match the branch. CI once published them
itself, and that turned out to cost more than it was worth
([decision 20260727T105836](../../docs/decisions/20260727T105836-screenshots-come-from-the-author.md));
a reviewer now takes them on trust. So:

- Attach images from a run of the branch as it stands, after your last commit.
  Never a run from an earlier state, and never one hand-edited to look better.
- If the run would not complete, say that instead of attaching nothing and
  hoping the omission passes unnoticed.

`.art/` is ignored by git. Do not commit the images to get around the upload -
that is the pipeline this project deliberately removed, rebuilt by hand.

### If you cannot attach an image

Dragging a file into a pull request is a browser action. An agent working
through the GitHub API cannot do it: there is no token-authenticated endpoint
for it, so Copilot CLI in particular will not manage it however hard it tries.

Do not treat that as permission to skip the evidence. Instead, say in the pull
request that you could not attach the images, and link the `puzzle-screenshots`
artifact from this branch's CI run, which holds the same screenshots and the
same contact sheet:

    gh run list --branch <your-branch> --workflow CI --limit 1
    gh run view <run-id>          # the artifact is listed at the bottom

Then ask the reviewer to look at the artifact, or to run `npm run shot`
themselves. An unattached screenshot a reviewer can still find beats a claim
that the puzzle looks fine.
