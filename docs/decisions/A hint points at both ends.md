# A hint points at both ends

## Context

An idle hint - a gentle glow appearing after a stretch with no progress -
needs to be silent and non-punitive, and needs to actually help the child it
is for: the one meeting a tray for the first time, who does not yet know that
a shape on the board is something to be picked up and moved to a matching
place.

## Decision

### It glows both ends, not one

A glow on a target says *something goes here*; it does not say *which*
thing, and it does not say that anything can be moved at all. So the hint
draws a piece's outline twice: brightly where it belongs, and faintly at its
own place in the tray - two ends of one move, the quieter mark on the thing
to pick up. When a question like this is open, the more forgiving option
wins, and two marks require less understanding than one.

### It reuses the piece's own outline

Both marks are drawn from the same path a piece is drawn from and its hole
is cut from - already an invariant of the game, which is what keeps a piece
from drifting out of alignment with its hole. Reusing it here means the hint
carries no per-kind knowledge and cannot drift out of alignment with a kind
either; a new kind gets a working hint for free as long as it answers
honestly about where a piece may go.

### Where a kind allows a piece more than one valid place, it glows all of them

A kind may treat congruent pieces as interchangeable, accepting a piece at
more than one place and deciding which on drop. Pointing a hint at only one
of those places would teach a child a rule the game does not actually have -
and the child being hinted at is, by definition, the one with the least basis
to discover that was a lie. So a kind with this ambiguity must answer both
"where would this settle" and "where could this go", and the hint glows every
place the second answer allows.

Two things worth expecting rather than discovering: a hint can be several
glows at once on a fresh board where many places are equally valid, and it is
self-correcting, since the set of valid places shrinks as matching pieces are
placed, sharpening the hint as the picture comes together. It also cannot go
stale, because a placement is itself an interaction, and every interaction
recomputes or clears the hint before it is shown again.

### Stroke only, never a fill

A hint must never look like a target that has already been filled. A filled
target in this game is an opaque piece sitting in its hole; an empty target
is a thin outline. The hint is a soft, unfilled double stroke, which reads as
light on a rim rather than as a shape already in the hole. A check on
rendered screenshots asserts the hint never contains a filled shape.

### When nobody has touched anything, it points anyway

The tempting rule - hint at whatever was last touched, or show nothing if
nothing has been touched - is wrong at the two moments that matter most: the
very start of a level, and right after a piece has just been placed. A child
who has touched nothing is touching nothing *because* they are stuck, which
is exactly when the hint should not withhold help. So the rule is: hint the
last-touched piece if it is still unplaced, otherwise the first unplaced
piece, otherwise nothing.

### Reduced motion keeps the glow and drops the pulse

Under a reduced-motion preference the hint still appears - a child who needs
it still needs it - but holds at a steady opacity instead of pulsing, in
keeping with how the rest of the game answers that preference elsewhere.

### The hint always answers the board as it currently stands

A hint is armed by a timer, and a timer can fire after the thing it was armed
for no longer applies - the board was replaced, the level was completed, a
drag began. This is guarded by one mechanism - a latch, checked both inside
the scheduled callback and at the top of every other method - rather than a
defence per case, so a stray late callback draws nothing rather than
re-arming or drawing something stale.

## Consequences

- A new puzzle kind gets a working hint without writing one, and gets none on
  a level with no draggable pieces without asking for that either. The one
  thing it must implement, if it allows more than one valid place for a
  piece, is answering both questions above honestly.
- The delays before a hint appears are argued constants, not measured facts,
  and are the first thing to revisit if real play shows them wrong.
- No sound was added: an idle hint that announces itself is a hint that can
  be ignored wrongly, and silence was asked for.
