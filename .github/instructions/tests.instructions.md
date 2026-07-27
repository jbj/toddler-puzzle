---
name: "Tests"
description: "How to write tests against a random deal, and what each suite already covers."
applyTo: "tests/**"
---

# Tests

## Writing them

The deal is random: tests must not assume one fixed cast, one fixed order, or one
animal always occupying a particular hole.

When testing layout behavior, rotate the animal list so every animal appears in
every place that matters. This catches foot-level and size problems that one seed
can hide.

Prefer asserting the invariant over snapshotting one deal. Good tests say things
like holes stay on canvas, snap zones do not overlap, tray slots do not collide,
and wrong drops return to the tray.

Use `?seed=` when an end-to-end or browser run needs to reproduce a specific
deal. A seed is a reproduction tool, not a reason to make tests depend on only
one cast.

## What `npm run test` covers

Vitest covers the coordinate mapping (including letterboxing in both
orientations), snap tolerance, clamping, the random deal, the shape-match kind's
rules - it accepts a sloppy drop on a piece's own hole, never accepts anybody
else's, and only finishes when the last piece is in - and every stage layout
in both orientations - holes stay on canvas, snap zones never overlap, tray slots
never collide, pieces stay big enough to grab, and each orientation fills at
least 75% of its viewport. Because the cast is random, the layout checks run
against a rotation of the animal list that puts every animal in every place.

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
