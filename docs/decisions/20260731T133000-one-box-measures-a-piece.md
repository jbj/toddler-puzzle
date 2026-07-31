# 20260731T133000. One box measures a piece, and one rule places it

## Context

Six kinds of puzzle, and five different answers to "is that close enough?".

Every kind decided a drop for itself. Shape-match measured the distance between
two box centres against a circle of two thirds of the piece's *narrower* side. A
sliced animal used the same circle but around the whole animal's hole, so any
slice dropped anywhere on its animal went home. A picture's parts, a jigsaw's
pieces and a shatter's shards measured the same circle around what the piece
draws.

Played one after another, the difference was the thing you noticed. A tangram
wedge was fiddly to place and a quarter of a duck placed itself: the game got
looser exactly where it should have got tighter, and tighter on the pieces that
were hardest to aim.

The circle is why. Sized by a shape's *narrow* side, it punishes a narrow shape
twice - a long thin roof is hard to hold and hard to aim, and it was given the
least room to aim at. A radius that fits the short side of a plank is a fraction
of its length, so the piece has to be placed almost exactly along the axis it is
hardest to be exact on. Meanwhile the same rule around a whole animal's box
handed a slice a target the size of the animal.

The grab box had drifted apart from all of this as well. A piece could be picked
up by a rectangle around its artwork, but the tray reserved a cell from the
drawing alone - so two waiting slices could have overlapping grab areas, and
which one moved was whichever happened to be drawn on top.

## Decision

One box per piece, and one rule that uses it.

**The box** (`gripOf` in `src/piece.ts`) is what the piece draws, given a margin,
then *thickened* so that neither side is less than half the other. The margin is
a share of the drawing rather than of the authored box - a twelfth of a jigsaw
keeps the whole picture's box, and measured from that it would be given a margin
a third of its own size - and it never leaves the authored box, so an animal
drawn to its own edges gets none and needs none. Thickening is symmetric about
the drawing's centre, so the box's centre is always the drawing's centre, which
is the point the game already sparkles on.

**The rule** (`onTarget` in `src/layout.ts`) is that a drop is taken when the
piece's box, put where the finger let go, covers the middle of where that piece
belongs. Nothing else. A kind says *where* a piece belongs - `target` already
did - and says nothing at all about geometry: every `accepts` in `src/kinds/` is
now one call.

**The same box everywhere.** It is what a piece can be grabbed by, what holds it
on the canvas, what the tray cuts a cell from, and what decides a drop. A level's
`snapForgiveness` grows it about its centre, between 1.0 and 1.5, so the early
chapters' extra generosity survives unchanged.

## Consequence

Forgiveness reads the same in every kind, and it is easy to say out loud: **half
a piece out, on either axis, is in.**

A thin piece is no longer punished twice. A plank that is eight times as long as
it is deep is aimed at a box half as deep as it is long, which is about the
accuracy a square piece of the same length asks for.

A slice is a piece like any other. It now aims at its own place inside the
animal rather than at the animal, which is the step up the sliced chapter always
meant to be - and it costs no new bookkeeping, because a slice already carries
the animal's box and scale, so its own place *is* its box's centre at the hole's
origin. Cut into two or three the halves overlap so much that a drop on a
neighbour's place is still a near miss and still lands in the piece's own place;
cut into four, the far side of the animal is out of reach.

The tray reserves what a hand reaches for. Cells are packed from the same box, so
two waiting pieces' grab areas cannot overlap - which is what the old clamp of
the grab box inside the authored box was quietly doing, and it did nothing at all
for a piece smaller than its box.

It was not free. Thickening a thin part makes its tray cell fatter, and the
tangram level with the most parts stands its picture about 2% smaller than it
did; the floors in `how big the board gets` were lowered by that much and no
more. Every other level's board came back to where it was, once the margin was
measured from the drawing rather than from the box around it.

Two things to know before arguing with this. The centre of the box is
load-bearing: thicken or pad about anything else and the target moves away from
the drawing. And the invariant that one target's reach never covers another's is
asked by laying one piece's *drawing* squarely over another's, not by comparing
the top-lefts of two holes - two pieces of different sizes have their boxes in
different places inside them, and comparing origins compares nothing a child can
see.

Superseded nothing, and changed the measure rather than the promise in
[20260727T072917-generous-snap-radius](20260727T072917-generous-snap-radius.md)
and
[20260728T120732-grab-anywhere-in-the-piece-box](20260728T120732-grab-anywhere-in-the-piece-box.md).
