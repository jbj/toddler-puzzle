# The game sleeps when nobody is playing

After a period with nothing touched - and the instant the tab is hidden -
the whole page freezes. Anything that says somebody is there unfreezes it:
a touch, a key, a wheel, a mouse crossing the board, or the tab being
looked at again.

A board left alone otherwise goes on drawing forever. A two-year-old does
not close a tab; the realistic end of a session is a tablet put down on
whatever was on screen, which is very often a celebration in full swing -
balloons drifting and respawning on a timer, a button breathing on an
infinite animation, a parade walking on repeat and refilling its sky, an
`AudioContext` rendering silence at the sample rate - and all of it runs,
and costs battery and repaints, for as long as the tablet stays on.

## It is a freeze, not a state change

Nothing ends, nothing advances, nothing is put away. Every running
animation is paused where it stands and resumed from there, so the game
the child comes back to is the one they left, moving again.

That is what keeps this from arguing with the celebration invariants. A
finale that never winds down has not wound down by sleeping, and sleeping
moves nobody anywhere. A grown-up who walks past sees a still picture
rather than a finished one, and a finger starts the fireworks again
mid-arc.

## `document.getAnimations()`, rather than a register of animations

Asking the document what is running, rather than keeping a hand-maintained
list of every animation the game creates, catches the CSS pulse, the
drifting balloons, the parade, the button, and whatever is added next by
somebody who has never heard of `rest.ts`. A hand-kept list is only ever in
step with the codebase that remembered to update it, and the animation
somebody forgot to add would be exactly the one still running. Only
*running* animations are paused, so each one resumes rather than
restarting, and none can finish while the page is asleep.

Timers cannot be found that way, so the ones the game has ask for
themselves. `repeatWhileAwake` replaces `setInterval` in a celebration's
`every`; it is a belt-and-braces refill, so it stops dead and starts again
rather than catching up on missed ticks - nothing popped while the screen
was frozen, so there is nothing to refill.

A one-shot needs more care, because a celebration's `after` is what hands
one balloon's place on to the next, and the next arrives with an animation
of its own. Left to `setTimeout` it would go on filling a frozen sky, and a
finale that never stops arriving would do it until the battery went. So
`afterWhileAwake` stops its clock instead and serves the rest of the wait
on waking: the balloon still hands on, a moment after somebody comes back.

## The touch that wakes the game also plays the game

The wake listeners are in the capture phase, so a finger landing on a
balloon wakes the page and then bursts the balloon, in that order. A child
never has to tap twice, and never taps a screen that ignores them - which
for a two-year-old is indistinguishable from a broken toy.

A tab being looked at again wakes it too, without waiting to be touched.
Sleep is a way of costing nothing while nobody is there, not a lock, and
somebody switching back to the game *is* somebody being there.

The speakers are the awkward half of that. `AudioContext.resume()` settles
a tick or two after it is asked, and the tap that asks is the tap that
wants a sound. A suspended context's clock is frozen rather than stuck at
zero, so a note scheduled a hair after `currentTime` lands the moment the
speakers come back; the guard in `audio.ts` lets a resume that is in
flight through, and only a context that has never been unlocked is still
refused.

## The wait, and no switch

Long enough that it is never the child who wakes it - a two-year-old who
is thinking, or being talked to, or fetching a different toy to put on the
screen, is back well inside it - and short enough that a tablet left face
up on the sofa stops drawing within roughly the time somebody would have
noticed.

There is no control for it. Not on the play surface, which has no
settings at all, and not in the grown-up panel either: every option in
that panel changes what the child gets, and this one changes nothing they
can see. `?rest=` shortens the wait, in the same spirit as `?seed=` and
`?level=` - a tool for working on the game, and what lets `npm run shot`
watch a real board freeze and wake without sitting through the real wait
to do it.

## Consequence

- `src/rest.ts` is the one home for it: the wait, the repeat registry, and
  the page wiring. The rule half takes its timers as arguments, like
  the game's other time-based modules, so a rest wait is played out in a
  microsecond in Vitest.
- Sleep is invisible to the rest of the game. No kind, no celebration and
  no level knows it happened; the only trace is `data-asleep` on the
  document, which the stylesheet and the screenshot run read.
- Balloons hanging still in mid-air is the visible cost, and it lasts
  until the first touch. It reads as balloons hanging rather than as a
  broken screen.
- A celebration's arrival window is wall-clock (`Date.now() < until`), so
  a long sleep can land back on a party that has stopped refilling. That
  is already what a backgrounded tab did, and what is afloat still bursts,
  so it is left alone.
- This module's own weight is counted deliberately against the bundle
  budget in `scripts/check-bundle.mjs`, as growth that buys frames back
  rather than spending them - `rest.ts` has to be in the entry chunk to
  buy any of them.
