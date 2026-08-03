# Open the game with something to touch

## Context

Level 1 used to be a single enormous animal to drag into a single enormous hole.
That is the easiest drag the game can ask for, and it was chosen so that the
first win comes quickly.

It is still a drag. Pinching a shape, holding it while moving it, and letting go
somewhere else is a chain of three things, and a one-year-old at the bottom of
this game's age range can reliably do none of them. A toy whose first screen
cannot be operated is not a gentle beginning; it is a closed door, and the child
never sees the second screen to find out that the game is for them.

Cause and effect - touch a thing, a thing happens - is the interaction a
one-year-old *does* have. It is also the one that teaches the rest: a child who
has learned that this rectangle answers a finger is a child who will try
dragging.

## Decision

Chapter 1 alternates. Levels 1, 3 and 5 are touch-only activity levels -
bubbles, peekaboo, a scene where everything answers - and levels 2 and 4 are the
smallest possible drags, one animal and then two.

The first thing a child ever sees is therefore bubbles: nothing to aim, nothing
to carry, nothing to be wrong about.

## Consequence

A kind can now be played without the drag engine. `PuzzleKind` gained an
optional `play()` hook, and the host skips building tray pieces and starting the
drag engine for a kind that implements it. `isComplete` was already part of the
contract, which is what made this possible without a second host: an activity
level finishes when enough things have been touched, not when a tray is empty -
and, since [Ask a touch level for a handful, and let the child out
anyway](<Ask a touch level for a handful, and let the child out anyway.md>),
after ten seconds however little was touched.

The chapter is one level longer in feel than it is in count, because a touch
level is over in well under a minute. That is the intent - the point of the
opening five is that a child reaches the end of them.

The ramp still only climbs: chapter 1 deals 1, 1, 2, 2 and 3 animals, and
forgiveness still only eases. An activity level is dealt a cast like any other
level even when it does not draw one, because the layout is composed around a
cast and the ramp reads the table's piece count.
