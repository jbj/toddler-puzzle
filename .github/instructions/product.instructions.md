---
name: "Product decisions"
description: "What Animal Puzzle is for, the invariants that must not be weakened, and the tie-breaker for an open design question."
---

# Product decisions

Animal Puzzle is a drag-and-drop animal shape puzzle for toddlers: a two-year-old
matches large animal pieces to matching animal-shaped holes. A game is thirty
levels long, in six chapters of five, and it grows as it goes - bubbles to pop
and one animal to drag to begin with, so the first win comes quickly, then more
pieces, more kinds of puzzle, and a little less forgiveness as it climbs.

This file is the one to read before changing what the game *does*. It is not
attached automatically, because most changes do not need it; read it whenever a
task touches behaviour a player would notice.

## Tie-breaker

The user is a two-year-old who cannot read. When a design question is genuinely
open, choose whatever is more forgiving and requires less understanding. This
settles most arguments.

## Invariants

These are deliberate. Each one has a reason, and several of them look like
oversights until you know it, so the reason is written next to the rule.

- Draw the hole and the piece from the same `#silhouette` path. Never draw them
  separately. Why: one path makes it impossible for a piece to drift out of
  alignment with its hole.
- Keep `#detail` inside `#silhouette` unless an element is tagged
  `data-overhang="..."`; tagged overhang is budgeted at 3% of the animal's area.
  Why: accidental overhang makes a piece look as if it does not fit.
- Set `FOOT_LEVEL` in `src/assets.ts`, which becomes each shape's anchor, from
  `npm run art:check`, never by eye. Why: the check measures where the animal
  actually stands.
- Let a piece snap only into its own hole. Make it impossible to place an animal
  wrongly; a wrong drop drifts back to the tray with a soft warm tone, never a
  buzzer. Why: the game should correct imprecision without scolding.
- Paint no animal into a background, ever, in any theme. A themed level stands
  its cast in that theme's world - the farmyard, the jungle path, under water -
  but the farmyard's cow is drawn there as a tractor and the rockpool's crab is
  left out. Why: a cow standing in the field beside a cow-shaped hole tells a
  two-year-old, correctly as far as they can tell, that the cow they are holding
  is already there. The backdrop rules are in
  [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md); the reasoning
  is
  [decision 20260731T090000](../../docs/decisions/20260731T090000-a-background-belongs-to-the-theme.md).
- Measure a piece by one box and place it by one rule, in every kind of puzzle:
  the box is what the piece draws, thickened so neither side is under half the
  other, and a drop is taken when that box covers the middle of where the piece
  belongs. The same box is what a piece can be grabbed by, what holds it on the
  canvas, and what the tray packs a cell from. Do not tighten it, and do not
  give a kind a rule of its own. Why: near misses should count for a toddler,
  and forgiveness measured five different ways feels like five different games.
  See [decision 20260731T133000](../../docs/decisions/20260731T133000-one-box-measures-a-piece.md).
- Keep the idle hint silent, unrepeated and unearned: it is a glow and never a
  sound, it never counts down or nags a second time, and it costs nothing to have
  needed. Never let it point at a level played by touching, and never let it
  arrive on top of a celebration. Why: this is the anti-frustration valve at the
  young end, and it stops being one the moment it feels like being told off. See
  [decision 20260730T213000](../../docs/decisions/20260730T213000-a-hint-points-at-both-ends.md).
- Let the child's game move only forward: no menu, no difficulty picker, no
  settings, no failure state, and no score on the play surface. The chapter dots
  are an indicator for a grown-up, not a control, and `?level=` in the URL is a
  tool for working on the game, not a way in. Why: a two-year-old cannot read or
  configure a toy.
- Mark the end of a chapter and the end of the game, and make both of them
  something to play with rather than something to sit through. Never let a
  celebration change the level by itself, and never let one run for more than the
  first moment without the button onwards on screen - that first moment is the
  one thing the button waits for, because after twenty-five presses it would
  otherwise be pressed before the celebration was noticed. Why: thirty identical
  fanfares stop meaning anything by level twenty, and a two-year-old will tap an
  animation rather than wait for it - so a celebration that has to be finished is
  a trap and one that can be left early is a gift. See
  [decision 20260729T152400](../../docs/decisions/20260729T152400-a-celebration-is-played-not-finished.md).
- Keep everything a grown-up can change behind the two-second hold on the
  "Grown-ups" button, and keep the panel behind it plainly styled for an adult.
  Do not move any of it onto the play surface, and do not hide the button behind
  a secret gesture instead. Why: a toddler cannot wait two seconds and a parent
  cannot find a secret; the panel is the sanctioned exception to the rule above,
  and it earns that by being unreachable by tapping. See
  [decision 20260729T000652](../../docs/decisions/20260729T000652-a-door-for-grown-ups.md).
