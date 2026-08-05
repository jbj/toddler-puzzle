# Hold the button that throws the puzzle away

## Context

There are two buttons in this game a two-year-old should not be able to work.
One of them was already guarded and the other was not.

The "Grown-ups" button opens the panel, and opens it only for a press held for
two seconds
([Put the settings behind a two-second hold](<Put the settings behind a two-second hold.md>)).
The button in the corner of the board deals the level again, and answered a tap
- a single `pointerdown`, with no delay and no way back.

What that button does is not small. It throws away the puzzle the child is part
way through: eight pieces placed, one to go, and the board is dealt fresh. There
is no undo, because there is nothing in this game a child can be told about, and
no confirmation, for the same reason. It also sits at the bottom-left corner of
the canvas, which on a tablet held in two hands is under a thumb, and it is
round, white and 64 units across - which is to say it looks exactly like
something to press.

It is not a *wrong* thing to have on the board. A grown-up needs it: a line-up
the child has decided they do not like, a piece dropped somewhere awkward, a
level to start over. But its audience is the same audience as the panel's, and
it was reachable by the one gesture the child has most of.

## Decision

**The reset button is held, not tapped.** The same two seconds, the same rule,
the same file: `src/hold.ts` holds `createHoldGate` - which used to live in
`grownups.ts` - and `watchHold`, the pointer wiring round it. Both buttons use
both halves, so "held" cannot come to mean two different things.

**The ring is the whole of the feedback, and there is no wording.** The
"Grown-ups" button says "Hold to open", because the person pressing it can read.
This one says nothing: the child cannot read it and the grown-up can see the
ring fill from the first tenth of a second. So a press paints an arc round the
button and a release empties it, and that is all that ever appears on the play
surface - no text, no confirmation, nothing new to press. The gate's `prompt` is
simply ignored here.

A tap therefore does nothing at all, which is the point. It is also not
*nothing* as far as the rest of the game is concerned: the press is not stopped,
so it reaches the stage and stirs the idle hint like any other touch, and it
unlocks audio like any other first gesture.

## Consequence

`src/hold.ts` is new and `src/grownups.ts` is smaller: the gate and about sixty
lines of pointer handling moved out of it wholesale, and what is left is the
panel. The tests moved with the rule, into `tests/hold.test.ts`.

`watchHold` returns a teardown, which the grown-ups button does not need - its
button lives for the life of the page - and the reset button does: the board is
rebuilt under it on every level, every re-deal and every rotation, so `game.ts`
takes the old watcher down in `mount` beside the hint. A frame
loop left running against a detached button is the sort of leak this game
already refuses elsewhere
([The game sleeps when nobody is playing](<The game sleeps when nobody is playing.md>)).

A finger that slides off the button gives up the hold on the pointer being
outside it and on nothing else. The watcher tracks whether a press is under way
rather than reading how full the ring is, because a finger that leaves inside
the same millisecond it landed has filled none of it and is still a press.

`npm run shot` presses it for real, on level 2: six taps in a row leave the same
board standing, the ring is empty afterwards, a hold fills the ring past a third
of the way by halfway through, and the board it deals is a new one on the same
level. The run's own `dealAgain` helper holds the button rather than dispatching
a `pointerdown`, so every level it re-deals goes through the gesture a grown-up
would actually make.
