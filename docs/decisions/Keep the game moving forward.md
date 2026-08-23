# Keep the game moving forward

## Context

A two-year-old cannot read a menu, compare difficulty choices, or recover from
a configuration screen. A grown-up should also be able to hand over the toy
without setting it up. The game already has a natural progression that grows
harder as it goes, giving a quick first win and letting the challenge build as
the child keeps playing.

## Decision

There is no menu and no difficulty picker on the child's play surface. Levels
are always played in the same order, and the last one loops back to the
first.

## Consequence

The only way through the child's game is forward. The chapter dots are an
indicator for a grown-up, not a control, and the play surface should not gain
settings, scores, or a failure state.

A grown-up does have a door of their own into settings and progress: see
[Put the settings behind a deliberate
hold](<Put the settings behind a deliberate hold.md>). That door is aimed at
the reader this decision was never about; the child's play surface stays
exactly as described above.
