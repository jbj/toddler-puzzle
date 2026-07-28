# 20260728T120732. Grab a piece anywhere in the box around its artwork

## Context

A piece used to be pickable up only where the pointer landed on painted
artwork - the silhouette and the marks inside it - because that is all an SVG
hit test can see. Everything else in the `.piece` group was a hole in more than
one sense: the gap between a giraffe's legs, the notch under a duck's tail, the
space beside a fish's fin. A two-year-old aiming squarely at the animal and
landing in one of them got nothing at all, and nothing moved to say why.

That was out of step with the rest of the game. The snap radius is two thirds of
a piece, a refused drop drifts home with a warm tone, and a piece cannot be
dragged out of reach - forgiveness everywhere except at the moment a toddler
first touches the thing.

## Decision

Every piece carries an invisible rectangle covering its artwork, behind the
drawing and inside the same group, so a press anywhere in that rectangle picks
the piece up.

The rectangle hugs the drawing rather than filling the whole 240x240 authored
box: it is measured from the artwork with `getBBox()` when the board is mounted,
given a small margin (`GRAB_PADDING`), and then clamped to the authored box.
Measuring rather than declaring means redrawing an animal moves its grab area
with it, and there is no per-animal table to fall out of step - unlike
`FOOT_LEVEL`, nothing here has to be true at a glance for the game to look
right, so a table would rot unnoticed.

## Consequence

Pieces are markedly easier to pick up, and the improvement is largest for the
spindly animals, which are exactly the ones that were hardest before.

The clamp is what keeps this unambiguous. A piece's authored box scales to
exactly the slot it was laid out in, no two slots overlap (the layout suite
proves it), and a grab area held inside the box therefore cannot reach into a
neighbour's. Placed pieces keep `pointer-events: none`, so a finished animal
still catches nothing.

An invisible rectangle with no visual effect is the sort of thing a later reader
deletes as dead markup. It is not: nothing else makes those places grabbable,
and removing it silently returns the game to hit-testing paint.

Two smaller consequences worth knowing. A deliberate overhang enlarges a piece's
grab area slightly, since the area follows the drawing; that is harmless while
overhang stays inside its budget. And anything measuring a `.piece` element -
`getBoundingClientRect` in `scripts/shot.mjs`, say - now sees the grab box
rather than the artwork alone.
