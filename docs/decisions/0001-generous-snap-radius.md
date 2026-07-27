# 0001. Keep snapping generous and owned

## Context

Animal Puzzle is used by a two-year-old. The one thing a toddler certainly has
is imprecise movement, especially when a finger covers part of the thing being
dragged.

If any animal could snap into any nearby hole, the game would need a way to say
"wrong" after placement. That makes the puzzle less forgiving and creates a
failure state the rest of the game avoids.

## Decision

The snap radius stays generous, about two thirds of a piece. A piece only ever
snaps into its own hole.

## Consequence

Near misses feel like success. A bad drop simply drifts back to the tray with a
soft warm tone, and it is impossible to solve a stage wrongly.

Layout changes must keep snap zones apart so this generosity does not create
ambiguous drops.
