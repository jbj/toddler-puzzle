---
name: "Puzzle kinds and layout"
description: "The PuzzleKind contract the host plugs into, the thirty-level table and the kind registry, and how a level's layout is generated."
applyTo: "src/kinds/**,src/puzzle.ts,src/layout.ts,src/scenery.ts,src/board.ts"
---

# Puzzle kinds and layout

## The host and the kind

`src/game.ts` holds no rules. It is a host: it owns picking a piece up,
following the finger, settling it back down, the sounds, the sparkles and the
level lifecycle. Everything that could differ between one sort of level
and another comes from a `PuzzleKind` (`src/puzzle.ts`):

```ts
interface PuzzleKind {
  readonly id: PuzzleKindId;
  deal(deal: Deal, random: () => number): Puzzle;
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

## The level table

`LEVELS` in `src/levels.ts` is the whole difficulty ramp: thirty records in six
chapters of five, one per level, and the only place in the codebase that decides
how hard anything is. A record says which `kind` of puzzle the level is, how many
`targets` there are to fill and how many `pieces` fill them (the same number
except where one animal is cut into slices), how forgiving the snapping is, and
optionally a `theme` and `options` its kind understands.

Tuning the game is editing that one file, so treat it as the interface it is:
[decision 20260728T205626](../../docs/decisions/20260728T205626-declarative-level-table.md).
The table says *what* a level is and never *which* pieces - the cast is still
dealt at random from the shapes on offer when the puzzle starts (`dealPieces`),
which is what keeps `?seed=` replaying a level exactly while two plays of it are
otherwise different.

Retuning the ramp is a table edit and nothing else. Adding a level means adding a
record; the layout follows, because nothing downstream knows a level count.

## The kind registry

A level names the kind it wants by id. `resolveLevel` in `src/kinds/registry.ts`
looks that id up, and most of them are not there yet: sliced animals, jigsaws,
polygon shapes, shatter and cause-and-effect play are each still to be built. A
level whose kind is missing is played by **shape-match** instead, at a piece
count that follows its chapter rather than the missing kind's own numbers, so the
ramp keeps climbing and the level is a real, finishable level. The stand-in is
deliberately visible: `resolveLevel` returns `standIn: true` and the board's
`data-kind` says which kind is actually playing. See
[decision 20260728T205627](../../docs/decisions/20260728T205627-unbuilt-kinds-play-as-stand-ins.md).

Building a kind is one call - `registerKind(myKind)` at the bottom of the kind's
own module - and the levels that named it start playing it. Do not edit `LEVELS`
to switch a kind on, and do not remove the stand-in until every id in
`PuzzleKindId` is registered.

## Layout

Everything about a board is *composed* for the cast that was dealt:
`buildLayout(id, level, pieces)` takes any number of pieces and works out how
many stand on each ground line, how many wait in each tray row, and how big a
slot they are all drawn to fit inside. There is no table of coordinates to keep
in step with anything, and nothing to add when a level wants a piece count no
level has asked for before. `buildLevelLayout` is the same thing with the level's
own numbers checked against the cast first.

The composition is expressed as fractions of a slot rather than as positions
(`COMPOSITION` in `src/layout.ts`), so the whole board scales together: a busier
level gets smaller pieces, and its margins, gaps and tufts shrink with them
instead of crowding the pieces out. It runs in four steps:

1. split the cast into scene rows and tray rows, every way worth trying, and for
   each split work out the largest slot that still fits the canvas;
2. take the biggest, preferring the split that suits the canvas's shape among
   those within `sizeTolerance` of it, and refuse the cast outright if the best
   is below `minSlot` rather than laying out pieces too small to grab;
3. give each scene row room for the worst reach above and below the line among
   the pieces *dealt into it* - `reach()` measures each piece from its own
   anchor - so a giraffe's row is deeper than a row of turtles;
4. spend what height is left on sky and on the gaps between rows, then read the
   horizon, the grass band and the tray line off the result.

Steps 3 and 4 are why layouts are built when a puzzle starts rather than up
front: a hole's height depends on the anchor of whichever piece was dealt into
that place. Generating the layouts rather than declaring them is
[decision 20260727T072917](../../docs/decisions/20260727T072917-generated-layouts.md); composing them
for any cast rather than from a table is
[decision 20260728T115938](../../docs/decisions/20260728T115938-composed-layouts.md).

Because room is left for each invariant *before* a size is picked, the
invariants hold by construction rather than by tuning: a hole cannot land off
canvas or under the tray, two snap zones cannot overlap, and two tray slots
cannot collide. `layout.groundLines` says where the lines came out, which is
what the tests measure a standing piece against.

`slotSize` is a square, but a piece need not be. Each piece in play gets its own
`PieceBox` - `boxOf(layout, piece)` - holding the scale from its authored box to
logical units, the bounds that produces, and its own snap radius. A piece is
scaled by its *longer* side, so a plank or a pole still fits the slot it was
composed into, and is then centred across it. Measure a piece with its
`PieceBox`, never with `slotSize`: clamping a wide piece as though it were square
would let it hang off the canvas on one axis and lock it out of reach on the
other.

`spreadX` spaces each row evenly across the canvas, and each snap radius follows
that piece's own smaller side, so a busier level automatically gets tighter, more
accurate snapping instead of overlapping snap zones. Pieces shrink as the board
fills up along the ramp, which is
what lets six animals share a single row and still leaves every piece well over a
tenth of the canvas wide - the size a small hand needs.

The snap radius stays deliberately generous, about two thirds of the piece it
belongs to; [decision 20260727T072917](../../docs/decisions/20260727T072917-generous-snap-radius.md)
explains why tightening it is not a cleanup. A level's `snapForgiveness`
multiplies it, between `MIN_SNAP_FORGIVENESS` and `MAX_SNAP_FORGIVENESS`, so the
earliest levels are wildly generous and the last ones merely generous. It is a
multiplier rather than a radius so that no level can be less forgiving than the
floor `SNAP_FRACTION` sets, and the layout tests sweep every count at the most
forgiving value in the table - which is what keeps two snap zones apart at the
top of the range.

## Orientation

The puzzle reflows rather than merely shrinking. Landscape puts the animals in
one row with the tray beneath; portrait uses shallower rows and spends the saved
width on a taller tray. Letterboxing a landscape canvas into an upright phone
would leave the pieces too small to grab, so `chooseLayout()` picks by aspect
ratio. Rotating the device mid-puzzle rebuilds the board but keeps progress.

The background landscape is generated from the layout (`src/scenery.ts`) rather
than being a fixed-size image, so every level and both orientations share one
piece of art.

## Rules for changing layout

Tune `COMPOSITION`, not the output. Every number in it is a fraction of a slot
or of the canvas, and several of them are load-bearing: `columnGap` and `rowGap`
are what hold two snap zones apart, `footRoom` is what keeps a hole clear of the
tray, and `minSlot` is what keeps a piece grabbable. Reaching past them to nudge
a coordinate would move a piece without moving the room left for it.

All layout tunables belong in `src/layout.ts`. Start there rather than
scattering a constant into whichever file happened to need it.

A piece stands on its shape's `anchor`, which for an animal comes from
`FOOT_LEVEL` in `src/assets.ts`. Those values come from `npm run art:check`
output; do not estimate them by eye or adjust them until the animal merely looks
close. See [`art.instructions.md`](art.instructions.md).

The layout tests are properties rather than expected coordinates. Every promise
in `PROMISES` (`tests/puzzle.test.ts`) is checked against every piece count a
level could ask for, in both orientations, over random casts of animals and of
pieces of no particular shape:

- every piece has a target, a box and a tray slot;
- every piece fits the slot it was dealt into, whatever its proportions;
- targets stay on canvas and clear of the tray;
- every piece stands on one of the layout's ground lines;
- snap zones never reach each other;
- tray slots stay in the tray, never collide, and never sit in a target's snap
  zone;
- pieces stay grabbable - over a tenth of the canvas wide;
- each orientation fills at least 75% of its viewport.

A layout change must leave every one of those properties standing. Between them
they keep a piece grabbable, reachable and unambiguous, so weakening one is a
change to the game rather than to the layout.
