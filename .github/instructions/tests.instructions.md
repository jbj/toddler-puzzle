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

A suite that reaches for the kind registry has to `await loadAllKinds()` at the
top of the module first: four of the six kinds are a chunk each, and `kindFor`
stays synchronous and strict rather than waiting. Vitest handles the top-level
await. `tests/levels.test.ts` and `tests/puzzle.test.ts` do this already.

## A check that inspects nothing passes

This is the failure mode this repository keeps finding, so it is worth knowing
by shape rather than meeting one at a time. Every one of these was green, and
none of them was looking at anything:

- A rule over `querySelectorAll(...)` expressed as `filter(...).length === 0`.
  Rename the class and the selector matches nothing, the filter finds nothing to
  object to, and the check passes having read no elements.
- A `for` loop over a glob with the assertions inside the loop. If the glob
  matches nothing the body never runs, so the test makes no assertion at all -
  including the one in its own name.
- A required set derived by parsing a source file. If the parse silently matches
  fewer things than it should, everything compared against it agrees, because
  they are all comparing against the same smaller world. **A parser that returns
  fewer results than it should is indistinguishable from a world with fewer
  things in it.**

So when a check iterates a set it discovered rather than one it was given,
assert the set is not empty, and put what it actually read into the message -
`(6 kinds, 6 chapters, 6 celebrations)` tells a later reader the difference
between a real pass and a broken parse. Where one number can be cross-checked
against another that was found a different way, do that: the shot run's coverage
guard compares the levels it parsed against the levels the running game shows,
which is what makes a thinning parse visible. See
[decision 20260730T005900](../../docs/decisions/20260730T005900-guard-the-sample-against-the-table.md).

Then make it fail on purpose, once, and watch it. Break the thing it is meant to
catch, run it, read the message, and put it back. A guard nobody has seen fail
is a guard nobody knows works, and the message it prints when it does fail is
half of what it is for.

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

`tests/levels.test.ts` sweeps the whole table: every level resolves to a
buildable spec, and the deal is drawn fresh but always the right size. It also
covers themed dealing, which is where the interesting failures are: a themed
level draws only from its own theme, every animal of a theme is reachable, and a
theme too short for the level's piece count is topped up from the rest of the
cast and reshuffled rather than throwing. That last one is checked with a
deliberately starved provider, because the fallback exists for a cast that
changes under the table, not for the cast as it stands today. Last, it checks
what the warm asks for (`src/warm.ts`): every kind is named from wherever the
child is standing, in the order the levels will want them, wrapping round for a
level a grown-up went back to. A kind the warm never names is a kind a child
would wait for.

`tests/slices.test.ts` covers the sliced chapter, in two halves. The cells are
arithmetic: every committed recipe is replayed and checked to *tile* the art box
- areas summing to the box, and every sampled point in exactly one cell - because
a gap is a stripe of the animal that no slice draws and an overlap is a stripe
two slices both draw, and neither shows up in a screenshot of a duck that is
almost right. The kind is rules: every slice of an animal keeps that animal's
box, anchor and outline and aims at its one hole, a slice is accepted anywhere
on its own animal and never on the other one, and the hole stays showing until
the last slice arrives. Where the cuts actually *go* is not checked there - only
`npm run art:check` can see whether a cut severed a leg.

`tests/polygon.test.ts` covers the picture chapter, also in two halves. The
catalogue is geometry: every scene's parts stay inside the box and never overlap
- sampled, because two shapes that share a corner are fine and two that share an
area are a picture drawn wrong - none is too small for a tray to draw
grabbably, and any two congruent parts are painted identically, since a swap
must not change the picture. The kind is rules, and mostly the swap: a piece is
accepted by any free shadow of its own shape and by no other, a shadow already
filled refuses even a dead-centre drop, congruent shadows sit far enough apart
that such a drop cannot jump to a twin, the piece displaced by a swap is
expected somewhere else afterwards, and a picture finishes however the twins
were shared out - including in reverse order, which is the arrangement an
identity assignment would fail. `openTargets` is held to the same rule as the
drop: for every part of every scene it offers exactly one point per congruent
place, every point it offers would actually be accepted, the place the piece is
aimed at now is always among them, and a place stops being offered the moment
something is standing in it. Whether a scene *reads* as a house is not checked
there; only a screenshot can see that.

