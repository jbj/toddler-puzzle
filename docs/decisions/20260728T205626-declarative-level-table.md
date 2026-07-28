# 20260728T205626. Put the whole difficulty ramp in one table

## Context

The game used to be five stages, and the whole of its difficulty curve was one
array of piece counts: `STAGE_SIZES = [2, 3, 4, 5, 6]`. That was enough while
there was one kind of puzzle and one thing that varied.

Thirty levels across several kinds of puzzle is not enough for an array. A level
now has a kind, sometimes a theme, a number of things to fill and a number of
pieces to fill them with (not the same number once one animal is cut into
slices), and how forgiving the snapping is. Spread across the code, those would
be five separate places to look at to answer "is level 14 harder than level 13",
and no place at all to see the shape of the curve.

## Decision

`LEVELS` in `src/levels.ts` is a table of thirty records, one per level, and it
is the only place the ramp is described. Nothing else in the codebase decides how
hard anything is: the host reads a level's record and hands the numbers on.

The table says *what* a level is - which kind, how many pieces, how forgiving -
and never *which* pieces. Which animals turn up is still dealt at random when the
puzzle starts, from the same seeded generator as before, so `?seed=` replays a
level exactly and two runs of the same level are otherwise different. That split
is the reason `dealPieces` lives next to the table rather than inside it.

Tuning the game is editing this one file. That is the point of it, so the file
carries the tests that keep the curve honest with it: forgiveness never rises as
the levels go on, a chapter's boards never shrink as it goes, and every level's
numbers are ones the layout composition can actually honour.

## Consequence

A level's shape is readable at a glance and reviewable as a diff. Somebody
retuning chapter 3 changes five records and nothing else.

The table asserts its own ramp in `tests/levels.test.ts`. Those assertions are
about the *shape* of the curve, not its exact values, so retuning does not mean
rewriting the tests - but making the game suddenly harder in the middle does, on
purpose.

The table names kinds of puzzle that are not built yet. What happens then is
[20260728T205627](20260728T205627-unbuilt-kinds-play-as-stand-ins.md).
