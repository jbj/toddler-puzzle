# A placed piece has no edge

## Context

Several kinds hand a child one drawing broken into several pieces, and each
piece draws its cut edge picked out so a fragment in the tray reads as part
of something rather than as a random shape. Left showing after the piece is
placed, that same edge turns a finished picture into a picture with a grid of
lines over it - the one moment the child has been working towards, and the
one moment the drawing should be allowed to be itself.

Simply hiding the edge on a placed piece is not enough by itself: two
neighbouring pieces clipped to exactly the same boundary each paint that
boundary at partial coverage, so whatever shows through behind them - the
open background, once the edge no longer masks it - appears as a faint line
along every join. The cut edge had been hiding this rendering artefact as a
side effect, so removing the edge alone trades a visible instructional line
for a visible rendering seam.

## Decision

**A cut edge belongs to a loose piece.** It is visible while a piece is in
the tray or being dragged, and fades out as the piece settles into place.

**A finished drawing's pieces overlap their own joins by a hair.** Each piece
is clipped both to the boundary it was cut with and to a slightly wider
version of that same boundary; it wears the tighter clip while the drawing
still has gaps in it, and switches to the wider one only once the whole
drawing is complete and every piece has actually come to rest, at which point
neighbouring pieces overlap instead of merely meeting and there is nothing
left for a hairline to show through. Switching rather than always using the
wide clip matters because the wide clip is only safe once the picture behind
every join is the same finished picture - while the drawing is unfinished, a
wide clip on an early piece would let it spill into an empty neighbouring
cell.

**The overlap works because of how a picture is cut in the first place**:
every piece of one drawing is that same drawing seen through a different
clip, at one shared scale and origin (see [Slices are clipped, not
cut](<Slices are clipped, not cut.md>)), so the pixels two neighbours overlap
on are the same pixels, and it does not matter which one is drawn on top.

**How wide the overlap needs to be is measured against the artwork, not
guessed, and differs between a picture cut into rectangular pieces and an
animal cut into slices** - an animal's markings are painted with
transparency, so an overlap there has to be much narrower than a picture
drawn in flat opaque colour, or the overlap itself becomes visible as a
darker band. Both widths live as named constants in the module that also
owns the cut edge itself, so the width, the class the fade keys off, and the
overlap that makes the fade safe are read in one place.

## Consequence

A half-built board is unchanged in the way that matters - every unplaced
piece keeps its cut edge - while a finished drawing gathers itself up and
closes over its own joins as the last piece actually lands, not merely when
it is accepted. This applies equally to a picture cut into pieces and an
animal cut into slices, since both are built the same way; it does not apply
to kinds whose pieces are not fragments of one larger drawing.
