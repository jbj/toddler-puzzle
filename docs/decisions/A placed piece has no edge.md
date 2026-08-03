# A placed piece has no edge

## Context

Three of the six kinds hand a child one drawing in several pieces: an animal in
slices (levels 11-15 and 27), a picture in jigsaw pieces (21-24, 29, 30) and the
same pictures in shards (26, 28). Every one of those pieces is drawn with its
cut edge picked out in white, so a quarter of a cow in the tray reads as a piece
of something rather than as a smudge of one.

Those lines used to stay. A finished farmyard was a farmyard with a white grid
over it, and a reassembled duck was a duck with three white scars, which is the
one moment in the level the child has been working towards and the one moment
the drawing is not allowed to be itself. The edge is an instruction, and an
instruction that outstays the job it was for is clutter.

Taking it away is one line of CSS, and it uncovered the reason the line had been
useful for more than reading: **two neighbours clipped to exactly the same path
do not meet.** Each of them paints the boundary pixel at partial coverage, so
whatever is behind them - the dimmed guide while the picture is half-built, the
open sky once it is not - shows through as a pale hairline down every join. A
white cut edge hid it completely. With the edge gone it was the only thing left
to see, and a pale grid over the finished picture is what the change was meant
to remove.

## Decision

**A cut edge belongs to a loose piece.** It is drawn while the piece is in the
tray or under a finger, and fades out over the settle as the piece goes home:
`.piece.is-placed .cut` in `style.css`, on the `cut` class that `cut.ts` puts on
every edge it draws. Nothing else changes - the edge is as bright as it ever was
in the tray, which is where it is doing its job.

**A finished drawing overlaps its own joins by a hair.** `cut.ts` gives every
piece two clips: the cell it was cut with, and the same cell nudged `overlap`
each way, which is about a pixel wider all round. A piece wears the cut it was
made with while there is still a gap in the drawing, and switches to the wider
one the moment the drawing is whole - `.cut-art` in `style.css`, keyed off the
`is-complete` the host puts on the stage as the last piece lands. Neighbours
then overlap instead of meeting, and the joins have nothing to see through.

Switched rather than simply left wide, because the wider clip is only free once
the drawing is finished. A piece in the tray would show a sliver of its
neighbour's drawing outside its own white edge, and a piece placed early would
spill over the empty cell beside it. It costs nothing to wait: while the picture
is being built, what shows through a join is the guide underneath, which is the
same picture dimmed. The guide goes when the last piece lands, and that is the
moment - the only moment - a join has the open sky behind it.

Landed, and not merely accepted. The last piece is still sliding home when the
puzzle counts itself finished, and a piece an inch from where it belongs is a
piece with that sliver hanging off it in plain view. So a piece that is still
moving keeps the clip it was cut with, and swaps when it stops - by which time
it is exactly where its neighbours already are, and the overlap has nowhere to
show.

The overlap cannot show, and that is a property of how this game cuts things up
rather than luck. Every piece of one drawing *is* that drawing, seen through a
different window, laid out at one scale and one origin
([Slices are clipped, not cut](<Slices are clipped, not cut.md>)). The pixels
two neighbours argue over are therefore the same pixels, and it makes no
difference which of them wins.

**How wide is measured, not guessed, and it is not the same for both.** A
picture is drawn in flat opaque colour and laid out at about three quarters of
its drawn size, so `PICTURE_OVERLAP` is 5 units: at 3 the seam was still there
and at 4 it was gone, and a wide band of a scene painted twice is that scene
painted twice. An animal is not so lucky - a wing, an ear and a snout are
painted translucent over the body - so anything two slices both draw is darker
than the drawing, and `SLICE_OVERLAP` is held to 1.5. A slice is drawn at nearer
its own size, so a hair is enough; at 3 the seam is gone and a dark band has
taken its place.

## Consequence

A finished picture is a picture, and a reassembled animal is an animal. The
half-built board is unchanged in the way that matters - every piece still
waiting has its edge, every piece in the tray has its edge, and every piece is
still clipped to exactly the line it was cut along - and the parts already in
place lose their white lines as they land, so the drawing gathers itself up
piece by piece and closes over its own joins at the end.

Two things now look like sloppiness and are not, which is why they are written
down here and in `cut.ts`. The nudged copies in the clip are not a fudge to be
tidied away, and neither overlap is a fudge factor to be driven to zero or
merged into one number: they were measured against the drawings they are for,
and the failures they prevent are subtle enough - a pale hairline, or a dark
one - to survive a review. `shot.mjs` checks both halves on a real finished
board, because a screenshot is the only place either can be seen.

The rule is the same for pieces cut from an animal and pieces cut from a scene,
so it lives in one file rather than in both cutters. `cut.ts` also owns the cut
edge itself, so the width and opacity of a join, the class the fade keys off,
and the overlap that makes the fade safe are read in one place.

Whole animals, the shapes a polygon picture is built from, and the levels played
by touching are all untouched: none of them draws a cut edge, because none of
them is a piece of a bigger drawing.
