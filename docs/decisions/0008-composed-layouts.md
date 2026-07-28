# 0008. Compose layouts for any cast, rather than tabulating them

Extends [0004](0004-generated-layouts.md).

## Context

0004 settled that layouts are built when a puzzle starts, because a hole's
height depends on the foot level of whichever animal was dealt into it. What it
left behind was a table: for each of the three stages, in each of the two
orientations, an arrangement gave the row counts, the ground lines, the tray
rows and the slot size. Six hand-tuned entries.

The table was tuned, and it was good - the pieces were large, they stood on a
line of ground with the tray a comfortable strip beneath, and the sky was worth
looking at. It was also a wall. Nothing composed a board of five, or of nine;
adding one meant sitting down with a pencil, and every entry had to be checked
by eye against invariants that only the tests knew about. The thirty-level plan
wants counts the table does not have.

The obvious replacement is a rectangle packer: fit *n* boxes into the space and
be done. That would have been worse than the table. What made the hand-tuned
compositions good was not that the pieces fitted; it was the ground line the
animals stand on, and the ramp that keeps a full board's pieces big enough to
grab.

## Decision

Compose a layout for whatever cast it is given, from fractions rather than
coordinates.

`COMPOSITION` in `src/layout.ts` holds the composition as shares of a slot: the
margin at the end of a row, the gap between two of them, the room below the last
row's feet, the padding around the tray, the least sky worth keeping and the
most worth having. A layout is then arithmetic: split the cast into scene rows
and tray rows, take the split that yields the largest slot, size each row from
how far the pieces *dealt into it* reach above and below their own anchors, and
spend the height left over on sky and on the gaps.

Two things are kept deliberately, because they are what the tuning was for. The
ground line survives as a first-class idea - rows have lines, pieces stand on
them, and `layout.groundLines` says where they came out. The size ramp survives
as a consequence: a slot is as large as the composition can make it, so pieces
shrink only as the board fills, and a composition that cannot keep every piece
above `minSlot` refuses the cast instead of laying out pieces no toddler could
pick up.

## Consequence

Any piece count composes, in either orientation, without anyone drawing a new
arrangement - so a level table can ask for counts nobody has laid out yet.

The invariants hold by construction rather than by tuning. Room for each of them
is reserved before a size is chosen, so a hole cannot land off canvas or under
the tray, two snap zones cannot overlap, and two tray slots cannot collide. The
tests changed shape to match: they check the promises against every count in
both orientations over random casts, instead of reading the coordinates of six
arrangements.

There is no longer a coordinate to nudge. Moving a piece means moving the share
that put it there, which moves the room left for it too. That is the point, but
it does mean a visual tweak is an argument with `COMPOSITION` rather than a
one-line edit, and the composed numbers will not always match the old table to
the unit.