`tests/play.test.ts` covers the cause-and-effect levels, and it covers the two
promises rather than the drawing, because those are properties of the rules and
the drawing does not survive leaving the browser. **No way to be wrong**: the
kind accepts no drop at all, wherever it is offered - dead centre on a hole
included - and deals nothing into `placed`. **No way to get stuck**: for every
activity and every cast size the goal is no more than the number of things the
activity puts on screen, and for everything but peekaboo strictly fewer, so a
child who ignores one thing can still finish; the level is not complete before
the goal and never comes undone after it. It also holds the table to naming an
activity on every `play` level, to naming each of them only once, and to opening
the first chapter on one. Whether a bubble is big enough to hit, whether a touch
registers and whether the level can actually be finished by touching are all
`npm run shot`'s.

`tests/celebration.test.ts` covers where the chapter celebrations fall, and
almost nothing else, because almost all of a celebration is a thing on a screen
answering a finger and this suite has no screen. What it holds is the wiring
nobody would notice was wrong until a child had played twenty-five levels to
find out: that every chapter names a celebration and no two name the same one,
that the finale belongs to the last chapter and to nothing else, that
`endsChapter` agrees level by level with the chapter numbering it is read from -
5, 10, 15, 20, 25 and 30 as the table stands - and that a level the table does
not have ends nothing rather than throwing. Whether a celebration is *played*,
whether the way onwards is up while it runs, whether the sky refills and whether
it survives a rotation are all `npm run shot`'s.

`tests/audio.test.ts` covers the *shape* of the sound vocabulary, against a fake
`AudioContext` handed to the module through `useAudioContext` - a seam that
exists for this suite and for the offline render, and that the game never
touches. It is where the one hard rule lives: the suite enumerates the module's
own exports, finds every `play` function, and insists each one is silent when
the toggle is off, so a sound added later that forgets the toggle fails here
rather than on a train. Around that it holds the things a compiler cannot state:
that every puzzle kind and every celebration resolves to a phrase and no two
share one, that a long run of pops never repeats a pitch immediately, that no
voice exceeds the gain ceiling, that nothing but a sine or a triangle is ever
asked for, that every pitch sits on the ladder, and that two hundred pops in one
tick neither throw nor outrun the voice budget, and disconnect what they used.
Whether any of it sounds *nice* is nobody's test; whether it sounds harsh is
`npm run audio:check`'s.

`tests/progress.test.ts` covers what is remembered between sittings, and is
mostly the unhappy paths, because that is what the storage layer is for: a
resumed level, a corrupt record, a version this build does not know, a level
number the table no longer has, a browser that throws on every call, and one
that reads back yesterday's record but refuses every write - which resumes on it
all the same, and only says so through `persists`. Alongside those it covers the
one thing that moves the record without the child moving: a level chosen from
the grown-up panel's map, which is remembered without ever raising `furthest`.
A record carrying a setting this build no longer has - `rotation`, dropped with
the feature in
[decision 20260730T203000](../../docs/decisions/20260730T203000-no-rotation-mode.md)
- is covered there too, because removing a field must never cost a child their
level.
All of them have to end with
a playable game on a real level, and none of them may throw. The storage object
is injected, so none of it needs a browser; the DOM-facing ends are covered by
`npm run shot`, which reloads the page and checks the game comes back where it
was.

`tests/pictures.test.ts` covers the jigsaw scene library: that every registered
scene loads and comes back with artwork safe to inline more than once in one
document, that every scene the level table names resolves to one, that an
unknown id throws saying which id, and that the picture box divides evenly by
every grid the table cuts at - the property the whole cutter rests on.

`tests/jigsaw.test.ts` covers the cutter and the kind that plays it. The half
worth knowing about is the cut, and it is measured rather than looked at: two
neighbours are checked to hold the *same* curve point for point, one of them
reversed, at every grid the table cuts at - not "to within a tolerance", which
is what a jigsaw whose tabs nearly fit looks like. The tiling follows and is
measured too, by flattening every outline and adding the areas up: short of the
box is a stripe of the picture no piece draws, over it is a stripe two pieces
both draw. Alongside those it holds the sizes - one tab per axis per piece and
never none at all, a tab that shrinks with the cell, a border that stays
straight - because those are what keep the busiest board's pieces big enough to
grab. What a cut-up picture actually looks like is `npm run shot`'s, which plays
a jigsaw level and finishes it.

