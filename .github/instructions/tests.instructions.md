---
name: "Tests"
description: "How to write tests against a random deal, and what each suite already covers."
applyTo: "tests/**"
---

# Tests

## Writing them

The deal is random: tests must not assume one fixed cast, one fixed order, or one
animal always occupying a particular hole.

Prefer asserting the invariant over snapshotting one deal. Good tests say things
like holes stay on canvas, snap zones do not overlap, tray slots do not collide,
and wrong drops return to the tray.

Layouts are composed rather than tabulated, so what is worth testing is the
promise, not the output. `PROMISES` in `tests/puzzle.test.ts` is a table of them
- each takes a layout and returns what is wrong with it, or null - and each is
checked against every layout in `COMPOSED`: every piece count a level could ask
for, in both orientations, over several random casts each. A new property goes
in that table and is checked everywhere for free; a new piece count needs
nothing.

Two kinds of cast are dealt into it. `animalCast` is the real animals in a random
order, repeating the list when a count runs past it. `oddCast` is pieces of no
particular shape - boxes of any proportions, standing anywhere in the lower part
of their box - because every animal is square and stands near the foot of its
box, so a cast of animals cannot tell whether the composition reasons about each
piece's own reach or merely assumes the proportions of an animal.

When a check does need one specific shape rather than a random one, rotate the
animal list so every animal appears in every place that matters. This catches
foot-level problems that one seed can hide.

Use `?seed=` when an end-to-end or browser run needs to reproduce a specific
deal. A seed is a reproduction tool, not a reason to make tests depend on only
one cast.

## What `npm run test` covers

Vitest covers the coordinate mapping (including letterboxing in both
orientations), snap tolerance, clamping, the random deal, the shape-match kind's
rules - it accepts a sloppy drop on a piece's own hole, never accepts anybody
else's, and only finishes when the last piece is in - and the composed layouts:
targets stay on canvas and clear of the tray, every piece stands on one of the
layout's ground lines, snap zones never reach each other, tray slots never
collide or sit in a target's snap zone, pieces stay big enough to grab, and each
orientation fills at least 75% of its viewport. Alongside those it checks what
composing is *for*: the same cast composes twice the same, a fuller board never
gets bigger pieces, portrait stacks more rows than landscape spreads, and a cast
too big to compose above the grabbable size is refused rather than shrunk away.

Every animal is square, so both suites also carry a plank and a pole - pieces
that are deliberately not square, in both directions. They keep the engine
honest about per-piece bounds: each is clamped and snapped by its own box, so a
wide piece cannot borrow its width's forgiveness for its short axis. Add such a
case whenever a check would otherwise pass only because a piece happens to be
square.

## What `npm run shot` covers

`npm run shot` is an end-to-end check: it serves the built app, drives real
pointer drags over the Chrome DevTools Protocol, and plays all three stages
through - asserting that pieces snap, that a bad drop does *not* stick, that each
stage hands over to the next, that rotating to portrait preserves progress, that
the last stage loops back to the first, and that different seeds deal different
puzzles while one seed always deals the same. Screenshots land in `.art/shots/`,
alongside a `contact-sheet.png` that collects them into one image to drag into a
pull request.

Run `npm run build` first; the shot run serves `dist/`. It honours `CHROME_BIN`.

## What the tests cannot see

The artwork. `npm run art:check` covers that, and
[`art.instructions.md`](art.instructions.md) says how.
