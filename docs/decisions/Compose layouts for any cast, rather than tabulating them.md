# Compose layouts for any cast, rather than tabulating them

## Context

A hand-tuned table of layout arrangements - one per stage and orientation -
does not scale: nothing composes a board for a piece count that has no
entry, adding a count means hand-tuning a new one and checking it against
invariants only the tests know about, and a growing level table wants counts
the table does not have.

A rectangle packer that just fits boxes into the available space would be
worse: it would fit the pieces, but it would lose what made the hand-tuned
arrangements good in the first place - a shared ground line the animals
stand on, and a size ramp that keeps a full board's pieces large enough to
grab.

## Decision

Compose a layout when the stage starts, after the fresh deal and current
viewport are known. Use the cast actually dealt and fractions of a slot rather
than fixed coordinates: margins, gaps, ground clearance, tray padding, and sky
bounds are shares of slot size. A layout can then reason from each piece's
actual bounds and anchor rather than guessing before the cast exists.

Two properties remain first-class. Rows have a ground line and pieces stand
on it. A slot is made as large as the composition can afford, so pieces shrink
only as the board fills; a composition that cannot keep every piece above the
minimum pickable size refuses the cast.

## Consequence

Any piece count composes, in either orientation, without anyone drawing a
new arrangement by hand. The layout invariants - no hole off-canvas or under
the tray, no two snap zones overlapping, no two tray slots colliding - hold
by construction because room for each is reserved before a size is chosen,
rather than being checked after the fact against a fixed table.

There is no single output coordinate to nudge. A visual adjustment changes the
shared composition rule and the room reserved for neighboring pieces, which is
the point of composing rather than tabulating.