`tests/shatter.test.ts` covers the irregular partition and the kind that plays
it, and almost all of it is a **sweep**: every count from two to twelve, many
seeds each, because a partition is a search and one deal proves nothing about
the next. What is swept is exactly what the kind promises - shards convex to
floating point (normalise the turn by the side lengths, or a collinear vertex
from a split edge reads as a notch at minus 1e-14), tiling the box to nine
decimal places, every cut walked once forwards and once backwards, and all four
floors: area share, fatness, spread, and no two shards alike. Reproducibility
from a seed is checked both ways round: the same seed twice gives the same
shards, and two seeds give different ones. What a shattered picture actually
looks like is `npm run shot`'s, which plays level 26 and finishes it.

`tests/scene-cells.test.mjs` covers the measure behind "every piece has
something in it", which is the one piece of real logic in the art scripts. It is
written as plain ESM rather than TypeScript because it imports
`scripts/pictures.mjs`, which the game's tsconfig does not cover. It feeds the
measure pixels rather than pictures: a flat wash scores nothing, two halves
score a half, a speck scores a speck, two shades of the same green score nothing
(the measure is not a variance, on purpose), and the cut tiles the box exactly
once with no pixel counted twice or missed.

`tests/hint.test.ts` covers the idle hint's rule without a DOM. The timer is a
fake with the callback held rather than fired, which is the only way to ask the
questions that matter: does a hint armed against a board that has since been
replaced draw anything (no - `stop()` latches, and the latch is checked inside
the callback), and does a stray event on a torn-down board re-arm it (no).
Alongside that: the delays are ordered and `off` is nothing at all, a stir before
the delay restarts the wait rather than queueing a second one, a pause takes a
showing hint down and arms nothing until the next stir, a grown-up switching to
"Off" takes a showing hint down at once and switching to "Sooner" re-arms a live
one on the shorter clock, and `hintPiece` picks the last-touched piece while it
is unplaced, the first unplaced one when it is not, nothing when the board is
finished, and ignores a `lastTouched` left over from another board. What the
glow *looks* like is `npm run shot`'s.

`tests/grownups.test.ts` covers the two parts of the grown-up panel that do not
need a browser: the hold that opens it, and the level map. The hold is a state
machine with the clock passed in, so two hundred taps - none of which may open
anything - are played through it in a millisecond, alongside a hold that opens,
a release that empties the ring, two near misses that must not add up to one
hold, and the "Hold to open" prompt outliving the press that raised it. The map
is checked for saying what it means: thirty squares in six chapters of five,
filled only up to `furthest`, exactly one marked current, and the current one
taken from the game rather than the record, because `?level=` plays a level the
record was deliberately not told about. The DOM around both - the button, the
sheet, the switches - is `npm run shot`'s.

Every animal fills its box, so the layout suite also carries casts that do not:
grid-cut stand-ins for slices, whose drawing is a corner of a box the size of a
whole animal. They keep the tray honest about packing by ink rather than by
slot, which is what stops eight slices composing an animal too small to see.

Every animal is square, so the geometry and layout suites also carry a plank and
a pole - pieces that are deliberately not square, in both directions. They keep
the engine honest about per-piece bounds: each is clamped and snapped by its own box, so a
wide piece cannot borrow its width's forgiveness for its short axis. Add such a
case whenever a check would otherwise pass only because a piece happens to be
square.

## What `npm run shot` covers

`npm run shot` is an end-to-end check: it serves the built app, drives real
pointer drags and real taps over the Chrome DevTools Protocol, and plays the
whole first chapter through, then jumps by `?level=` to the busiest board of
animals, to a picture built out of shapes and to the last level - asserting that
pieces snap, that a bad drop does *not* stick, that each level hands over to the
next, that a level whose kind is not built yet is still a complete playable
level, that the chapter dots track the chapter, that rotating to
portrait preserves progress, that reopening the game resumes on the level the
child stopped on while a level played from `?level=` leaves that alone, that the
last level loops back to the first, and
that different seeds deal different puzzles while one seed always deals the same.

