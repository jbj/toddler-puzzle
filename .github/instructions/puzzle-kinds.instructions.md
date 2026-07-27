---
name: "Puzzle kinds and layout"
description: "The PuzzleKind contract the host plugs into, the animal-and-hole kind, and how a stage's layout is generated."
applyTo: "src/kinds/**,src/puzzle.ts,src/layout.ts,src/scenery.ts,src/board.ts"
---

# Puzzle kinds and layout

## The host and the kind

`src/game.ts` holds no rules. It is a host: it owns picking a piece up,
following the finger, settling it back down, the sounds, the sparkles and the
three-stage lifecycle. Everything that could differ between one sort of level
and another comes from a `PuzzleKind` (`src/puzzle.ts`):

```ts
interface PuzzleKind {
  readonly id: string;
  deal(level: LevelSpec, random: () => number): Puzzle;
  backdrop(puzzle: Puzzle, layout: Layout): string;
  target(puzzle: Puzzle, layout: Layout, piece: PieceId): Point;
  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean;
  isComplete(puzzle: Puzzle): boolean;
}
```

The animal game is one such kind, `src/kinds/shape-match.ts`, and the host
cannot tell it from any other: it deals a random cast, draws the landscape with
a hole cut for each piece, accepts a drop near a piece's *own* hole, and is done
when every piece is standing in one.

`isComplete` is part of the contract rather than assumed, because not every kind
ends with an empty tray - a cause-and-effect level ends when enough things have
been touched. `backdrop` is redrawn whenever the puzzle moves on, which is how a
filled hole hides itself under the piece now covering it.

What the host does insist on is that the game stays forgiving: a drop the kind
refuses drifts gently back to the tray with a soft tone, never off screen. A
kind cannot opt out of that, and should not try to: see
[`product.instructions.md`](product.instructions.md).

## Stages and layout

`STAGE_SIZES` in `src/layout.ts` says how many pieces each stage holds;
`pickStagePieces` deals that many at random from the shapes on offer, which fixes
both the cast and the order they are laid out in. Everything else about a stage - two
layouts, one per orientation - is generated from a small arrangement table: how
many animals stand on each ground line, how many wait in each tray row, and how
big a slot a piece is drawn to fit inside.

```ts
{ slotSize: 145, sceneRows: [{ groundY: 428, count: 6 }], trayRows: [{ top: 505, count: 6 }], ... }
```

Layouts are therefore built when a puzzle starts rather than up front: a hole's
height depends on the anchor of whichever piece was dealt into that place. Keep
this deal-dependent shape in mind when changing arrangements. Generating the
layouts rather than declaring them is
[decision 0004](../../docs/decisions/0004-generated-layouts.md).

`slotSize` is a square, but a piece need not be. Each piece in play gets its own
`PieceBox` - `boxOf(layout, piece)` - holding the scale from its authored box to
logical units, the bounds that produces, and its own snap radius. A piece is
scaled by its *longer* side, so a plank or a pole still fits the slot the
arrangement laid out, and is then centred across it. Measure a piece with its
`PieceBox`, never with `slotSize`: clamping a wide piece as though it were square
would let it hang off the canvas on one axis and lock it out of reach on the
other.

`spreadX` then spaces each row evenly across the canvas, and each snap radius
follows that piece's own smaller side, so a busier stage automatically gets
tighter, more accurate snapping instead of overlapping snap zones. Pieces shrink
as the board fills up (210 → 190 → 145 units in landscape), which is what lets
six animals share a single row and still leaves every piece well over a tenth of
the canvas wide - the size a small hand needs.

The snap radius stays deliberately generous, about two thirds of the piece it
belongs to; [decision 0001](../../docs/decisions/0001-generous-snap-radius.md)
explains why tightening it is not a cleanup.

## Orientation

The puzzle reflows rather than merely shrinking. Landscape puts the animals in
one row with the tray beneath; portrait uses shallower rows and spends the saved
width on a taller tray. Letterboxing a landscape canvas into an upright phone
would leave the pieces too small to grab, so `chooseLayout()` picks by aspect
ratio. Rotating the device mid-puzzle rebuilds the board but keeps progress.

The background landscape is generated from the layout (`src/scenery.ts`) rather
than being a fixed-size image, so every stage and both orientations share one
piece of art.

## Rules for changing layout

`STAGE_SIZES` and the row counts in both `LANDSCAPE` and `PORTRAIT` must agree.
For each stage, the total `sceneRows` count and total `trayRows` count must equal
the stage size. Changing a stage size means changing all three, and it is one of
the changes that needs a human decision before a pull request.

All layout tunables belong in `src/layout.ts`. Start there rather than
scattering a constant into whichever file happened to need it.

A piece stands on its shape's `anchor`, which for an animal comes from
`FOOT_LEVEL` in `src/assets.ts`. Those values come from `npm run art:check`
output; do not estimate them by eye or adjust them until the animal merely looks
close. See [`art.instructions.md`](art.instructions.md).

The layout tests check that:

- holes stay on canvas;
- snap zones never overlap;
- tray slots never collide;
- pieces stay grabbable;
- every piece fits the slot it was dealt into, whatever its proportions;
- each orientation fills at least 75% of its viewport.

If a layout change weakens one of those properties, treat that as a design change
that needs a human decision before a pull request.
