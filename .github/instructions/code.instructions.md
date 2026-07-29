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

Markdown is listed in `.prettierignore`: the prose is hand-wrapped and
deliberately worded, so wrap it yourself at about 80 columns rather than
expecting the formatter to.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run verify` | Single check that has to pass before a pull request: lint, format check, docs check, build, tests, art check, and screenshot run |
| `npm run lint` | ESLint |
| `npm run format` | Formats with Prettier |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run test` | Unit tests (Vitest) |
| `npm run docs:check` | Checks that every cross-reference between Markdown files still resolves |
| `npm run art` | Renders the animal art to `.art/contact-sheet.png` for review; `npm run art -- rabbit` renders one animal large |
| `npm run art:check` | Checks every animal against the asset contract (structure, containment, foot level), that no two in one theme read alike, and that its committed slice recipes still cut it well |
| `npm run art:slices` | Re-measures where every animal is cut and rewrites `src/slice-recipes.json`. Run it after redrawing an animal |
| `npm run shot` | Drives real drags in headless Chromium and screenshots the result (run `npm run build` first) |
| `npm run shot:sheet` | Rebuilds `.art/shots/contact-sheet.png` from the last run's screenshots |

## Running locally

`npm install`, then `npm run dev`. `npm run art` and `npm run art:check` need
`rsvg-convert` and ImageMagick, which are not npm packages; on Debian or Ubuntu,
`sudo apt-get install librsvg2-bin imagemagick`. `npm run shot` needs a headless
Chrome binary and honours `CHROME_BIN`.

## Source map

| File | Role |
| --- | --- |
| `src/geometry.ts` | Pure maths: screen↔logical mapping, snapping, clamping |
| `src/piece.ts` | What a piece is: `PieceId` and `PieceShape`, independent of any provider |
| `src/puzzle.ts` | What a kind of puzzle is: the `PuzzleKind` contract the host plugs into |
| `src/levels.ts` | The thirty levels: the whole difficulty ramp, in one table, and the deal |
| `src/themes.ts` | The themed casts a level can deal from: farm, sea, jungle, vehicles |
| `src/progress.ts` | What is remembered between sittings: the level, and the grown-up settings |
| `src/kinds/registry.ts` | Resolves a level's kind, standing in for the kinds not built yet |
| `src/kinds/shape-match.ts` | The animal-and-hole game, as one `PuzzleKind` |
| `src/kinds/sliced.ts` | One animal in two to four slices, assembled in one hole |
| `src/slices.ts` | Rebuilds a slice's cell from a recipe, and cuts an animal into pieces |
| `src/slice-recipes.json` | Where each animal is cut, measured offline and committed |
| `src/kinds/polygon.ts` | One picture built out of plain shapes, any two the same interchangeable |
| `src/scenes.ts` | The picture catalogue: geometric forms, generated, and what makes two of them the same |
| `src/kinds/play.ts` | Cause and effect: the bubbles, the peekaboo bushes and the scene that answers |
| `src/pop.ts` | The pop engine: a thing that floats and bursts. Shared - a chapter celebration bursts balloons with it |
| `src/motion.ts` | Whether the player asked for less motion. The one place `prefers-reduced-motion` is read |
| `src/layout.ts` | Composes a level's layout from its cast, and all tunable constants |
| `src/scenery.ts` | Generates the background for a layout |
| `src/assets.ts` | Loads and validates the animal SVGs, as piece shapes |
| `src/board.ts` | Builds the SVG scene graph for one level |
| `src/icons.ts` | The hand-drawn SVG icons used by the chrome around the puzzle |
| `src/drag.ts` | Pointer-event drag engine |
| `src/game.ts` | The host: drag state, settling, sound, sparkles, level lifecycle |
| `src/grownups.ts` | The grown-up panel: the hold that opens it, the level map, the switches |
| `src/audio.ts` | Web Audio sound synthesis |
| `src/celebrate.ts` | Sparkles and the next-puzzle button |
| `scripts/preview.mjs` | Renders the art for review, as a contact sheet or one animal large |
| `scripts/check-art.mjs` | Enforces the asset contract on every animal SVG |
| `scripts/slices.mjs` | Judges a cut from pixels: whole, fair, grabbable. Shared by the two above |
| `scripts/slice-recipes.mjs` | Searches for where to cut every animal, and writes the table |
| `scripts/check-docs.mjs` | Enforces that Markdown cross-references resolve |
| `scripts/shot.mjs` | End-to-end drag and touch test in headless Chromium |
| `scripts/shot-sheet.mjs` | Packs the run's screenshots into one image to attach to a pull request |
| `scripts/tools.mjs` | Resolves the external art tools, with one clear message when they are missing |
| `vite.config.ts` | Build configuration. `base` is relative, so one bundle works both at a server root and under the Pages path: see [decision 20260728T103610](../../docs/decisions/20260728T103610-deploy-to-github-pages.md) |

## Pull request expectations

- Prefer one issue per pull request.
- Keep evidence stronger than assertion: name the command you ran and the result.
- Leave checks intact and explain any separate check change in its own right.
- CI runs the full verification, but it will not show anyone what the change
  looks like. Attaching that is your job.
- Routine version bumps of actions are Dependabot's job, not yours.

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

`npm run verify` leaves fifteen screenshots and a combined
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