The first chapter is also where the levels played by touching are exercised, and
they cannot be checked any other way: three of the five are activities, and what
the run plays through is that a tap on a thing registers *every* time (it counts
the ones that do not and insists on none), that the level finishes on taps
alone, that nothing waits in a tray and no hole is cut, that every bubble is
more than a tenth of the board across, that a tap on empty sky changes nothing
at all, that popping the bubbles never empties the sky, that a scene puts more
things on screen than it asks for, and that re-dealing a touch level takes the
old board's bubbles away with it rather than adding to them. See
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

The picture levels are also where the interchangeable-shapes rule is exercised
end to end, which no unit test can do: the run finds two identical shapes in a
scene, drags one onto the *other's* shadow, and checks it settles where it was
aimed rather than snapping back or sliding to the place it was dealt for, that
the shadows still name one shape each afterwards, and that the picture finishes
all the same. It shoots the same level in portrait too, because a picture is one
target with several pieces and the tray is what holds it down.

It is also the only place the grown-up panel is exercised as a grown-up would
use it: six taps on the button open nothing and put "Hold to open" up instead, a
two-second hold opens it, the level map shows thirty squares with the six played
ones filled, choosing a level deals it and is remembered without claiming the
child reached it, a switch turned off survives closing the panel and then a
whole reload of the page, and resetting asks once before starting the game over.
It also reads the option labels off the panel and checks the list, which is how
a switch that does nothing is kept off it - and reads the notes underneath for
any that admits to doing nothing yet, which is how a label that does something
and a description that says it does not are kept from drifting apart.

It is the only place the idle hint can be seen at all, because the hint is what
happens when *nothing* happens. The run drives the panel to "Sooner", closes it,
and leaves a real board alone: a glow arrives within a window deliberately much
longer than the delay (a loaded machine loses a second or two, and a check that
fails for that reason teaches nobody anything), it has two marks, none of them
filled - which is the whole reason it cannot be mistaken for a hole already
filled - it names a piece still waiting, its bright end lands on that piece's
hole and its quiet end under the piece itself, both within a few per cent of the
hole's size, and every one of those checks prints the pixels it measured. Then a
tap on an empty part of the board takes it away in the same tick, going quiet
again brings it back, and placing a piece takes it away for good. A level played
by touching is left alone for the same window and never glows, and neither does a
chapter celebration. Hints go back off afterwards, so no later screenshot is
quietly changed by a glow that happened to be due when the shutter went.

The polygon level is where the *choice* of place is checked, and it is checked
end to end because only the browser can prove the host asks `openTargets` rather
than quietly falling back to `target`. The run finds two identical shapes, taps
one of them - a drag that goes nowhere, which is an interaction all the same -
and waits: the hint must be about the piece last touched, and must glow every
free shadow that would take it. The count it is held to is worked out from the
page, by comparing what the shadows *draw* against what the piece draws, so the
check cannot be satisfied by a number somebody wrote down. Both the piece's own
shadow and its twin's are then checked to be among the places offered.

It is the only place the chapter celebrations can be *played*, which is the only
way to find out whether they work. All six are reached and shot. The balloons
are played hardest, because everything that could go wrong with a celebration
can go wrong with them: the run checks the celebration goes up on finishing
level 5 and not before, that every balloon is more than a tenth of the board
across, that the celebration has the screen to itself for the first beat and
answers a finger during it, that the way onwards then arrives on its own and
stays for the rest of the party, that popped balloons all burst and are counted,
that the sky
fills itself back up, that the level does not change underneath the child, that
nothing floats over the button out, and that turning the tablet keeps both the
celebration and what has been played with. The finale then gets the same
treatment plus the two things only it does: several kinds of thing to touch at
once, and a tap on bare sky still answered. See
[`navigation.instructions.md`](navigation.instructions.md).

It plays a sample rather than all thirty because thirty levels of real pointer
drags would take minutes; the table itself is swept in `tests/levels.test.ts`.
Screenshots land in `.art/shots/`, alongside a `contact-sheet.png` that collects
them into one image to drag into a pull request.

The sample is a hand-written list of levels, so the run ends by **guarding it
against the table**: it reads every kind and chapter from `src/levels.ts` and
every celebration from `src/celebration.ts`, records what the running game
actually put on screen as it played, and fails - naming the first level that
would cover the gap - when the table names a kind, a chapter or a celebration no
shot exercised. This is what stops the sample thinning in silence as the game
grows: add a seventh kind and the guard insists a shot reach it, rather than the
run going green while testing less. It guards its own honesty too - it proves the
parse saw the whole table before trusting it, because a coverage check that
requires nothing passes while inspecting nothing. It costs no screenshots. See
[decision 20260730T005900](../../docs/decisions/20260730T005900-guard-the-sample-against-the-table.md).

