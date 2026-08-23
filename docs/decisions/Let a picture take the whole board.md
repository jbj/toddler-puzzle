# Let a picture take the whole board

## Context

Some kinds of puzzle cut one picture into pieces rather than dealing separate
animals. Composing that kind of board the same way as the animal kinds - a
landscape scene behind a tray of equally sized pieces - wastes the one thing
this kind of puzzle needs most: room for the picture. A cut-up picture is
already a scene on its own, so drawing it inside a second landscape makes it a
postcard held up in a field. And because the pieces of a cut-up picture tile
the picture exactly, a tray holding all of them at landing size needs as much
room as the picture itself, which caps the picture at a fraction of the board
however the tray is shaped.

The one assumption worth questioning is that a piece must wait at the size it
lands at. That rule matters for an animal: waiting small and landing large
would ask a child to match by shape and rescale at once. It does not matter
for a piece of a picture. A jigsaw or shard piece has no hole of its own sized
to it - every piece of one picture aims at the same place - and the board
already shows where it goes, so a piece that grows a little when it is picked
up costs the puzzle nothing.

## Decision

The kinds that cut one picture into pieces are composed on flat colour, with
no sky, horizon or ground band. The tray is planned first, from what a piece
needs to be worth grabbing, and the picture takes whatever room is left,
centred and as large as its aspect ratio allows.

A waiting piece may be drawn smaller than it lands, down to a floor kept in
code, so the tray costs the picture less room than the pieces would need at
full size. The shrink is about a piece's own drawn ink, not its box, so a
piece grows in place under the finger when it is picked up rather than
jumping. The tray band itself is measured against the size of what actually
stands in it, not against the size of the hole a piece will eventually fill,
so it never asks for more room than its pieces need.

Puzzles that build a picture out of separate shaped pieces, each matched to
its own shadow, are unaffected: they keep the landscape scene and equally
sized pieces, because each of their pieces already has a target of its own to
be sized against.

## Consequence

A cut-up picture reads as the point of the board rather than an object placed
in a diorama, and it can grow close to the full size the canvas allows. The
tray still reads as a shelf of things waiting - the band and its lip are
unchanged - there is just no scenery behind it.

Layout tests hold the tray to the size of what stands in it, and keep the
picture growing until either it reaches the edge of the room the tray left
it, or the waiting-piece floor is holding it back - so a board where neither
is true is a board that has quietly stopped using the room it has.
