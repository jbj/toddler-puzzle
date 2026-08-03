---
name: "Code maintenance"
description: "Definition of done, the npm scripts, where each source file lives, and what a pull request has to carry."
applyTo: "src/**,tests/**,scripts/**,package.json,tsconfig.json,eslint.config.js,vite.config.ts"
---

# Code maintenance

## Definition of done

- Run `npm run verify` before claiming a change is ready. It runs lint, format
  check, docs check, build, Vitest, the art contract and the headless Chrome
  shot run, and it is the whole of what CI runs - a script added to `verify` is
  a check added to CI.
- Never claim a change works without running the check that proves it.
- Never weaken, skip or delete a check to make it pass. If a check is wrong,
  change it separately and say why.
- Then wait for `gh pr checks`. **A green run locally is not the same evidence
  as a green run in CI**: CI is slower, and that difference has exposed real
  faults - a gap in a celebration, a button catching taps meant for what was
  behind it, a rasteriser one version apart failing the art check.
- `npm run format` handles formatting; do not spend attention on braces, quotes
  or wrapping. Markdown is in `.prettierignore` - hand-wrap it at about 80
  columns yourself.
- The build enforces a **bundle budget**: four numbers in
  `scripts/check-bundle.mjs`, printed pass or fail. Raising one is allowed;
  raising one quietly is not. Never ship less art than the game needs to stay
  under it. See
  [A chapter is warmed before it is needed, not fetched when it is](<../../docs/decisions/A chapter is warmed before it is needed, not fetched when it is.md>).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run verify` | The single pre-PR check: lint, format check, docs check, build, tests, audio check, art check, screenshot run |
| `npm run lint` | ESLint |
| `npm run format` | Formats with Prettier |
| `npm run build` | Type-check, production build into `dist/`, then the bundle budget |
| `npm run budget` | Prints what the last build weighs, raw and gzipped, and fails over budget |
| `npm run test` | Unit tests (Vitest) |
| `npm run docs:check` | Checks Markdown cross-references, and holds each instructions file to its size budget |
| `npm run art` | Renders the animal art to `.art/contact-sheet.png`; `-- rabbit` renders one animal large, `-- scenes` the picture scenes, `-- farmyard` one scene under its cut grids |
| `npm run art:check` | Every animal against the asset contract (structure, containment, foot level), no two in one theme alike, committed slice recipes still cutting well; every scene against the scene contract, including no featureless piece at any grid the levels cut at |
| `npm run art:slices` | Re-measures where every animal is cut and rewrites `src/slice-recipes.json`. Run after redrawing an animal |
| `npm run audio` | Renders every sound offline and draws `.art/audio/sheet.png` |
| `npm run audio:check` | Renders every sound through a real `OfflineAudioContext` in Chromium and measures the samples |
| `npm run shot` | Drives real drags in headless Chromium and screenshots the result (build first) |
| `npm run shot:sheet` | Rebuilds `.art/shots/contact-sheet.png` from the last run's screenshots |

## Running locally

- `npm install`, then `npm run dev`.
- `npm run art` and `npm run art:check` need `rsvg-convert` and ImageMagick,
  which are not npm packages: `sudo apt-get install librsvg2-bin imagemagick`.
- `npm run shot` and `npm run audio:check` need a headless Chrome binary and
  honour `CHROME_BIN`. It is only needed when the browser is not called
  `chromium`; CI sets it because a runner has `google-chrome`. Setting it on a
  machine that already has `chromium` on `PATH` changes nothing - it is not a
  step to copy around.
- Both browser checks launch Chromium with `--mute-audio` (`scripts/chrome.mjs`)
  so a background run does not sing out of the speakers. It mutes the output
  device only, so `npm run audio:check` still measures every sound.

### When a browser check goes wrong

Each of these stops the run with its own message rather than failing later as
something unrelated. Why they explain themselves is
[A check explains its own environment, rather than failing as something else](<../../docs/decisions/A check explains its own environment, rather than failing as something else.md>).

- **A browser is already on the port**, usually one left by an interrupted run.
  The check refuses to attach to a browser it did not start and prints how to
  stop the old one. Stop it and run again; there is nothing wrong with the code.
- **There is no build, or the build is older than the code.** The run serves
  `dist/`. A stale build most often means `npm run build` failed its type-check,
  which type-checks `tests/` too.
- **Importing `scripts/shot.mjs` runs it.** It refuses to be imported; use
  `node --check scripts/shot.mjs`.

### Lint rules worth knowing before they surprise you

- `@typescript-eslint/unbound-method` fires when a shorthand method is pulled
  off its object, which includes destructuring a test helper. Declare helpers as
  properties holding arrows - `readonly f: () => T`.
- `@typescript-eslint/no-unnecessary-type-assertion` and `tsc` disagree about
  indexing a readonly tuple such as `CHAPTERS[i]`. Iterate it rather than index
  it and both are satisfied.

## Source map

| File | Role |
| --- | --- |
| `src/geometry.ts` | Pure maths: screen↔logical mapping, snapping, clamping |
| `src/piece.ts` | What a piece is: `PieceId` and `PieceShape`, independent of any provider |
| `src/puzzle.ts` | What a kind of puzzle is: the `PuzzleKind` contract the host plugs into |
| `src/levels.ts` | The thirty levels: the whole difficulty ramp, in one table, and the deal |
| `src/themes.ts` | The themed casts a level can deal from: farm, sea, jungle, vehicles |
| `src/progress.ts` | What is remembered between sittings: the level, and the grown-up settings |
| `src/kinds/registry.ts` | Resolves a level's kind by id, and refuses one nobody registered. Also where the bundle is cut: chapters 1 and 2 inline, the other four kinds a chunk each |
| `src/kinds/shape-match.ts` | The animal-and-hole game, as one `PuzzleKind` |
| `src/kinds/sliced.ts` | One animal in two to four slices, assembled in one hole |
| `src/slices.ts` | Rebuilds a slice's cell from a recipe, and cuts an animal into pieces |
| `src/slice-recipes.json` | Where each animal is cut, measured offline and committed |
| `src/kinds/polygon.ts` | One picture built out of plain shapes, any two the same interchangeable |
| `src/scenes.ts` | The shape-picture catalogue, generated. Not the jigsaw scenes - those are `src/pictures.ts` |
| `src/kinds/jigsaw.ts` | One picture cut into interlocking pieces, rebuilt over a guide of itself |
| `src/jigsaw.ts` | The cutter: every internal cut minted once and handed to both its neighbours |
| `src/kinds/shatter.ts` | One picture broken into irregular convex shards, no two alike |
| `src/shatter.ts` | The shatterer: recursive half-plane splits, searched until every shard clears the floors |
| `src/picture-pieces.ts` | Mints a frame, the clipped pieces and the dimmed guide. Shared by both cut-up-picture kinds |
| `src/cut.ts` | How a piece of a bigger drawing is cut out and edged: the two clips, and the white line that fades once the piece is home. Shared by the slicer and both cut-up-picture kinds |
| `src/kinds/play.ts` | Cause and effect: the bubbles, the peekaboo bushes and the scene that answers |
| `src/pop.ts` | The pop engine: a thing that floats and bursts. Shared - a chapter celebration bursts balloons with it |
| `src/motion.ts` | Whether the player asked for less motion. The one place `prefers-reduced-motion` is read |
| `src/layout.ts` | Composes a level's layout from its cast, and all tunable constants |
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
| `src/rest.ts` | What the game does when nobody is playing: the two-minute wait, the freeze, and the touch that undoes it |
| `src/celebration.ts` | Six chapter celebrations and the finale, all played rather than watched. A chunk of its own |
| `src/warm.ts` | Pulls every deferred chunk in during play, in the order the levels will want it |
| `scripts/preview.mjs` | Renders the art for review: a contact sheet, one animal large, or a scene under its cut grids |
| `scripts/check-art.mjs` | Enforces the asset contract on every animal SVG and every scene |
| `scripts/pictures.mjs` | Judges a scene from pixels: the grids the levels cut at, and whether every piece has something in it |
| `scripts/slices.mjs` | Judges a cut from pixels: whole, fair, grabbable. Shared by the two above |
| `scripts/slice-recipes.mjs` | Searches for where to cut every animal, and writes the table |
| `scripts/check-docs.mjs` | Enforces that Markdown cross-references resolve, and the instructions size budget |
| `scripts/check-bundle.mjs` | Holds the build to the bundle budget, and prints what everything weighs |
| `scripts/check-audio.mjs` | Renders every sound offline in Chromium, measures the samples, and optionally draws the waveform sheet |
| `scripts/audio-probe.mjs` | The half of that which runs in the browser: renders, an FFT and the measurements |
| `scripts/chrome.mjs` | Starts headless Chromium and speaks the debugging protocol to it |
| `scripts/shot.mjs` | End-to-end drag and touch test in headless Chromium. Also the only place the network is taken away, so what a child sees when a chapter's chunk is missing is checked here |
| `scripts/shot-sheet.mjs` | Packs the run's screenshots into one image to attach to a pull request |
| `scripts/tools.mjs` | Resolves the external art tools, with one clear message when they are missing |
| `vite.config.ts` | Build configuration. `base` is relative, so one bundle works at a server root and under the Pages path. Also writes `.art/bundle.json`, which the budget check reads |

## Pull request expectations

- Prefer one issue per pull request.
- Name the command you ran and its result; evidence beats assertion.
- Leave checks intact; explain any check change in its own right.
- Attaching the screenshots is your job - CI will not show anyone what the
  change looks like. See
  [Let the author attach the screenshots](<../../docs/decisions/Let the author attach the screenshots.md>).
- Routine version bumps of actions are Dependabot's job.
- A pull request needs no approving review to merge. See
  [Require no approving review on main](<../../docs/decisions/Require no approving review on main.md>).
- Once a change is on `main` and CI is green, a second workflow publishes that
  commit to [the live site](https://jbj.github.io/toddler-puzzle/), so breaking
  `main` leaves the previous site up rather than replacing it. See
  [Deploy to GitHub Pages from a verified commit](<../../docs/decisions/Deploy to GitHub Pages from a verified commit.md>).

### When one pull request is based on another

A chain is reviewed from the bottom up and merged in order.

- **A Copilot review does not start by itself when the base is not `main`.** Ask
  for it once CI is green, or the pull request sits there looking reviewed:

      gh api -X POST repos/<owner>/<repo>/pulls/<n>/requested_reviewers \
        -f "reviewers[]=copilot-pull-request-reviewer[bot]"

- **Never push to a branch something else is based on.** The pull request on top
  goes to a state where CI does not run at all and `gh pr checks` reports "no
  checks reported" - silence, not a red mark. If the base has moved, *merge* it
  into the branch above rather than rebasing.

## Attaching screenshots

`npm run verify` leaves the screenshots and `.art/shots/contact-sheet.png` in
`.art/shots/`. Attach the contact sheet, plus an individual shot when one detail
deserves a closer look.

- Attach images from a run of the branch as it stands, after your last commit.
  Never an earlier state, never one hand-edited to look better.
- If the run would not complete, say so rather than attaching nothing and hoping
  the omission passes unnoticed.
- `.art/` is ignored by git. Do not commit the images to get around the upload.

### If you cannot attach an image

Dragging a file into a pull request is a browser action with no
token-authenticated endpoint, so an agent working through the GitHub API cannot
do it. Say so in the pull request and link the `puzzle-screenshots` artifact
from this branch's CI run, which holds the same images:

    gh run list --branch <your-branch> --workflow CI --limit 1
    gh run view <run-id>          # the artifact is listed at the bottom

Then ask the reviewer to look at the artifact, or to run `npm run shot`
themselves.
