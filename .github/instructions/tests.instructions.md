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
orientations), snap tolerance, clamping, the grab-box geometry - a measured
drawing grown by its margin and held inside the piece's own box - the random
deal, the shape-match kind's rules - it accepts a sloppy drop on a piece's own
hole, never accepts anybody else's, and only finishes when the last piece is in
- and the composed layouts:
targets stay on canvas and clear of the tray, every piece stands on one of the
layout's ground lines, snap zones never reach each other, tray slots never
collide or sit in a target's snap zone, pieces stay big enough to grab, and each
orientation fills at least 75% of its viewport. Alongside those it checks what
composing is *for*: the same cast composes twice the same, a fuller board never
gets bigger pieces, portrait stacks more rows than landscape spreads, and a cast
too big to compose above the grabbable size is refused rather than shrunk away.

`tests/progress.test.ts` covers what is remembered between sittings, and is
mostly the unhappy paths, because that is what the storage layer is for: a
resumed level, a corrupt record, a version this build does not know, a level
number the table no longer has, a browser that throws on every call, and one
that reads back yesterday's record but refuses every write - which resumes on it
all the same, and only says so through `persists`. All of them have to end with
a playable game on a real level, and none of them may throw. The storage object
is injected, so none of it needs a browser; the DOM-facing ends are covered by
`npm run shot`, which reloads the page and checks the game comes back where it
was.

Every animal is square, so both suites also carry a plank and a pole - pieces
that are deliberately not square, in both directions. They keep the engine
honest about per-piece bounds: each is clamped and snapped by its own box, so a
wide piece cannot borrow its width's forgiveness for its short axis. Add such a
case whenever a check would otherwise pass only because a piece happens to be
square.

## What `npm run shot` covers

`npm run shot` is an end-to-end check: it serves the built app, drives real
pointer drags over the Chrome DevTools Protocol, and plays the whole first
chapter through, then jumps by `?level=` to the busiest board of animals and to
the last level - asserting that pieces snap, that a bad drop does *not* stick,
that each level hands over to the next, that a level whose kind is not built yet
is still a complete playable level, that the boards grow rather than shrink as a
chapter goes on, that the chapter dots track the chapter, that rotating to
portrait preserves progress, that reopening the game resumes on the level the
child stopped on while a level played from `?level=` leaves that alone, that the
last level loops back to the first, and
that different seeds deal different puzzles while one seed always deals the same.
It plays a sample rather than all thirty because thirty levels of real pointer
drags would take minutes; the table itself is swept in `tests/levels.test.ts`. Screenshots land in `.art/shots/`,
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
