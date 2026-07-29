# 20260729T223500. A chapter is warmed before it is needed, not fetched when it is

## Context

"No binary assets, nothing to download and nothing to fail to load" is a stated
property of this game
([decision 20260727T072917](20260727T072917-no-binary-assets-or-runtime-dependencies.md)),
and the point of it is that a mid-range iPad reaches the first level
immediately. Nothing was measuring that, so it drifted. The bundle was 24 kB
when the ramp was five levels of one kind. By the time six chapters, five puzzle
kinds, four themed casts, a scene library, six celebrations and a vocabulary of
synthesised sounds had all landed, it was **148 kB raw and 47 kB gzipped** -
every byte of it fetched, parsed and evaluated before a one-year-old could touch
the first bubble. Every one of those changes was a good change. Together they
were a regression nobody decided on.

Issue #20 asked for two things: a budget the build enforces, and code-splitting
by chapter. The second one is where the care is needed, because splitting a
toddler's game is a way to make it worse.

## The trap

The obvious split is lazy loading: fetch a chapter's artwork when the child
reaches that chapter. That is a bad trade here, and it is worth being explicit
about why, because it is the design somebody will reach for again.

A two-year-old finishes level 20, presses the one big button, and is shown
*nothing* while a chunk downloads. There is no spinner in this game and there
should not be one - it would be a thing that has to be understood, and the
audience cannot read. On a slow connection the gap is seconds; on a connection
that has dropped since the page loaded, it never ends. A game that is smaller
but stutters between levels is worse than one that is larger and never does.

The second trap is the fail-fast rule. `loadAnimalShapes()` and `loadPictures()`
parse every asset up front *on purpose*, so a malformed one throws at startup in
a developer's hands. Made lazy naively, a malformed scene would instead break at
level 21 in a child's.

## Decision

**The bundle is split by puzzle kind, and every split-off chunk is warmed during
play rather than fetched on demand.**

A chapter is five levels and, near enough, one kind - chapter 3 is `sliced`,
chapter 4 `polygon`, chapter 5 `jigsaw` - so splitting by kind *is* splitting by
chapter, and it degrades gracefully for chapter 6, which mixes three. Each kind
brings its own machinery and artwork with it, which is most of what the game
weighs.

Three rules make it safe:

**Chapters 1 and 2 are inline.** `play` and `shapeMatch` are static imports in
`src/kinds/registry.ts`. A new player - which is every player, once - starts
with nothing at all to wait for.

**Everything else is fetched while the child is busy.** `src/warm.ts` starts
once the first board is standing, and pulls the celebration and then every
remaining kind, in play order, one at a time. A level takes a toddler tens of
seconds; a chunk takes milliseconds. By the time a chapter is reached its code
has been in memory for a quarter of an hour, and the level seam is a resolved
promise rather than a fetch.

**Nothing ever shows an empty stage.** If a chunk somehow has not arrived -
first sitting, bad connection, a grown-up jumping to level 26 from the panel -
the board that is up stays up until it does. If the *celebration* chunk fails,
the chapter ends the way an ordinary level ends, with its fanfare and its button
onwards: a missing party is a disappointment, a missing way out would be a trap.
A failed fetch is forgotten rather than remembered, so the next ask tries again.

The fail-fast tension is resolved the way the issue proposed, and most of the
work was already done. `scripts/check-art.mjs` enforces the animal contract and
the scene contract, and `tests/pictures.test.ts` (with the jigsaw, shatter and
puzzle suites behind it) calls `loadPictures()` and asserts the whole catalogue
parses. Both run inside `npm run verify`, which is the whole of CI. So no asset
can ship malformed whether or not the runtime parses it at boot. The runtime's
eager parse was a *second* line, not the only one. Animals are parsed eagerly
regardless, because level 2 wants them.

The budget is `scripts/check-bundle.mjs`, chained into `npm run build` so that
exceeding it fails the build rather than a report nobody reads. It holds four
numbers - initial and total, raw and gzipped - and prints the table whether it
passes or fails, because the point is to make the size visible rather than to
catch somebody out. The **initial** figure is the one the game is judged on:
`index.html`, the stylesheet in its head, the entry chunk, and everything the
entry imports statically.

## Consequence

|  | before | after |
| --- | --- | --- |
| before the first level appears, raw | 148.2 kB | **92.7 kB** |
| before the first level appears, gzipped | 47.5 kB | **30.1 kB** |
| everything, raw | 148.2 kB | 152.1 kB |
| everything, gzipped | 47.5 kB | 51.8 kB |

A child downloads and parses **37% less** before the game starts. The total grew
by about 4 kB gzipped, which is the price of splitting one compressed stream
into seven, and it is paid in the background while somebody is popping bubbles.
That trade is the whole decision in one line: the number that matters got much
smaller, and the number that does not got slightly bigger.

**The offline promise survives, and is not weakened.** Every chunk is requested
during the *first* sitting, warm, in the background. Whatever cache held the
single bundle for a second sitting holds all of the chunks for a second sitting
too, and nothing is fetched later than it used to be. No service worker, no
manifest, no runtime dependency and no binary asset were added. A child resuming
at level 17 is in fact better off than before: they fetch the entry chunk and
one kind chunk, which is less than the single bundle used to be, not more.

**A kind is now a code-splitting boundary.** `kindFor` stays synchronous and
stays strict, so the host and the tests go on treating a kind as a plain object;
`ensureKind` is the one place that waits. Two test suites use the registry and
now ask for `loadAllKinds()` first, which is what the running game's warm does
for them.

**The grown-up panel was deliberately left inline.** It is the third largest
thing in the initial chunk, and splitting it means separating `applySettings` -
which has to be in force before the first sound can play - from the panel body.
The win did not justify touching the one surface that gates sound at boot. It is
the obvious next thing if the budget ever needs the room.

**Raising a budget is allowed; raising one quietly is not.** The numbers were
set at the measurement with about a tenth of headroom - enough that an ordinary
change need not touch the file, little enough that a chapter's worth of new art
must. If the truth does not fit, the budget is wrong and should move. What must
never happen is the other resolution: shipping less art than the game needs, or
weakening a check, to stay underneath a number.
