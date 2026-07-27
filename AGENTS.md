# Agent working agreement

Animal Puzzle is a drag-and-drop animal shape puzzle for toddlers: a two-year-old
matches large animal pieces to matching animal-shaped holes.

## Definition of done

- Run `npm run verify` before claiming a change is ready.
- Never claim a change works without running the check that proves it. For a pull
  request, that check is `npm run verify`.
- Never weaken, skip, or delete a check to make it pass. If a check is wrong,
  change that check separately and explain why.
- Formatting is handled by `npm run format`; do not spend attention on manual
  brace, quote, or wrapping preferences.

## Invariants

- Draw the hole and the piece from the same `#silhouette` path. Never draw them
  separately. Why: one path makes it impossible for a piece to drift out of
  alignment with its hole.
- Keep `#detail` inside `#silhouette` unless an element is tagged
  `data-overhang="..."`; tagged overhang is budgeted at 3% of the animal's area.
  Why: accidental overhang makes a piece look as if it does not fit.
- Set `FOOT_LEVEL` in `src/layout.ts` from `npm run art:check`, never by eye.
  Why: the check measures where the animal actually stands.
- Let a piece snap only into its own hole. Make it impossible to place an animal
  wrongly; a wrong drop drifts back to the tray with a soft warm tone, never a
  buzzer. Why: the game should correct imprecision without scolding.
- Keep the snap radius deliberately generous, about two thirds of a piece. Do not
  tighten it as a cleanup. Why: near misses should count for a toddler.
- Let the game move only forward: no menu, no difficulty picker, no settings, no
  failure state, and no score. The three dots are an indicator for a grown-up,
  not a control. Why: a two-year-old cannot read or configure a toy.
- Keep the project free of binary assets, runtime dependencies, and network
  requests. Art is hand-authored SVG; sound is synthesised with the Web Audio
  API. Why: there is nothing to download and nothing to fail to load.
- Keep every target large; pieces stay well over a tenth of the canvas wide. Why:
  small hands need large things to grab.

## Tie-breaker

The user is a two-year-old who cannot read. When a design question is genuinely
open, choose whatever is more forgiving and requires less understanding. This
settles most arguments.

## Where things live

Use the README's Source map table as the full map. This is only the quick route:

- `src/layout.ts` holds stages, arrangements, snap size, foot levels, and all
  layout tunables.
- `src/assets.ts` loads animal SVGs and enforces the browser-side asset shape.
- `src/geometry.ts` keeps coordinate mapping, clamping, and snap maths pure.
- `src/game.ts` owns the stage lifecycle, piece state, snapping, and returns.
- `scripts/check-art.mjs` is the mechanised art contract.
- `scripts/preview.mjs` renders the contact sheet and one-animal art previews.
- `scripts/shot.mjs` drives the end-to-end Chrome drag run and screenshots.

## Common tasks

- Adding an animal: follow the README's seven steps. Do not restate or shortcut
  them here.
- Changing a stage size: update `STAGE_SIZES`, then update the matching row
  counts in both `LANDSCAPE` and `PORTRAIT`. Layout tests enforce agreement.
- Changing layout constants: start in `src/layout.ts`; all tunables belong there.
- Reviewing art: run `npm run art:check`, then actually look at `npm run art`
  or `npm run art -- <name>` before calling the art finished.
- Running locally: `npm run dev` starts Vite. `npm run art` and
  `npm run art:check` need `rsvg-convert` and ImageMagick.
- Debugging screenshots: `npm run shot` honours `CHROME_BIN`.

## Testing notes

- The deal is random. Tests must rotate the animal list rather than assume one
  fixed cast or one fixed position.
- Prefer asserting the invariant over snapshotting one random deal.
- Use `?seed=123` to reproduce a specific deal in the browser or screenshot run.
- `npm run verify` runs lint, format check, build, Vitest, art contract, and the
  headless Chrome shot run, in that order.

## Human decisions before a pull request

Raise these as a comment on the issue before opening a pull request; do not make
one of these decisions silently inside the PR:

- changing any invariant in this file;
- adding a dependency, runtime or development;
- changing stage sizes;
- changing the visual style;
- changing what a check enforces.

## Files you cannot change

Nothing you can do will get a change to `.github/workflows/` accepted. GitHub
refuses a push that touches a workflow file unless the credential carries the
`workflow` scope, and neither the CLI's token nor the cloud agent's is given it.
This is deliberate: a workflow file is the thing that decides whether every other
change is trustworthy, so it is not something an agent gets to edit on its own
say-so.

If a task appears to need a workflow change, stop and say so on the issue,
naming the change you would make and why. Do not work around it by moving the
logic into a script the workflow calls — that is the same change wearing a
disguise, and it moves privileged behaviour somewhere nobody is reviewing it.

Routine version bumps of actions are Dependabot's job, not yours.

## Pull request expectations

- Prefer one issue per pull request.
- Keep evidence stronger than assertion: name the command you ran and the result.
- Leave checks intact and explain any separate check change in its own right.
- Expect CI to run the full verification and post screenshots automatically.
