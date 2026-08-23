# Keep snapping generous and owned

## Context

Animal Puzzle is used by a two-year-old. The one thing a toddler certainly has
is imprecise movement, especially when a finger covers part of the thing being
dragged.

If any piece could snap into any nearby hole, the game would need a way to say
"wrong" after placement. That makes the puzzle less forgiving and creates a
failure state the rest of the game avoids.

## Decision

The snap radius stays generous. A piece only ever snaps into its own hole.

## Consequence

Near misses feel like success. A bad drop simply drifts back to the tray with a
soft warm tone, and it is impossible to solve a stage wrongly.

Layout changes must keep one target's reach off another's so this generosity
does not create ambiguous drops.

See [One box measures a piece, and one rule places
it](<One box measures a piece, and one rule places it.md>) for how this
generosity is measured.
