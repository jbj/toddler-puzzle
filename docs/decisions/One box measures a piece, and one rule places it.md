# One box measures a piece, and one rule places it

## Context

If different kinds of puzzle each size their own idea of "close enough" for
a drop, a narrow piece can be punished twice over: hard to hold, and judged
against a target no bigger than its own narrowest side. A piece that is
really just part of a whole animal can, by the same kind of rule, be judged
against a target as big as the whole animal - far more forgiving than any
other piece in the game. And if the box a piece can be grabbed by is allowed
to drift from the box the tray reserves a cell for, two waiting pieces' grab
areas can overlap, so whichever is drawn on top is the one that actually
moves.

## Decision

Every piece has one box: what the piece actually draws, given a margin, then
thickened so it is never much narrower on one axis than the other.
Thickening keeps the box centred on the drawing's own centre rather than on
the piece's authored bounds, so a piece drawn smaller than its own box is
judged by where it visibly sits rather than by an empty frame around it.

One rule uses that box everywhere a drop is judged: a drop is accepted when
the piece's box, placed where the finger let go, covers the middle of where
the piece belongs. A kind of puzzle only ever has to say *where* a piece
belongs; it says nothing about geometry. The same box is also what a piece
can be grabbed by, what the tray reserves a cell for, and what a level's
forgiveness setting scales about its centre.

An animal's box is measured from what the animal actually draws, the same
as every other piece, rather than assumed to fill the box it happens to be
authored in - no animal fills its own authored box, so treating that box as
the drawn box would make its reach far larger than the animal itself. The
measured boxes are committed and checked against a fresh rasterisation of
each animal, so a redrawn animal cannot silently keep a stale box.

## Consequence

Forgiveness reads the same for every kind, judged by one consistent rule
rather than a different one per kind. Thickening keeps a narrow piece's box
close to square, so its target is not limited by its own narrowest
dimension. A slice of an animal aims at its own place within the animal
rather than at the whole animal, matching the accuracy every other piece in
the game is judged by.

The tray reserves exactly what a hand can reach for, since a waiting
piece's cell is packed from the same box that decides its grab area and its
drop.

Two things to know before arguing with this. The box's centre has to stay
the drawing's own centre - thickening or padding about anything else pulls
the target away from what the child actually sees. And "one target's reach
never covers another's" is checked by comparing pieces' drawn extents
directly, not by comparing the positions of two authored boxes, because two
differently sized pieces keep their box in different places within their
own artwork.

See [Grab a piece anywhere in the box around its
artwork](<Grab a piece anywhere in the box around its artwork.md>) for how a
piece is picked up, and [Keep snapping generous and
owned](<Keep snapping generous and owned.md>) for why the forgiveness this
box measures is generous in the first place.
