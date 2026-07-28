# 20260729T000652. Put the settings behind a two-second hold

## Context

[Decision 20260727T072917](20260727T072917-no-menu-or-difficulty-picker.md) says
there is no menu and no difficulty picker, and it is right about the child: a
two-year-old cannot read one, cannot compare the choices on it, and cannot get
back out of it.

It is not right about the grown-up. The game is now thirty levels rather than
three stages, with a rotation option (#14) and an idle hint (#21) that apply
across all of them, and progress that is remembered between sittings. A parent
whose child is stuck at level 8, or who has handed the iPad to a younger
sibling, or who is on a bus and needs it silent, has no way to say so. Nor is
there anywhere to clear progress, which is the one destructive thing a grown-up
occasionally wants.

So there has to be a panel. The question is how to keep the child out of it,
and there are only two answers: hide it, or make it take patience.

**Hiding it** - a secret gesture, a corner triple-tap, a long swipe - is what
most children's apps do. It fails on its own terms. A gesture obscure enough
that a toddler will not find it by accident is obscure enough that a parent will
not find it either, so it has to be explained somewhere the parent will not
read. And a toddler at an iPad performs thousands of gestures an hour; secrecy
is a poor lock against that much brute force.

## Decision

The panel is behind a **visible, labelled button that must be held for two
seconds**, and behind nothing else.

The button says "Grown-ups", in the corner, in small grown-up type. Pressing it
does not open anything: it answers with "Hold to open" and starts filling a ring
around itself. Only a press that lasts `HOLD_MS` - two seconds - opens the
panel, and every release starts the next hold from zero.

The panel itself is deliberately not toddler-styled: small text, ordinary
switches, ordinary spacing. It holds the level map, the switches, and the only
reset in the game.

## Consequence

**A tap can never get in, however many taps there are.** Taps do not accumulate,
so drumming on the button is exactly as effective as one tap, which is not at
all. That rule is a state machine with the clock passed in (`createHoldGate` in
`src/grownups.ts`), so two hundred taps are checked in a unit test rather than
hoped about.

**A parent needs no instructions.** The button says what it is, and the first
tap - which is what everybody does first - is what puts the instruction on
screen. Nothing has to be written down anywhere they will not read it.

**The old decision stands where it was aimed.** There is still no menu, no
difficulty picker, no settings and no score *in the child's game*: the play
surface is unchanged, the thirty levels are still played in one order, and the
chapter dots are still an indicator rather than a control. What has changed is
that a grown-up now has a door, and it is labelled.

**The level map is honest about where the child got to.** Choosing a level from
it moves the child without claiming they reached it (`jumpToLevel` in
`src/progress.ts`), because a map that fills itself in as it is read stops being
worth reading. That is also why `readProgress` no longer raises `furthest` to
meet `level`: after a grown-up chooses level 20, the two disagree on purpose.

**Rotation and hints are stored before they are used.** Both switches persist
and read back correctly now, so #14 and #21 arrive as one line each in
`applySettings` rather than as a change to the panel.
