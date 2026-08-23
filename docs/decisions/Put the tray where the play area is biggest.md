# Put the tray where the play area is biggest

## Context

The canvas is whatever shape the screen is, from tall portrait to wide
landscape, so composition has to decide, for every board, whether waiting
pieces stand in a band across the top or in columns down both sides. The
placement that actually matters is whichever leaves more board to play on -
not whichever wins a narrow special case, such as a rule that only considers
a side tray for a scene with a single target. A rule that answers a
different, narrower question than "how much board is left to play on" can
choose the wrong side as a screen's shape changes.

## Decision

Both placements - top and sides - are scored by the best puzzle size each can
reach and by how much board they leave to play on, and one rule chooses
between them for every kind of board: the top wins unless the sides can draw
a markedly bigger puzzle, or - when the puzzle is already as big as either
placement can make it - the sides leave markedly more room to play on. The
top is the default because it is the easier drag direction for a small arm,
and because a child who has learned where pieces wait should not find them
moved for a marginal gain.

A side tray may stand more than one column on each side, always the same
number on both sides so the scene keeps the middle, because a side tray
capped at one column per side starves a wide, short canvas of the depth it
needs.

The sizing search that makes this decision lives in its own module, working
over plain sizes with no drawing concerns of its own, so the rule is
something that can be stated and tested directly rather than a condition
buried inside the composer's coordinate placement.

## Consequence

A board's tray moves to whichever side actually has more board to offer,
judged the same way for every kind of puzzle.

This rule only decides which of the two placements is chosen; it leaves
every one of the composition's other floors untouched.
