# Under reduced motion, a floater holds still

## Context

Everywhere else in this project, `prefers-reduced-motion` collapses an animation
to a millisecond. That is the right answer for a sparkle, a pulse or a settle:
the thing arrives where it was going to arrive, instantly, and nothing is lost
but the travel.

A balloon is not like that. Its animation is not decoration around the thing; it
*is* the thing. A balloon that goes where it was going in one millisecond has
reached the top of the screen and burst before a finger could be lifted, and the
celebration - which is nothing but balloons - is an empty sky. The same collapse
that makes a sparkle considerate makes this celebration unplayable.

Dropping the celebration under reduced motion is worse. It would mean a child
whose grown-up set an accessibility preference gets a different game, and the
first thing missing from it would be the first celebration they ever meet.

## Decision

Under `prefers-reduced-motion`, a floater in `pop.ts` does not drift at all. It
is placed somewhere in the sky and stays there, waiting to be touched. It bursts
the same way, and the burst itself still collapses to a millisecond in the usual
manner.

The balloons celebration spreads its floaters over the whole canvas when they
are still, rather than launching them from below the bottom edge, so that all of
them are in reach from the moment it is raised.

## Consequence

`releasePoppable` treats a missing `drift` and a reduced-motion preference as
the same case, so a caller does not have to know about the setting. Nothing
escapes under reduced motion, which means the top-up that replaces an escaped
balloon simply never fires; the count on screen is held by pops alone.

The rule this bends is "collapse animations to 1 ms", and it bends it in the
direction the product's tie-breaker points: whatever is more forgiving and
requires less understanding. A still balloon is easier to touch than a rising
one.
