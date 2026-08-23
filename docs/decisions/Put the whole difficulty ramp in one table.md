# Put the whole difficulty ramp in one table

## Context

Several kinds of puzzle share a single difficulty ramp, and a level is more
than a piece count: it has a kind, sometimes a theme, a number of things to
fill and a number of pieces to fill them with (not always the same count,
since one animal can be cut into slices), and how forgiving the snapping is.
Spread across the code, those would be several separate places to look at to
answer "is this level harder than the last one", and no single place to see
the shape of the curve.

## Decision

`LEVELS` in `src/levels.ts` is a table of level records, and it is the only
place the ramp is described. Nothing else in the codebase decides how hard
anything is: the host reads a level's record and hands the numbers on.

The table says *what* a level is - which kind, how many pieces, how forgiving -
and never *which* pieces. Which animals turn up is dealt at random when the
puzzle starts, from a seeded generator, so a given seed replays a level exactly
while two ordinary runs of the same level are otherwise different. That split
is why dealing pieces stays separate from the table that describes them.

## Consequence

A level's shape is readable at a glance and reviewable as a diff. Retuning one
chapter changes a handful of records and nothing else.

The table asserts its own ramp in tests: forgiveness never rises as the levels
go on, a chapter's boards never shrink as it goes, and every level's numbers
are ones the layout composition can actually honour. Those assertions are
about the *shape* of the curve, not its exact values, so retuning does not
mean rewriting the tests - but making the game suddenly harder in the middle
does, on purpose.
