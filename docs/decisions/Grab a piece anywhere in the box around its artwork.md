# Grab a piece anywhere in the box around its artwork

## Context

A piece that is pickable up only where the pointer lands on painted artwork
misses everywhere else in its bounding area - the gap between a giraffe's
legs, the notch under a duck's tail, the space beside a fish's fin. A
two-year-old aiming squarely at the animal and landing in one of those gaps
gets nothing at all, and nothing moves to explain why. That is out of step
with how forgiving the rest of the game is: a generous snap radius, a
refused drop that drifts home gently, and a piece that cannot be dragged out
of reach - forgiveness everywhere except the moment a toddler first touches
the piece.

## Decision

Every piece carries an invisible grab area covering the space around its
artwork, behind the drawing and inside the same group, so a press anywhere
in that area picks the piece up. The exact box used - how it is measured
from the artwork and how it is kept from overlapping a neighbour's - is
governed by [One box measures a piece, and one rule
places it](<One box measures a piece, and one rule places it.md>); this
record states only that the grab area is a box, not the artwork's exact
painted shape.

## Consequence

Pieces are markedly easier to pick up, and the improvement is largest for
animals with thin or spindly parts, which are exactly the ones hardest to
grab under a paint-only hit test. Placed pieces keep pointer events off, so
a finished picture still catches nothing.

An invisible rectangle with no visual effect looks like dead markup to a
later reader, and it is not: nothing else makes those empty places
grabbable, and removing it silently returns the game to hit-testing paint
only.

Anything that measures a piece element from outside - a screenshot script
computing its bounding box, for instance - now sees the grab box rather than
the artwork's own bounds.
