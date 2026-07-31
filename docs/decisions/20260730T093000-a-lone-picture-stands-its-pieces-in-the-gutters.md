# 20260730T093000. Stand a lone picture's pieces in the gutters

## Context

Every board the game composes had the same shape: a tray in a band across the
top, the scene beneath it. That is right for a row of animals - six holes need
the width, and the tray needs it too - and it was quietly wrong for a picture.

A picture is *one* target. It is drawn one slot across its longer side, the same
square a single cow stands in, and on a landscape canvas that leaves about two
thirds of the width empty either side of it. Meanwhile the tray band above is
paying for the whole cast in one place: its height comes off the scene's, and
its width has to hold every piece in a row or two. So the ceiling on the picture
was the tray - its width at four pieces, its height at nine - and the picture
sat in the middle of an empty board.

Measured at level 26, the six-shard shatter: the picture covered 6.3% of the
canvas, about four fifths of the board was background, and the smallest shard
cleared the 8% ink floor with nothing to spare. Every piece was legal. A piece
twice the size is twice as easy for a two-year-old to see and get a hand around,
and the tie-breaker is always the more forgiving option.

The obvious fixes are all floors. Less sky, tighter gaps, a smaller foot room, a
tighter shatter partition - each of them buys a bigger picture by taking away
something that was put there on purpose. The room that is genuinely spare is the
room a one-target scene is not using: the gutters.

## Decision

Where a scene holds **one target and more than one piece**, the layout also
plans a tray of **two columns down the sides**, the target between them, and
takes it if it is worth at least `COMPOSITION.gutterGain` (1.1) more slot than
the best shelving. `layout.trayBands` is therefore a list of rectangles with the
edge each is lipped along, not a single band with a bottom lip, and the scenery
paints whichever it is given.

Three things about that are deliberate and will read as oversights:

**A gutter tray is a candidate, not a replacement.** It is planned alongside the
shelvings and wins on the same measure they compete on. Portrait almost always
keeps its shelves - two columns down a 480-wide phone would be worse than
useless - and so does a landscape jigsaw of nine or twelve pieces, where the
columns get so deep that their own depth caps the slot below what a shelf would
give. The 1.1 bar is there so that a marginal win never rearranges the board:
a child who has learned where the pieces wait should not find them somewhere
else for a two per cent gain. 1.05 was measured and changed nothing, which is
the evidence that the bar is not doing arbitrary work.

**A tray cell belongs to a piece, not to a position.** The shelf used to be
`count` copies of the largest ink in the cast; it is now each piece's own ink,
packed. That is a fifth of a shatter's tray width, because its shards vary, and
almost nothing for a jigsaw. The consequence to know about is that the host can
no longer shuffle *slots* to deal a tray in a random order - the cell was cut
for the piece - so every kind now shuffles its own pieces. The polygon kind was
the one that did not, and does now.

**The bottom of a gutter is left empty.** `COMPOSITION.controlRoom` is 96 canvas
units, not a share of the height, because what it protects is not a share: the
reset button stands 90 units tall in the bottom left and the grown-ups button
about 60 in the bottom right, both of them inside a gutter. A piece a child
cannot reach for without pressing reset is worse than a slightly smaller piece.
This tax is real - it is why the nine- and twelve-piece jigsaws keep their
shelves in landscape - and moving the buttons out of the gutters instead is a
larger change than this one, left for later.

Nothing was taken off a floor. `COMPOSITION`'s minimums, the snap radius, the
8% minimum piece ink and the shatter partition constants are all exactly where
they were; `gutterGain` and `controlRoom` are new bars, not weakened ones.

## Consequence

Worst of twenty-four deals, landscape, slot as a share of the canvas width -
which for a picture is the assembled picture's own width:

| level | kind | pieces | before | after | area |
| --- | --- | --- | --- | --- | --- |
| 14 | sliced | 4 | 0.292 | 0.352 | 1.45x |
| 20 | polygon | 6 | 0.312 | 0.421 | 1.82x |
| 23/24 | jigsaw | 6 | 0.301 | 0.389 | 1.67x |
| 26 | shatter | 6 | 0.249 | 0.360 | 2.09x |

Chapters one and two - the shape-match and cause-and-effect levels a two-year-old
meets first - are *exactly* unchanged, to three decimal places, in both
orientations. Every animal fills its own square box, so packing a shelf by ink
gives the same shelf, and a row of animals is never one target.

Two promises in `PROMISES` had to be *reformulated*, which is worth saying
plainly because it looks like the thing this decision claims not to have done.
"A tray slot stays within the tray" was written as `slot.y + height <= sceneTop`,
which assumes the tray is a band on top; it is now "the cell lies wholly inside
one of the tray's bands", which is the same promise about a tray that can be two
columns. "A tray slot never sits in a target's snap zone" was measured from box
centre to box centre with the box's snap radius; a picture piece's *box* is the
whole picture, so a corner piece in a gutter has its box centre near the picture
centre and fails a check about a zone it is nowhere near. It is now measured ink
centre to ink centre with `inkSnapRadius`, which is what a jigsaw, shatter or
polygon piece actually snaps by. Both are strictly the question that is on the
board rather than a proxy for it.

The second of those has since been reformulated again, for the same reason and
one step further: there is no snap radius any more, and the honest form of the
question is whether one piece's drawing, laid over another's, covers where it
belongs. See
[20260731T133000-one-box-measures-a-piece](20260731T133000-one-box-measures-a-piece.md).

Two levels' worth of the win is still on the table and is deliberately left
there: a scene with several targets (the sliced levels) would gain about a fifth
from the gutters too, and the deep-column levels would gain about a quarter if
the buttons moved out of the gutters. Both are follow-ups, because both widen
the blast radius past the levels this was measured on.

The floor under all of it is `how big the board gets` in `tests/puzzle.test.ts`:
every level, both orientations, the slot share and the smallest piece's ink,
held at the measured worst of twenty-four deals shaded down three per cent. It
is a ceiling test read backwards, and it fails on nine levels if the gutters are
removed.
