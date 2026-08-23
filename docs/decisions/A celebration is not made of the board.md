# A celebration is not made of the board

## Context

A finished puzzle stays on screen under its celebration, because the child
just built it and wants to look at it. A celebration whose imagery is drawn
from the same subject matter as the board can collide with what is still
showing there - two copies of the same animal on one screen, one still and
one moving, reads as confusing rather than delightful, and is most visible in
a cramped portrait layout where the animals are close together.

Changing what the board does while such a celebration plays - fading the
finished puzzle, clearing it away, or confining the celebration to whichever
part of the board happens to be empty - all take away the thing the child
just built at the moment they are proudest of it, or need a different empty
area in every layout. None of that addresses the actual problem, which is not
the board and not any one celebration, but the pairing: a celebration made of
the board's own subject matter, hung on a chapter whose boards guarantee a
collision.

## Decision

**A celebration is never made of what the finished board is made of.**

A celebration whose cast could repeat the board's own subject is paired only
with chapters whose levels cannot hold that subject, so the exact collision
cannot occur by construction. A test fails if a chapter whose levels deal
that subject is ever paired with such a celebration.

That pairing is not sufficient on its own - being hung on the right chapter
prevents the *guaranteed* collision but not every possible one, so the
celebration's own cast is also dealt to exclude anything currently on the
board: it is drawn from the game's whole roster with the level's own random,
with anything whose match is on the board dropped first. That makes the
collision impossible rather than merely unlikely, and means a future retune
of which levels sit in which chapter cannot quietly recreate the problem,
because the exclusion travels with the celebration rather than with whatever
chapter it happens to be paired with.

## Consequences

- The rule is written into `docs/navigation.md`, as the first thing to check
  before pairing a new celebration with a chapter - and the reason every
  celebration whose pairing is unconstrained is made of paper and air rather
  than of animals.
- `tests/celebration.test.ts` enforces the chapter pairing directly.
- `npm run shot` checks the pairing visually, in both orientations, since
  portrait is where a collision is most visible.
