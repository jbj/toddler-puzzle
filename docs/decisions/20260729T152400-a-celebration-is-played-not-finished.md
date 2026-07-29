# 20260729T152400. A celebration is played, and it ends by itself

## Context

Every level in this game used to end the same way: a four-note fanfare, a
700-millisecond sparkle, and one big button onwards. That is exactly right for
one level. Repeated thirty times it is the reason a thirty-level game feels like
one level played thirty times - by the twentieth, finishing has stopped meaning
anything, because the reward for finishing the twentieth is identical to the
reward for finishing the first. And after the thirtieth, the button looped
silently back to level 1, which tells a child who has just played the whole game
that nothing happened.

So the game needed a bigger moment at the end of each chapter, and a real one at
the end of the set. What "bigger" should mean is the whole question, and the
obvious answer - a longer animation - is the wrong one. A two-year-old will not
sit through a cutscene. They will put a finger on it within about a second. If
the finger does nothing, the celebration has taught them that this part of the
game is not theirs.

Three things then have to be settled, and each of them looks like an oversight
from the outside.

## Decision

**A celebration is played, not watched.** Everything in one answers a finger in
the tick the finger landed: a balloon pops, a parading animal hops and sings, a
tap paints the next arc of a rainbow or sets a firework off exactly where it
landed. There is no passive frame anywhere in any of the six. The floating and
the bursting come from `pop.ts`, shared with the bubbles of the first chapter,
so a balloon feels precisely like the bubbles a child learned the game on.

**A celebration ends its own arrivals, and never ends the child's turn.** New
things go on arriving unasked for thirty seconds, measured from the moment the
celebration was raised. When that runs out, only the *arriving* stops: whatever
is on screen goes on answering a finger for as long as the child stays. Nothing
in a celebration ever changes the level. The way onwards is the same big button
the child has pressed at the end of every level, and it goes up *with* the
celebration rather than after it.

That combination is what keeps a celebration from being a trap, and both ends of
the trap are real. A child who pops every balloon in four seconds must not then
be looking at an empty screen with nothing to do - so things keep arriving. A
child who touches nothing must not be stuck watching - so the way out was there
from the first instant. And a child mid-tap must not have the game taken away by
a clock - so nothing advances by itself.

**The finale never winds down at all.** After thirty levels the celebration is
every other one at once - a rainbow across the whole board, balloons, blossom, a
parade of the animals, fireworks anywhere a finger lands - and it goes on
arriving for ever. The end of the game is a room to stay in rather than a wall to
hit, and the "somewhere obvious to go from there" is the button the child has
already pressed twenty-nine times, which starts the whole game again at the
bubbles. A child who cannot read can act on that; a menu of any kind, they
cannot.

**A celebration is not a `PuzzleKind`.** This was judged rather than assumed. A
kind is dealt a cast, composes a layout, cuts holes, judges drops, and above all
is named by a row of the thirty-level table - the one place difficulty is tuned.
A celebration has no pieces, no targets, no difficulty and no place in the
thirty; putting it in the table would mean inventing levels nobody plays and
teaching every kind-shaped thing in the codebase to expect them. What is worth
copying is the *shape* of `PuzzleKind.play`: handed a layer, answers the finger
itself, returns a teardown that runs before the next board goes up, and keeps
its progress on an object outside the board so that turning the tablet does not
lose it. `src/celebration.ts` is that parallel contract, deliberately small.

**The boundaries are 5, 10, 15, 20, 25 and 30.** Issue #9 named 6, 12, 18, 24
and 30, which predates the six-chapters-of-five structure now in `levels.ts`.
Five celebrations and a finale is what the issue asked for and what the chapters
give. `endsChapter` reads the boundary off the table rather than holding a list
of level numbers, so retuning the ramp moves the celebrations with it instead of
stranding one in the middle of a chapter.

## Consequence

`board.ts` gained a `celebrationLayer` between the pieces and the effects. The
position is the point: a celebration draws below `fx`, so a rising balloon can
never float over the button onwards and the full-board tap catcher the rainbow
and the fireworks use can never swallow it.

Balloons rise about twice as fast as bubbles. That looks like a tuning accident
and is not: a bubble is a level, paced so a child has time to aim, and a
replacement that took four seconds to climb into reach would leave the sky empty
for four seconds - which is the one thing a celebration must not do.

Under `prefers-reduced-motion` the moment still happens and is calmer: floaters
hold still, as they already do everywhere (see
[20260729T072100](20260729T072100-reduced-motion-holds-still.md)), the parade
stands in a row instead of walking, arcs appear without wiping themselves on,
and a firework bursts without climbing first.

The thirty-second span is a deadline set when the celebration is raised, not
when it is drawn, so rotating the tablet does not hand out another thirty
seconds of arrivals each time. The count of what has been played with lives on
the same object for the same reason - the arcs of a half-painted rainbow are
progress, and progress that a turned tablet undoes is a bug.

None of this is testable in Vitest, which has no DOM here. `tests/celebration.test.ts`
holds only the wiring - which chapter ends with what, and where the boundaries
are - and `scripts/shot.mjs` plays the celebrations for real in Chromium, taps
things, and shoots them.
