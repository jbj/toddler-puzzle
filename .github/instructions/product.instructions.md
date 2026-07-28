---
name: "Product decisions"
description: "What Animal Puzzle is for, the invariants that must not be weakened, and which questions need a human before a pull request."
---

# Product decisions

Animal Puzzle is a drag-and-drop animal shape puzzle for toddlers: a two-year-old
matches large animal pieces to matching animal-shaped holes. A game is three
puzzles long and grows as it goes - three animals, then four, then six - so the
first win comes quickly and the board fills up from there.

This file is the one to read before changing what the game *does*. It is not
attached automatically, because most changes do not need it; read it whenever a
task touches behaviour a player would notice.

## Tie-breaker

The user is a two-year-old who cannot read. When a design question is genuinely
open, choose whatever is more forgiving and requires less understanding. This
settles most arguments.

## Invariants

These are deliberate. Each one has a reason, and several of them look like
oversights until you know it, so the reason is written next to the rule.

- Draw the hole and the piece from the same `#silhouette` path. Never draw them
  separately. Why: one path makes it impossible for a piece to drift out of
  alignment with its hole.
- Keep `#detail` inside `#silhouette` unless an element is tagged
  `data-overhang="..."`; tagged overhang is budgeted at 3% of the animal's area.
  Why: accidental overhang makes a piece look as if it does not fit.
- Set `FOOT_LEVEL` in `src/assets.ts`, which becomes each shape's anchor, from
  `npm run art:check`, never by eye. Why: the check measures where the animal
  actually stands.
- Let a piece snap only into its own hole. Make it impossible to place an animal
  wrongly; a wrong drop drifts back to the tray with a soft warm tone, never a
  buzzer. Why: the game should correct imprecision without scolding.
- Keep the snap radius deliberately generous, about two thirds of the piece being
  dropped. Do not tighten it as a cleanup. Why: near misses should count for a
  toddler.
- Let the game move only forward: no menu, no difficulty picker, no settings, no
  failure state, and no score. The three dots are an indicator for a grown-up,
  not a control. Why: a two-year-old cannot read or configure a toy.
- Keep the project free of binary assets, runtime dependencies, and network
  requests. Art is hand-authored SVG; sound is synthesised with the Web Audio
  API. Why: there is nothing to download and nothing to fail to load.
- Keep every target large; pieces stay well over a tenth of the canvas wide. Why:
  small hands need large things to grab.

## What the invariants add up to

**Everything is forgiving.** A piece only ever snaps into its *own* hole, so it
is impossible to place an animal "wrongly". The snap radius is deliberately
large - about two thirds of the piece being dropped, measured per piece rather
than from one shared square - and any other drop drifts gently back to the tray.
Pieces are clamped to the canvas by their own bounds, so one can never be dragged
out of reach. A wrong drop plays a soft, warm tone rather than a buzzer. The
mechanics are in
[`navigation.instructions.md`](navigation.instructions.md); the reasoning is
[decision 20260727T072917](../../docs/decisions/20260727T072917-generous-snap-radius.md).

**The game only ever moves forward.** There is no menu and no difficulty picker:
the three stages are always played in the same order, the button at the end of
one leads straight into the next, and the button after the last one starts again
at three animals. Three dots by the reset button show a grown-up how far along
the set is; they are not a control. See
[decision 20260727T072917](../../docs/decisions/20260727T072917-no-menu-or-difficulty-picker.md).

**Toddler-proofing.** Pinch-zoom, double-tap zoom, text selection, long-press
context menus and native image dragging are all disabled. Every target is large.
While dragging, the piece is held slightly above the finger so a small hand
doesn't cover it.

**No binary assets.** The animals are hand-authored SVG and the sounds are
synthesised with the Web Audio API, so there is nothing to download and nothing
to fail to load. The whole bundle is around 24 kB. See
[decision 20260727T072917](../../docs/decisions/20260727T072917-no-binary-assets-or-runtime-dependencies.md).

**Every puzzle is dealt fresh.** Which animals turn up and the order they stand
in are drawn at random each time a puzzle starts, so the same three animals are
never waiting in the same places twice. Add `?seed=123` to the URL to replay a
particular deal - the screenshot run uses it to keep its shots comparable.

## Human decisions before a pull request

Raise these as a comment on the issue before opening a pull request; do not make
one of these decisions silently inside the PR:

- changing any invariant in this file;
- adding a dependency, runtime or development;
- changing stage sizes;
- changing the visual style;
- changing what a check enforces.

None of these are forbidden. They are the changes where the reason matters more
than the diff, and where a reviewer seeing them for the first time in a pull
request is being asked the wrong question at the wrong moment.
