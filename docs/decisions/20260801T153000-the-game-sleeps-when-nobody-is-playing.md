# 20260801T153000. The game sleeps when nobody is playing

## Context

A board left alone went on drawing forever.

The idle hint was the suspicion that started this - `.hint-mark` runs
`hint-pulse ... infinite`, and an opacity animation on an SVG element repaints
rather than composites on the browsers this game is for, so a glow nobody is
looking at costs a repaint every frame for as long as the tablet is awake. It
was a good suspicion and an incomplete one. Four other things run with nobody in
the room:

- the bubbles drift, respawn as they escape, and are topped up by a
  `setInterval` that never stops;
- the finish button breathes on `iterations: Infinity` until it is pressed, and
  nothing presses it;
- a chapter celebration walks its parade round on an infinite animation and
  refills its sky on a timer - and the finale, by design, never stops arriving;
- the `AudioContext`, once unlocked, renders silence at the sample rate.

A two-year-old does not close a tab. The realistic end of a session is a tablet
put down on whatever was on screen, which is very often a celebration, and it
then draws until the battery goes.

## Decision

After two minutes with nothing touched - and the instant the tab is hidden - the
whole page freezes. Anything that says somebody is there unfreezes it: a touch,
a key, a wheel, a mouse crossing the board, or the tab being looked at again.

### It is a freeze, not a state change

Nothing ends, nothing advances, nothing is put away. Every running animation is
paused where it stands and resumed from there, so the game the child comes back
to is the one they left, moving again.

That is what keeps this from arguing with the celebration invariants. The finale
"never winds down" and no clock ever moves a child on: a sleeping finale has not
wound down, and sleeping moves nobody anywhere. A grown-up who walks past sees a
still picture rather than a finished one, and a finger starts the fireworks
again mid-arc.

### `document.getAnimations()`, rather than a register of animations

Every animation in the game could have been handed to this module as it was
created. That is a list to keep in step with a codebase, and the animation
somebody forgot to add would be exactly the one still running.

Asking the document what is running instead catches the CSS pulse, the drifting
bubbles, the parade, the button, and whatever is added next by somebody who has
never heard of `rest.ts`. Only *running* animations are paused, so each one
resumes rather than restarting, and none can finish while the page is asleep.

Timers cannot be found that way, so the ones the game has ask for themselves.
`repeatWhileAwake` replaces `setInterval` in `kinds/play.ts` and in a
celebration's `every`; both are belt-and-braces refills, so they stop dead and
start again rather than catching up on missed ticks - nothing popped while the
screen was frozen, so there is nothing to refill.

A one-shot needs more care, because a celebration's `after` is what hands one
balloon's place on to the next, and the next arrives with an animation of its
own. Left to `setTimeout` it would go on filling a frozen sky, and the finale -
which never stops arriving - would do it until the battery went. So
`afterWhileAwake` stops its clock instead and serves the rest of the wait on
waking: the balloon still hands on, a moment after somebody comes back.

### The hint holds, rather than freezing mid-fade

Pausing the hint's pulse would freeze it at whatever opacity the fade had
reached, which can be its dimmest - on the one thing on screen a stuck child
needs to be able to see.

So a sleeping page gets the treatment `prefers-reduced-motion` already gets:
`[data-asleep] .hint-mark` drops the animation and holds the glow bright. The
help survives the sleep, exactly as it survives a request for less motion. It
also means the hint is out of `getAnimations()` by the time the sweep runs, so
it needs no resuming.

### The touch that wakes the game also plays the game

The wake listeners are in the capture phase, so a finger landing on a bubble
wakes the page and then pops the bubble, in that order. A child never has to tap
twice, and never taps a screen that ignores them - which for a two-year-old is
indistinguishable from a broken toy.

A tab being looked at again wakes it too, without waiting to be touched. Sleep
is a way of costing nothing while nobody is there, not a lock, and somebody
switching back to the game *is* somebody being there: a screenful of bubbles
hanging motionless is a poor invitation to the child who came back for them, and
the first thing they do is touch it anyway. The saving that matters is the
tablet face up on the sofa, and that one is untouched either way.

The speakers are the awkward half of that. `AudioContext.resume()` settles a
tick or two after it is asked, and the tap that asks is the tap that wants a
sound: the guard in `audio.ts` would have dropped it for being scheduled into a
context that was not yet running. A suspended context's clock is frozen rather
than stuck at zero, so a note scheduled a hair after `currentTime` lands the
moment the speakers come back; the guard now lets a resume that is in flight
through, and only a context that has never been unlocked is still refused.

### Two minutes, in code, with no switch

Long enough that it is never the child who wakes it - a two-year-old who is
thinking, or being talked to, or fetching a different toy to put on the screen,
is back well inside two minutes - and short enough that a tablet left face up on
the sofa stops drawing within the same minute somebody would have noticed.

There is no control for it. Not on the play surface, which has no settings at
all, and not in the grown-up panel either: every option in that panel changes
what the child gets, and this one changes nothing they can see. `?rest=2` sleeps
after two seconds instead, in the same spirit as `?seed=` and `?level=` - a tool
for working on the game, and what lets `npm run shot` watch a real board freeze
and wake without sitting through two minutes to do it.

## Consequences

- `src/rest.ts` is the one home for it: the wait, the repeat registry, and the
  page wiring. The rule half takes its timers as arguments, like `hint.ts` and
  `grownups.ts` before it, so two idle minutes are played out in a microsecond
  in Vitest.
- Sleep is invisible to the rest of the game. No kind, no celebration and no
  level knows it happened; the only trace is `data-asleep` on the document,
  which the stylesheet and the screenshot run read.
- Bubbles hanging still in mid-air is the visible cost, and it lasts until the
  first touch. It reads as bubbles hanging rather than as a broken screen.
- A celebration's arrival window is wall-clock (`Date.now() < until`), so a long
  sleep can land back on a party that has stopped refilling. That is already
  what a backgrounded tab did, and what is afloat still bursts, so it is left
  alone.
- The initial bundle grew by about 0.8 kB gzipped, which took it past the 37 kB
  budget it shared with two other changes landing the same day. The gzipped
  budget was raised to 38 kB and said out loud, per the rule in
  `scripts/check-bundle.mjs`: this is the rare growth that buys frames back
  rather than spending them, and `rest.ts` has to be in the entry chunk to buy
  any of them. The raw budget was left where it was.