- Let a grown-up take a kind of puzzle out of the thirty from that panel, one
  switch per kind, but never the last one and never by editing the level table.
  A kind switched off is stepped over; the ramp, its order and the child's
  screen are unchanged. Why: the thirty levels span about a year of development
  and no child is at every point of it at once, but a two-year-old handed a
  nine-piece jigsaw does not stretch, they stop playing. See
  [decision 20260730T194900](../../docs/decisions/20260730T194900-a-grown-up-can-take-a-kind-out.md).
- Resume on the level the child stopped on, and treat storage as a nicety rather
  than a dependency: any failure to remember - a browser that refuses, a record
  that is corrupt, a level number the table no longer has - falls back silently
  to level 1 and a game that plays. Why: iPad Safari in private browsing throws
  on the sight of `localStorage`, and a toy that will not start is worse than a
  toy that forgets. See
  [decision 20260728T212500](../../docs/decisions/20260728T212500-remember-where-the-child-stopped.md).
- Let nothing on the screen move while nobody is playing with it. Two minutes
  untouched, or a hidden tab, and the whole page freezes - every animation, every
  repeating timer, the speakers - until somebody is there again: a finger, or the
  tab being looked at once more. A freeze is never a
  change: nothing ends, nothing advances, and the touch that wakes the game
  plays it too. Why: a two-year-old does not close a tab, so the realistic end
  of every session is a tablet put down on whatever was on screen, and the game
  should stop costing anything the moment it stops being played. See
  [decision 20260801T153000](../../docs/decisions/20260801T153000-the-game-sleeps-when-nobody-is-playing.md).
- Keep the project free of binary assets, runtime dependencies, and network
  requests. Art is hand-authored SVG; sound is synthesised with the Web Audio
  API. Why: there is nothing to download and nothing to fail to load.
- Keep the game inside its bundle budget, and keep every chunk it is split into
  warmed during play rather than fetched when it is reached. A child must never
  wait at a level seam, and a chapter must never be one network request away
  from being unplayable. Why: the budget is what stops the first download
  drifting upwards a good change at a time, and the warm is what lets the game
  be split at all without putting a two-year-old in front of nothing. See
  [decision 20260729T223500](../../docs/decisions/20260729T223500-a-chapter-is-warmed-before-it-is-needed.md).
- Keep every target large; pieces stay well over a tenth of the canvas wide. Why:
  small hands need large things to grab.
- Keep the opening chapter playable without a drag. Levels 1, 3 and 5 are
  cause-and-effect levels - touch a thing, a thing happens - and they end when
  enough things have been touched rather than when a tray is empty, or when the
  level's ten seconds are up, whichever comes first. Ask for a handful of
  touches, never a screenful, and never make one of them require aiming,
  carrying or letting go. Why: dragging is a chain of three things a one-year-old
  can do none of, and a first screen they cannot work is a closed door rather
  than a gentle beginning - and a child who does not know they are counting up to
  something must not be able to miss the way onwards by playing the level the way
  it was meant to be played. See
  [decision 20260729T072100](../../docs/decisions/20260729T072100-the-game-opens-with-something-to-touch.md)
  and
  [decision 20260801T163000](../../docs/decisions/20260801T163000-a-touch-level-lets-a-child-out.md).

## What the invariants add up to

**Everything is forgiving.** A piece only ever snaps into its *own* hole, so it
is impossible to place an animal "wrongly". Forgiveness is one box and one rule:
a piece is measured by what it draws, thickened so neither side is under half the
other, and it goes home when that box - dropped where the finger let go - covers
the middle of the place it belongs. So half a piece out is in, on any axis, in
every kind of puzzle, and a long thin sliver is given as much room to aim at as a
square piece of the same length. Any other drop drifts gently back to the tray.
The same box is what a piece can be grabbed by, what holds it on the canvas so it
can never be dragged out of reach, and what the tray reserves a cell from. A
wrong drop plays a soft, warm tone rather than a buzzer. And a
child who stops getting anywhere is led rather than left: after a stretch with no
progress the board glows quietly at both ends of the move it is waiting for - the
piece, and where the piece goes - silently, with nothing lost and nothing said.
The mechanics are in
[`navigation.instructions.md`](navigation.instructions.md); the reasoning is
[decision 20260727T072917](../../docs/decisions/20260727T072917-generous-snap-radius.md),
[decision 20260731T133000](../../docs/decisions/20260731T133000-one-box-measures-a-piece.md)
and
[decision 20260730T213000](../../docs/decisions/20260730T213000-a-hint-points-at-both-ends.md).