It is where the cut edges are held to both halves of their rule, on all three
kinds that cut something up: on level 21 every piece still in the tray draws the
line it was cut along, and on the finished slices, jigsaw and shatter every
placed piece's edge has faded to nothing. It is also where the clip each piece
is wearing is read, which nothing but a browser knows - it is a CSS switch on a
custom property: a half-built jigsaw is still cut exactly where it was cut, each
of the three finished boards has switched to the wider clip that closes its
joins, and a piece put back into a settle keeps the clip it was made with. That
last one moves a class rather than racing the animation - the rule is about the
class, and a check that has to be quick enough to catch a real settle is a check
that fails on a slow day. Each check counts the pieces as well as measuring them, so a board that
drew none would fail rather than pass by having nothing to look at. Whether the
join underneath is truly seamless is the one part only the contact sheet can
answer. See
[decision 20260730T194500](../../docs/decisions/20260730T194500-a-placed-piece-has-no-edge.md).

It is also the only place the grab boxes can be checked, since they are measured
from rendered artwork: every piece has one, it covers the drawing without
ballooning past it, and a piece picked up somewhere its artwork is *not* still
comes along and snaps in. The last of those looks for a point inside a piece
where the topmost element is the grab box rather than paint, so it would go
green for the wrong reason if the box were ever moved in front of the artwork.

Run `npm run build` first; the shot run serves `dist/`. It honours `CHROME_BIN`.

## What `npm run audio:check` covers

Nobody can hear a pull request. So the sounds are rendered rather than
described: the script bundles `src/audio.ts`, serves it to headless Chromium,
and plays every entry in the module's own `VOCABULARY` through an
`OfflineAudioContext` - through the game's real scheduling function, not a
re-implementation - then measures the samples that come back. Peak amplitude
inside a ceiling and above an audible floor. No discontinuity at onset or
release, which is the thing that makes a click: the first and last samples must
be zero and no sample-to-sample step may exceed what the highest scheduled
frequency at that amplitude could produce. Duration in range. Spectral centroid
low enough to count as soft. Then everything at once, to see that a burst is
limited rather than clipped, and finally every sound again with the toggle off,
which has to come back bit-silent.

It is in `npm run verify`, so "nothing harsh" stays a check rather than a hope.
A failure prints the measured number next to the bound it broke. Adding a sound
to `VOCABULARY` is what puts it in front of all of this; a sound that is not
listed there is not measured.

`npm run audio` runs the same render and draws it, as `.art/audio/sheet.png` -
a waveform per sound, on two time axes so that a pop and the finale are both
legible. It is the only way a person can review a change to the sound, so put it
in the pull request.

## What the tests cannot see

The artwork. `npm run art:check` covers that, and
[`art.instructions.md`](art.instructions.md) says how. And what any of it
actually sounds like: the checks above can say a sound is soft, brief and
distinct from its neighbours, but not that it is the right sound for the moment.
Only a person with a speaker can say that.

Also anything nobody has staged. The checks in this repository are unusually
mechanical, and the gap that leaves is a particular one: **a claim about how
something behaves under conditions nobody created**. Such a sentence tends to
sound obviously true, and it is surrounded by measurements, so it inherits their
credibility without having earned any. Every one of these was believed, written
down, and wrong:

- That a failed chunk load could be retried. A browser remembers a dynamic
  import that failed and will not go near the network for it again, so the retry
  could never have run. Found by cutting the network, not by reading the code.
- That the game worked offline between sittings. It never had: the HTTP cache
  decides that, and it behaved identically before and after the change that was
  said to preserve it.
- That the safe-area rules were doing something. Headless Chrome reports every
  inset as `0px`, so a misspelt property name would have shipped green.
- That a manifest served correctly because its contents were right. It was
  served as `application/octet-stream`, which a browser rejects.

The habit that catches all four is the same: when you write a sentence about
behaviour, go and create the conditions it describes, and report what happened
rather than what you expected. `scripts/shot.mjs` is where conditions like these
can actually be made - it is the only place the network is taken away, the
viewport is not a desktop, and the insets are not zero.
