# 20260730T203000. Rotation mode is not built, and the switch is gone

## Context

Issue #14 asked for a rotation mode: a grown-up switch that applies to every
level, pieces arriving at a wrong quarter turn, a tap to turn one a quarter turn
right and a drag to move it. The setting was persisted ahead of the feature
(`Settings.rotation`, see
[decision 20260728T212500](20260728T212500-remember-where-the-child-stopped.md)),
the panel had a switch for it labelled "Not in play yet", and `playTurn` was
written and measured in the sound vocabulary with nothing to call it.

## Decision

Rotation mode will not be built. The switch has been taken off the panel, the
field has gone from the stored settings and the sound has gone from the
vocabulary. This record exists because a plan that lists #14, a stored record
that used to carry a `rotation` boolean and a sound named "turn" in an old
render will all outlive the feature, and somebody will reasonably wonder what
happened.

The call was the project owner's, made while the gesture was half written. What
the attempt had already turned up is worth keeping, because it is the argument
for not coming back to it lightly.

**The gesture cannot be made safe from here.** `src/drag.ts` picks a piece up on
`pointerdown`. Rotation mode requires that a press *wait* to find out whether it
was a tap or a drag, and the rule that tells them apart needs both a movement
threshold and a time window, because a two-year-old's tap wanders several
millimetres and their drag starts slowly. Both numbers are guesses until a real
child's finger has been measured on a real iPad, and there is no iPad. Guessing
wrong in either direction is bad in a way the rest of the game is careful never
to be: a piece that spins when the child meant to carry it, or one that refuses
to turn when they meant to turn it.

**The cost of guessing wrong falls on everybody.** The overwhelming majority of
play has the switch off, and every one of those children would be dragging
through a gesture engine that now has a branch in it. A regression there is far
worse than shipping no rotation at all, and the branch would exist whether or
not anybody ever switched rotation on.

**It is not coherent for every kind anyway.** A cow at a quarter turn is a
picture of a cow lying down, which is a fine thing to ask a child to fix. A
circle in the polygon kind is *invariant* under rotation, and that kind already
treats congruent shapes as interchangeable, so "the right angle" is not a
well-defined thing there - a piece could look exactly right and be refused,
which is the one thing a two-year-old must never meet. A slice, a jigsaw piece
or a shard is drawn inside the whole picture's box and packed into a tray cell
cut to its ink, so a quarter turn changes its footprint and puts its grab area
into its neighbour's, against
[decision 20260728T120732](20260728T120732-grab-anywhere-in-the-piece-box.md).
Whole animals were the only pieces it clearly worked for, which is a narrow
return for a change to the engine everything else depends on.

Set against that, the tie-breaker in
[`product.instructions.md`](../../.github/instructions/product.instructions.md):
when a question is open, choose whatever is more forgiving. A press that
sometimes turns a piece the child was trying to move is not the forgiving
option, and the harder game rotation offers was never the point of this one.

## Consequence

`Settings` has `sound` and `hints` and nothing else. `STORAGE_VERSION` is
**not** bumped: every field is read on its own and an unrecognised one is passed
over, so a record written while the switch existed still resumes on the right
level and keeps the settings that remain. `tests/progress.test.ts` covers
exactly that case, so the compatibility is a test rather than a claim.

`makeSwitch` in `src/grownups.ts` stays a factory even though it now makes one
switch, because the next boolean setting should not have to invent it again. The
shot run checks the panel's options by the labels a grown-up reads, so a switch
that does nothing cannot creep back unnoticed.

`playTurn` and its phrase are gone from `src/audio.ts`. A sound nothing plays is
a sound nobody hears, and
[decision 20260730T183000](20260730T183000-sounds-are-data-and-the-machine-listens.md)
is explicit that `VOCABULARY` is the list of sounds somebody has looked at - an
entry annotated "unwired" that will never be wired is a standing invitation to
wonder what is broken. It is two lines of data if it is ever wanted again; this
record and the history are where to find them.

If rotation is ever reconsidered, the thing to fix first is not the code. It is
that nobody has watched a two-year-old press a piece and measured how far their
finger moved and how long it stayed down. Until somebody has, the two numbers at
the heart of it are guesses, and this game does not ship guesses that can take a
piece away from a child who was reaching for it.
