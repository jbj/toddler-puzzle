# 20260801T163000. Ask a touch level for a handful, and let the child out anyway

## Context

Levels 1, 3 and 5 are cause and effect: bubbles to burst, bushes to lift, a
scene where everything answers. They are the levels a one-year-old can play
before they can drag anything, and they are the only levels in the game that end
on a count rather than on an empty tray. The counts were six bubbles, four
things in the scene, and every bush.

Six is a screenful. It was picked as "most of the sky", which reads as generous
and is not, because it quietly assumes something a one-year-old does not have:
that the child knows they are working towards something. They do not. A child at
the bottom of this game's range pops a bubble because a bubble pops, and then
pops another one for the same reason. Nothing about the screen says "four more".
So the count is not a target the child is aiming at - it is a toll, and the
longer it is, the longer the game withholds the one thing that visibly moves it
on.

And there is a worse case than a long toll, which is a child who does not pay
it. A child who spends a minute patting the same cow is doing exactly what the
`alive` level is for, and touching one thing eleven times counts once. A child
who bursts two bubbles and then watches the rest drift past is enjoying the
level. Both of them can sit in front of a level that is working perfectly and
never see the button that leads anywhere, and neither of them can be told what
to do about it. The level is not stuck in any sense the code can see, and the
child is stuck in the only sense that matters.

## Decision

**Halve what the level asks for.** Three bubbles, two things in a scene. Every
bush stays every bush, because uncovering all of them *is* peekaboo and there
are only ever two or three of them anyway. Nothing else about the levels
changes: the same number of things are on screen, they arrive as fast as they
did, and a child who wants to pop the sky empty still can.

**And add a second way out that costs nothing.** A while after the level was
dealt (`ACTIVITY_PATIENCE_MS`), the way onwards is up whatever has been touched.

The clock is a way *out* and never a way *on*, and the distinction is the whole
of it. It raises the same big yellow button that finishing raises, and it does
nothing else: nothing is taken off the screen, nothing is counted as touched
that was not, the bubbles go on rising and bursting, and the level is only over
when the child presses the button themselves. It is the same rule a celebration
already follows - a span may end what *arrives*, but nothing in this game moves
a child on by itself
([20260729T152400](20260729T152400-a-celebration-is-played-not-finished.md)).

That while is one bubble's climb of the sky, which is about eight seconds on a
landscape board. It was a flat ten seconds when this was written; it is now a
length rather than a round number, and the two are within two seconds of each
other. The reason for the change is that a bubble crossing the screen is the
nearest thing a one-year-old has to a clock: wait the whole of it out and you
have watched one bubble come up from underneath and leave over the top. The
pause before the way onwards after *every* level is timed the same way, off a
balloon rather than a bubble
([20260803T133000](20260803T133000-a-celebration-between-every-level.md)).

It is long enough that a child who is getting on with it finishes by touching -
three bubbles is a few seconds - so the lesson of the level, that a finger makes
things happen, is still what carries them out of it. It is short enough that a
child who is not getting anywhere never notices they were waiting.

The deadline is stamped on the puzzle when it is *dealt*, not when the board is
drawn. Turning the tablet re-mounts the activity on a new board, and a deadline
that lived on the board would hand out another whole clock every rotation - the
same reason a celebration's span is a deadline rather than a countdown. Pressing
the reset button deals the level again and does start the clock over,
which is right: that is a new level as far as the child is concerned.

## Consequence

`ActivityHost.touched` takes an optional point. With one, a finger landed there
and the host sparkles on the spot; without one, the puzzle moved on with nothing
touched - which for an activity only ever means the clock - and the host checks
for completion without drawing a sparkle at a finger that was not there. The
timer is armed in `play` and cleared with the board, so it never outlives the
DOM it was arranged for, and a board mounted after the deadline has already
passed asks at once.

`isComplete` now reads the clock as well as the count. That makes it the one
thing in the puzzle contract that is not a pure function of the puzzle, which is
worth knowing when reading it: `tests/play.test.ts` stops the clock with fake
timers rather than waiting ten real seconds, and any future test that asserts a
level is *not* finished has to own the time it takes to say so.

`npm run shot` deals an activity level again immediately before playing it
through. The run stops to check things and take screenshots, and those seconds
come out of the same ten; without a fresh deal, a level would sometimes be
raised by the clock rather than by the last touch, and the checks that measure
the moment a chapter ends - the celebration having the screen to itself for a
beat before the button arrives - would be timing out against a moment that had
already passed. It also plays the other side for real: level 1, freshly dealt
and left alone, has to put the button up on its own, still have bubbles to pop
when it does, and still pop one.

The first chapter is quicker than it was, which is the intent
([20260729T072100](20260729T072100-the-game-opens-with-something-to-touch.md)):
the point of the opening five is that a child reaches the end of them.
