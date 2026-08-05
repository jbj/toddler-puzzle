# A celebration between every level

## Context

[A celebration is played, and it ends by itself](<A celebration is played, and it ends by itself.md>)
gave the game a celebration at the end of every chapter: four moments and a
finale, each one played rather than watched, each one holding the way onwards
back for a beat so that the party is the first thing seen. Everything in that
record still holds. This one changes where it applies and how long the beat is,
and it is worth writing down because the change makes the game *slower* on
purpose, which reads as a regression from outside.

Playtesting with a one-year-old found the problem in the other twenty-five
levels. A level ends, the sparkle takes 700 ms, and the next board is one press
away and already being pressed. What that asks of a child is to start again
immediately, twenty-five times, with nothing in between - and what actually
happened was not that they were stretched but that they stopped. The strain is
not in any one puzzle. It is in the seam between two of them.

The observation that pointed at the fix was which celebration held up best:
balloons. Not because there is much to do in it - because there is so little.
Something large and slow crosses the screen, it does the same thing every time,
and a child can pop one or pop none and be equally right. It is a place to put
your attention down. Fireworks and a parade are *events*; balloons are weather,
and weather is what a tired one-year-old can look at.

## Decision

**Every level ends with a celebration.** The five that end a chapter keep the
ones they had. The rest end with an **interlude**: balloons, beach balls,
confetti, streamers - four of them, rotated by level number, so two levels
running never end the same way and the same level always ends the way it did.

There is no exception, and there used to be one. The game opened on a chapter of
touch levels that raised nothing, on the grounds that a level made of bubbles
already *was* an interlude. That chapter is gone, so every one of the thirty
levels now ends with either an interlude or a chapter moment.

An interlude is deliberately less than a chapter celebration. It has no event in
it, nothing arrives that has to be watched, it answers a finger the same way
wherever it is touched, and a child who sits still and looks at it has played it
correctly. The five chapter moments stay the bigger thing, and the sound follows
the same line: a level's fanfare with the interlude's own small arrival behind
it, always shorter than the smallest chapter fanfare, which `tests/audio.test.ts`
holds it to.

The rotation is by level number rather than random. A re-deal, a turned tablet
and a level a grown-up picked out of the panel all show the same interlude, for
the same reason `?seed=` exists.

**The way onwards arrives 4.5 seconds after a level ends - after every level.**
This is the whole point rather than a side effect. The pause is what a child
gets instead of the next board landing on the one they have just finished, and
it has to be mandatory: a pause a child can skip is a pause a child will skip,
because the button is the most conditioned thing on the screen.

Four and a half seconds is one balloon's climb of a landscape board - the time
the first thing released takes to cross the sky. It is a *number* rather than a
particular balloon, because it has to hold when the celebration is paper or
ribbon, because it must not change when the tablet is turned into portrait
(which is taller, and a child who turns a tablet has not asked for a longer
wait), and because it has to hold when the celebration chunk never arrived at
all. It replaces the old chapter-only beat of 1.8 seconds, which was chosen to
be barely long enough to notice; this one is chosen to be a rest.

**A pause is not a trap, and the four things that keep it from being one:**

- Nothing else is withheld. The celebration answers a finger from its first
  frame, so this is never a wait for permission to *play* - only for permission
  to leave.
- Nothing advances by itself, still. No clock has ever moved the child on and
  none does now.
- A celebration that never arrived does not get a pause. If the celebration
  chunk failed to load, the button goes up at once: a missing party is a
  disappointment, an empty 4.5-second wait is a fault. That fallback is worth
  keeping working, because the chunk now matters at level 1 rather than at level
  5.
- The wait is measured in time somebody was there for. It runs on `rest.ts`
  rather than `setTimeout`, so a tablet put down during the pause does not have
  the button arrive behind the freeze - fading up and pulsing on a page that is
  meant to be standing still, and waiting there having been missed. The child
  comes back to the celebration they left, and the way onwards arrives in front
  of them.

**There is one kind of paper.** An earlier draft of this opened every
celebration with a throw of confetti that could not be touched, on top of the
confetti interlude, which could. Two kinds of paper on one screen teaches a
child that paper sometimes answers and sometimes does not, and a thing that
answers only sometimes is worse than a thing that never does: they stop trying
it. So the untouchable throw is gone. What opens a celebration is the sparkle
burst, which is light rather than an object and was never something to reach
for; paper falls only in the confetti interlude, and every piece of it can be
puffed back up.

## Consequence

The celebration chunk is now reached at the end of level 1 rather than the end
of level 5. It was already the first thing `warm.ts` fetches, and it is fetched
while the child is playing a level, so in practice it is there; the fallback
above is what covers the case where it is not.

The bundle's total budget went up (`scripts/check-bundle.mjs` says by how much
and why). The initial budget did not, which is the one that decides how long a
child waits for the first board.

Three new acts exist, and all three are weather rather than events, which is
also what lets them sit over any of the thirty boards without arguing with
[the rule that a celebration is not made of what the finished board is made
of](<A celebration is not made of the board.md>): beach balls
thrown on a ballistic arc that peaks at a random height above the middle of the
board and that spring away again rather than bursting when they are caught,
confetti that falls and puffs back up under a finger, and streamers that unroll
from the top edge and curl away when they are pulled.

The thing to watch in the next round of playtesting is the pause itself. It is a
withheld reward, and 4.5 seconds is a guess made from one number that could be
measured - how long a balloon takes to cross a screen - rather than from
watching a child wait. If it is wrong it will be wrong in the direction of being
too long, and it is one constant.