**The way in needs no dragging.** The opening chapter alternates: levels 1, 3
and 5 are cause and effect - bubbles that burst under a finger, bushes that
uncover an animal, a scene where the sun and the clouds and the animals all
answer - and levels 2 and 4 are the smallest drags the game can ask for. A
one-year-old who cannot yet pinch, carry and let go still wins something, and
finds the drag waiting whenever they are ready for it. Those three levels ask
for a handful of touches and then let the child out anyway: ten seconds in, the
same button as every other level is up whatever has been touched, and nothing is
taken off the screen when it arrives. The mechanics are in
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md); the reasoning is
[decision 20260729T072100](../../docs/decisions/20260729T072100-the-game-opens-with-something-to-touch.md)
and
[decision 20260801T163000](../../docs/decisions/20260801T163000-a-touch-level-lets-a-child-out.md).

**The game only ever moves forward.** There is no menu and no difficulty picker
in front of the child: the thirty levels are always played in the same order, the
button at the end of one leads straight into the next, and the button after the
last one starts again at level 1. Six dots by the reset button, one per chapter,
show a grown-up how far along the set is; they are not a control. See
[decision 20260727T072917](../../docs/decisions/20260727T072917-no-menu-or-difficulty-picker.md).

**The end of a chapter is a moment, and the end of the game is an ending.** The
fifth level of every chapter finishes into a celebration - balloons, a rainbow
the child paints a tap at a time, blossom, a parade of animals to poke,
fireworks - and level 30 finishes into all of them at once, which never winds
down. None of them is ever made of what the finished board is made of, which is
why the parade walks over the chapter of coloured shapes rather than the chapter
of animals. Every one of them is played rather than watched, the button onwards
fades up a beat in and then stays for the rest of the party, and no clock ever
moves the child on. The mechanics are in
[`navigation.instructions.md`](navigation.instructions.md); the reasoning is
[decision 20260729T152400](../../docs/decisions/20260729T152400-a-celebration-is-played-not-finished.md)
and
[decision 20260801T160000](../../docs/decisions/20260801T160000-a-celebration-is-not-made-of-the-board.md).

**A grown-up can steer, from behind a hold.** Thirty levels and options that
apply across all of them need somebody who can read to be able to say where the
child should be, which kinds of puzzle they are ready for, and how forgiving the
game is. So there is one panel, opened by holding a labelled "Grown-ups" button
for two seconds - taps never open it, however many - holding a map of the thirty
levels, the switches, and the only reset in the game. It is deliberately styled
for an adult rather than a child. Among the switches is one per kind of puzzle,
so a parent can take the jigsaws out for a year and leave the animals in; the
game steps over what is switched off and goes on running forward, and it refuses
to let the last kind go. The mechanics are in
[`navigation.instructions.md`](navigation.instructions.md); the reasoning is
[decision 20260729T000652](../../docs/decisions/20260729T000652-a-door-for-grown-ups.md)
and
[decision 20260730T194900](../../docs/decisions/20260730T194900-a-grown-up-can-take-a-kind-out.md).

**And it picks up where it left off.** The level being played is remembered
between sittings, so a child who plays ten minutes a day works along the thirty
rather than replaying the first five. Forgetting is always allowed - a browser
that will not store anything simply starts at level 1 - and the mechanics are in
[`navigation.instructions.md`](navigation.instructions.md).

**Toddler-proofing.** Pinch-zoom, double-tap zoom, text selection, long-press
context menus and native image dragging are all disabled. Every target is large.
While dragging, the piece is held slightly above the finger so a small hand
doesn't cover it.

**And it stops when it is put down.** Two minutes untouched, or a tab going
behind another window, and the whole page freezes: the hint holds instead of
pulsing, the bubbles hang where they are, a celebration stands still, and the
speakers are put down. A finger starts all of it again exactly where it stopped,
and pops the bubble it landed on while it is at it - as does coming back to the
tab at all. Nothing ends and nothing
moves on, because a two-year-old does not close a tab and the game they left is
the game they should come back to. The mechanics are in
[`navigation.instructions.md`](navigation.instructions.md); the reasoning is
[decision 20260801T153000](../../docs/decisions/20260801T153000-the-game-sleeps-when-nobody-is-playing.md).

**No binary assets, and a budget on the rest.** The animals are hand-authored
SVG and the sounds are synthesised with the Web Audio API, so there is nothing
to download and nothing to fail to load. The game is around 37 kB gzipped before
the first level appears and around 60 kB in total; `npm run build` fails if
either grows past its budget. The difference between those two numbers is the
four later chapters, split into a chunk each and fetched in the background while
the child plays the first one, so nothing arrives later than it used to and no
level seam ever waits. See
[decision 20260727T072917](../../docs/decisions/20260727T072917-no-binary-assets-or-runtime-dependencies.md)
and
[decision 20260729T223500](../../docs/decisions/20260729T223500-a-chapter-is-warmed-before-it-is-needed.md).

**Every puzzle is dealt fresh.** Which animals turn up and the order they stand
in are drawn at random each time a puzzle starts, so the same animals are
never waiting in the same places twice. Add `?seed=123` to the URL to replay a
particular deal - the screenshot run uses it to keep its shots comparable.
