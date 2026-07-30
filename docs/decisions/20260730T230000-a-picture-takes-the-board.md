# 20260730T230000. Let a picture take the whole board

## Context

[Decision 20260730T093000](20260730T093000-a-lone-picture-stands-its-pieces-in-the-gutters.md)
stood a lone picture's pieces in the gutters and nearly doubled the picture's
area. It was still small. Measured on a 1000x700 landscape canvas, the assembled
picture covered between 9.7% and 16.2% of the board, and it covered it while
standing in a field, under a sky, with a sun and two clouds behind it.

Two separate things were wrong, and only one of them is arithmetic.

**The landscape is for animals.** The hills, the grass and the sky exist so that
a cow has somewhere to stand. A jigsaw of a farmyard is *already* a scene: it
has its own sky in it. Drawing it inside a second sky makes it a postcard held
up in a field, and the frame around it is not decoration but the several hundred
units of canvas the picture was not allowed to have.

**The tray costs the picture its own area.** This is the part that cannot be
tuned away. The pieces of a cut-up picture *tile* it: their areas sum exactly to
the picture's. So a tray holding all of them at the size they land at needs as
much room as the picture does, and the picture can never exceed about half the
board however the tray is shaped - a third, once margins, the ground line and
the room under the buttons are paid for. Every candidate fix inside that
arithmetic is a floor being lowered: less sky, tighter gaps, a smaller foot
room. The one place there is real slack is the assumption nobody had written
down, which is that **a piece waits at the size it lands**.

That assumption is load-bearing for an animal. A cow drawn small in the tray and
large in its hole would be two cows, and the game would be asking a two-year-old
to match by shape *and* to rescale. It is not load-bearing for a piece of a
picture. A jigsaw piece has no hole of its own to be matched to - every piece of
one picture aims at the same origin - and there is a whole guide showing where
it goes. Nothing about the puzzle is harder because the piece grew a little when
it was picked up.

## Decision

The two kinds that cut one picture up - `jigsaw` and `shatter` - are composed by
their own path, `arrangePicture` in `src/layout.ts`, and are drawn on flat
colour.

**The picture takes everything the tray leaves.** The tray is planned first,
from what a piece needs to be worth grabbing; whatever room is left is the
scene, and the picture is centred in it as large as its aspect ratio allows.
There is no sky share, no horizon fraction and no ground band: `layout.bands`
and `layout.decorLines` are empty, and `pictureBackdrop` paints the canvas in
`PICTURE_BACKDROP` - which is `--board-blue`, the variable the page's own
background is painted with, rather than a second copy of the colour - with the
tray on top of it. Whatever the aspect ratio does not reach reads as the page,
and the letterbox at the edge of the canvas has no seam in it.

The one thing kept clear is `COMPOSITION.pictureMargin`, 2.2% of the canvas's
shorter side on every side. It costs about three per cent of the picture, and
without it the picture's own white border sits half over the tray's lip and hard
against the bottom of the screen, which reads as tucked under the shelf rather
than as standing on the board.

**A piece may wait smaller than it lands, and never below two thirds on each
axis.** `COMPOSITION.minWaitingScale` is 2/3, and `Layout.waitingScale` is what
the board came out at. Two thirds on each axis is four ninths of the area, so
the tray now costs the picture less than half of what the picture costs, which
is where the room comes from. The floor is a floor: the search maximises the
picture subject to it, so on almost every board it lands exactly on 2/3.

Three details of that are deliberate.

**The shrink is about the piece's own drawing, not its box.** A piece of a
picture carries the *whole picture's* box, so shrinking about the box corner
would swing a corner piece halfway across the board. `waitingHome(layout, piece)`
returns the corner adjusted so the ink centre stays where the tray put it, which
means a piece picked up grows in place under the finger rather than jumping.
`trayHome` is unchanged and still the full-size corner: that is what the drag
engine, the snap test and every kind talk in, and only the drawing is shrunk.

**The tray band stays.** The landscape went; the shelf did not. A band of sand
with a lip along the edge facing the scene is what says "these are waiting", and
a picture board needs that more than a landscape board does, because there is
nothing else on it. `renderTrayBands` moved out of `scenery.ts` so the two
backdrops cannot draw the shelf differently.

**Only the two cut-up kinds change.** The polygon levels (16-20) build a picture
out of *shapes*, each with a shadow of its own to be matched to, and they keep
the landscape and the equal sizes. Nothing in chapters one to four moves at all.

## Consequence

Worst of twenty-four deals, slot as a share of the canvas width - which for a
picture is the assembled picture's own width, so these are the picture:

| level | kind | landscape | | portrait | | area |
| --- | --- | --- | --- | --- | --- | --- |
| | | before | after | before | after | |
| 21/22 | jigsaw 4 | 0.336 | 0.504 | 0.517 | 0.920 | 2.25x |
| 23/24 | jigsaw 6 | 0.377 | 0.504 | 0.553 | 0.873 | 1.79x |
| 25/29 | jigsaw 9 | 0.311 | 0.500 | 0.562 | 0.864 | 2.58x |
| 26 | shatter 6 | 0.341 | 0.440 | 0.471 | 0.802 | 1.66x |
| 28 | shatter 8 | 0.262 | 0.420 | 0.491 | 0.806 | 2.57x |
| 30 | jigsaw 12 | 0.311 | 0.500 | 0.515 | 0.888 | 2.58x |

In portrait the picture now spans between four fifths and the whole of the
canvas's width. A four-piece jigsaw in portrait went from an eighth of the board
to two fifths of it.

**Two ink floors went down, and that is the trade that bought the room.** The
smallest *waiting* piece fell on the two landscape boards where the picture grew
by less than the 1.5x that exactly pays for a 2/3 shrink: levels 23/24 from
0.145 of the canvas width to 0.130, and level 26 from 0.137 to 0.122. Both are
still clear of `COMPOSITION.minPieceInk` (0.065), and on both the piece is drawn
*larger* than it ever was before the moment it is picked up. The other ten
picture boards gained on both counts - level 21's portrait ink went from 0.258
to 0.306, level 28's landscape from 0.085 to 0.092, level 30's from 0.090 to
0.096. The floors in `tests/puzzle.test.ts` are measured against the waiting
size from here on, because what a hand has to find is the piece it can see.

The guard against the picture quietly shrinking back is
`tests/picture-board.test.ts`: for every picture level in both orientations over
six deals, either the picture reaches an edge of the room the tray left it, or
the waiting scale is sitting on the 2/3 floor. A board where neither is tight is
a board that has stopped growing the picture. It is checked alongside the two
promises that make the shrink safe - that the waiting ink is exactly
`waitingScale` of the landing ink on both axes, and that it is concentric with
it, which is what makes a piece grow in place rather than jump when it is
picked up.

Nothing was taken off a floor to pay for this. `minSlot`, `minPieceInk`,
`controlRoom`, `SNAP_FRACTION` and the shatter partition's constants are exactly
where they were, and `minWaitingScale` and `pictureMargin` are new bars rather
than weakened ones. Chapters one to four are untouched: nothing outside `jigsaw`
and `shatter` reaches `arrangePicture`, and `waitingScale` is 1 on every other
board, which is `setPiecePosition` writing `scale(1)` where it used to write
nothing.
