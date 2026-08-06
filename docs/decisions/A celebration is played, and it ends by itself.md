# A celebration is played, and it ends by itself

> **Partly superseded** by
> [A celebration between every level](<A celebration between every level.md>).
> Everything here about what a celebration *is* still holds. What has moved is
> where one happens - every level now, not only the five that end a chapter - and
> how long the way onwards holds back, which is 4.5 seconds rather than the
> "about two" argued for below, and which is now the point rather than a
> precaution. Read this one first; it is the argument the later one builds on.

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
landed. There is no passive frame anywhere in any of them. The floating and the
bursting come from `pop.ts`, which the balloons interlude and the finale share,
so a balloon behaves the same wherever it turns up.

**A celebration ends its own arrivals, and never ends the child's turn.** New
things go on arriving unasked for thirty seconds, measured from the moment the
celebration was raised. When that runs out, only the *arriving* stops: whatever
is on screen goes on answering a finger for as long as the child stays. Nothing
in a celebration ever changes the level.

That is what keeps a celebration from being a trap, and both ends of the trap
are real. A child who pops every balloon in four seconds must not then be
looking at an empty screen with nothing to do - so things keep arriving. A child
who touches nothing must not be stuck watching - so the way out is up for all
but the first moment. And a child mid-tap must not have the game taken away by a
clock - so nothing advances by itself.

**The way onwards arrives, about two seconds in, instead of sitting there.**
This is the one thing in a celebration that is withheld, and it is withheld for
a reason that has nothing to do with traps. By the end of chapter four the child
has pressed that button twenty-four times. It is the most conditioned action in
the game, and it is drawn as an enormous saturated yellow disc in the middle of
the board - louder, on a still frame, than four blossoms drifting at the edges.
Put it up in the same tick as the celebration and a good number of two-year-olds
will press it before they have registered that anything else changed. For those
children the feature would not exist. A conditioned response beats a novel
stimulus when both arrive together; it does not beat one that got there first.

So the button holds back for `FINISH_BUTTON_BEAT_MS` and then fades up over
about half a second, by which time the celebration is already under way and has
usually been touched. (On a chapter end and only there, when this was written;
the record above took the beat to every celebration, lengthened it, and renamed
the constant `WAY_OUT_MS`.) Nothing is taken away by this. The celebration itself answers a finger from its very first
frame, so the beat is never a wait for *permission to play*, only for permission
to leave, and it costs a child who genuinely wants out under two seconds. The
button is never an invisible hit target either: it is not in the document at all
until it starts to show, and it can be pressed from the first frame of the fade.

The beat is for a celebration that has just been raised. Turning the tablet
re-mounts the celebration on a new board, and the button goes straight back
where it was - a child who has already seen it should not have to watch it
arrive twice, and the argument above is about the first moment only.

Two seconds was chosen by looking at it rather than by picking a number:
`.art/shots/03-level1-first-instant.png` is the frame the child gets, and
`04-level1-balloons.png` is the same celebration with the button up. Compare
them. The first has one thing in it to do.

**The finale never winds down at all.** After thirty levels the celebration is
every other one at once - a rainbow across the whole board, balloons, blossom, a
parade of the animals, fireworks anywhere a finger lands - and it goes on
arriving for ever. The end of the game is a room to stay in rather than a wall to
hit, and the "somewhere obvious to go from there" is the button the child has
already pressed twenty-nine times - after the same beat as every other
celebration, so the last thing thirty levels earns is a moment where the party
is the only thing on the screen - which starts the whole game again at the first
single animal. A child who cannot read can act on that; a menu of any kind, they
cannot.

**A celebration is not a `PuzzleKind`.** This was judged rather than assumed. A
kind is dealt a cast, composes a layout, cuts holes, judges drops, and above all
is named by a row of the thirty-level table - the one place difficulty is tuned.
A celebration has no pieces, no targets, no difficulty and no place in the
thirty; putting it in the table would mean inventing levels nobody plays and
teaching every kind-shaped thing in the codebase to expect them. What a
celebration wants instead is its own small contract: handed a layer, answers the
finger itself, returns a teardown that runs before the next board goes up, and
keeps its progress on an object outside the board so that turning the tablet
does not lose it. `src/celebration.ts` is that contract, deliberately small.

**The boundaries are 6, 12, 18, 24 and 30**, the ends of the five chapters in
`levels.ts`. Four celebrations and a finale is what issue #9 asked for and what
the chapters give. `endsChapter` reads the boundary off the table rather than
holding a list of level numbers, so retuning the ramp moves the celebrations with
it instead of stranding one in the middle of a chapter.

## Consequence

`board.ts` gained a `celebrationLayer` between the pieces and the effects. The
position is the point: a celebration draws below `fx`, so a rising balloon can
never float over the button onwards and the full-board tap catcher the rainbow
and the fireworks use can never swallow it.

Balloons rise briskly. That looks like a tuning accident and is not: a
replacement that took four seconds to climb into reach would leave the sky empty
for four seconds - which is the one thing a celebration must not do.

For the same reason a floater gives up its place in the sky part way through its
journey (`TUNING.handOnAt`) rather than when it leaves the edge. Releasing seven
balloons together and replacing each one only as it escapes sounds right and is
not: they were released together, so they reach the top together, and the sky
goes from full to empty and back with a hole of a second or two in the middle.
That hole is invisible in a screenshot and obvious to a child who looked away.
Handing the place on at just over half way keeps a continuous stream instead of
a wave. `scripts/shot.mjs` watches the sky across six seconds rather than
sampling it once, because one sample walks straight past exactly this.

Under `prefers-reduced-motion` the moment still happens and is calmer: floaters
hold still, as they already do everywhere (see [Under reduced motion, a floater
holds still](<Under reduced motion, a floater holds still.md>)), the parade
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
