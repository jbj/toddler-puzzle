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
orientations), snap tolerance, clamping, the grab-box geometry - a measured
drawing grown by its margin and held inside the piece's own box - the random
deal, the shape-match kind's rules - it accepts a sloppy drop on a piece's own
hole, never accepts anybody else's, and only finishes when the last piece is
in - and every stage layout in both orientations - holes stay on canvas, snap
zones never overlap, tray slots never collide, pieces stay big enough to grab,
and each orientation fills at least 75% of its viewport. Because the cast is
random, the layout checks run against a rotation of the animal list that puts
every animal in every place.

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

It is also the only place the grab boxes can be checked, since they are measured
from rendered artwork: every piece has one, it covers the drawing without
ballooning past it, and a piece picked up somewhere its artwork is *not* still
comes along and snaps in. The last of those looks for a point inside a piece
where the topmost element is the grab box rather than paint, so it would go
green for the wrong reason if the box were ever moved in front of the artwork.

Run `npm run build` first; the shot run serves `dist/`. It honours `CHROME_BIN`.

## What the tests cannot see

The artwork. `npm run art:check` covers that, and
[`art.instructions.md`](art.instructions.md) says how.
