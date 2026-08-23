# Put the settings behind a deliberate hold

## Context

[Keep the game moving forward](<Keep the game moving forward.md>) keeps the
child's play surface free of any menu, and it is right about the child: a
two-year-old cannot read one, cannot compare the choices on it, and cannot
find their own way back out.

It says nothing about the grown-up, who does need a way in: to see where a
child got stuck, to change a setting that applies across the whole game, or
to clear progress, the one destructive action the game ever needs. Hiding
that door behind a secret gesture fails on its own terms - a gesture obscure
enough that a toddler will not find it by accident is obscure enough that a
parent will not find it either, and a toddler at a screen performs far more
gestures per hour than any secrecy can outlast.

## Decision

The panel is behind a **visible, labelled button that must be held**, and
behind nothing else. Pressing it does not open anything: it answers with
"Hold to open" and starts filling a ring around itself. Only a press that
lasts the full hold opens the panel, and every release starts the next hold
from zero, implemented as a small state machine so the timing can be tested
directly rather than hoped about. How long the hold lasts is a tuning value,
not part of what is being decided here; what this decision commits to is
that the panel opens only through a deliberate, sustained press.

The button says "Grown-ups", in small grown-up type. The panel itself is
deliberately not toddler-styled: small text, ordinary controls, ordinary
spacing.

## Consequence

**A tap can never get in, however many taps there are.** Taps do not
accumulate, so drumming on the button is exactly as effective as one tap,
which is not at all. The same hold rule is used elsewhere in the game; see
[Hold the button that throws the puzzle away](<Hold the button that throws the puzzle away.md>).

**A parent needs no instructions.** The button says what it is, and the
first tap - which is what everybody does first - is what puts the
instruction on screen.

**The child's play surface keeps the guarantees [Keep the game moving
forward](<Keep the game moving forward.md>) makes.** The grown-up's door is
separate from play and does not turn its controls into child-facing choices.
