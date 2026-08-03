# Guard the sample against the table, rather than shoot all thirty

## Context

`scripts/shot.mjs` used to play every level of the game in order. That is what
issue #19 was about: it does not survive thirty levels, so the run was reworked
to **sample** - deep-link with `?level=` to one level of each puzzle kind, each
chapter boundary, and each celebration, and screenshot those. About forty-six
shots instead of a hundred, and the run stays a few minutes rather than growing
without bound. This is the right shape and it is already in place.

But the sample is a **hand-written list of level numbers**. It was a good sample
in July, and nothing keeps it one. Add a seventh puzzle kind and no shot has to
exercise it. Retune a chapter so its kind moves to a level the run never visits.
Add a celebration and forget to reach it. In every case the run goes on passing
while testing less and less of the game, because a check that was never written
cannot fail, and a green run with a thinning sample looks exactly like a green
run with a whole one. The best safety net in the project would rot in silence,
and the way anyone would find out is a regression reaching a child.

The obvious fix - shoot all thirty levels so nothing can be missed - is the one
the sample exists to avoid. Thirty drags and thirty fanfares of screenshots is
the slow run #19 set out to kill, and `npm run verify` is already about five
minutes with the shot run most of it. A slower net that everybody runs before
every pull request is not a better net.

## Decision

The sample is checked for **shape**, not made larger. At the end of the run a
guard holds what was covered against what must be covered:

- **What must be covered is read from the source of truth.** `requiredCoverage()`
  parses `src/levels.ts` for every level's `(level, chapter, kind)` and
  `src/celebration.ts` for the celebrations that exist. It reads them as text
  because the script is plain node and cannot import the app's TypeScript module
  chain, and because a parse costs the shipped bundle nothing - there is no
  runtime hook to add. Add a kind, a chapter or a celebration to the table and
  the requirement grows on its own.

- **What was covered is what the live app reported.** The accessors the run
  already calls - `levelNumber`, `kindName`, `chapterName`, `celebrationName` -
  record the kind, chapter and celebration the running game actually put on
  screen, into three sets. This is ground truth rather than a second list to keep
  in step, and it costs nothing: no extra screenshots, and the one round-trip
  that reads the level now reads its chapter and kind in the same breath.

- **The guard fails naming the fix.** A missing kind or chapter is reported with
  the first level that would cover it (`shatter @ level 26`), so closing the gap
  is a line to add rather than a hunt.

The guard costs one extra thing: it opens the grown-ups panel once to count the
level squares, so it can prove its parse saw the whole table. That is a couple of
seconds against a run of minutes.

## Consequence

A coverage check is exactly the kind of code that passes vacuously. If the parse
derived an empty requirement it would find nothing missing and go green while
inspecting nothing, which is worse than no guard at all - it is a green light
wired to nothing. So the guard earns its trust before it is trusted: it asserts
the requirement is non-empty, that the number of levels it parsed matches the
number of squares the live level map renders, and that the app never reported a
kind or chapter the parse did not know about. An empty or garbled parse survives
none of those.

The non-empty floors are deliberately loose - two of each - rather than the six
kinds, six chapters and six celebrations the table holds today, because hard-coding
those numbers would just restate the table in a second place that could fall out of
step with it. The floors only have to be high enough that an empty parse cannot slip
through; the count cross-check against the live level map is what actually pins the
size. So that a future reader can tell "six kinds" from "two kinds and a half-broken
parse" at a glance, the measured figures on the day this landed are recorded here,
the way the bundle budgets record theirs: **6 kinds, 6 chapters, 6 celebrations, 30
levels**, and every check label prints the count it saw.

That this actually catches a thinning sample was checked the only way worth
checking it, at both halves of the guard - the coverage half and the parse half.

For the coverage half, the one shot that exercises the shatter kind was commented
out and the run re-run. The guard failed with
`coverage: every puzzle kind is exercised (shatter @ level 26)` and the run
exited non-zero, while the chapter and celebration checks stayed green because
level 30 still covers the mastery chapter - the granularity is per kind, per
chapter and per celebration, not per level. The shot was put back and the run
went green again.

For the parse half - the load-bearing check, since it is what stops a garbled
requirement passing - one level row in `src/levels.ts` had its `kind` and `chapter`
fields swapped in order. That is still valid TypeScript and the app still renders
all thirty levels, but the row no longer matches the parse's regex, so the
requirement quietly shrank to twenty-nine. The guard failed with
`coverage: the parse saw every level (29 parsed, 30 in the level map)` and the run
exited non-zero, while every other coverage check stayed green - exactly the silent
thinning the cross-check exists to make loud. The row was restored and the run went
green again. A guard nobody has watched fail is a guard nobody knows works.

The rule lives in
[`tests.instructions.md`](../../.github/instructions/tests.instructions.md),
with the rest of what the shot run covers. If the game ever does grow past thirty
levels, or grows a kind, this is the check that will insist the sample grow with
it instead of quietly leaving the new thing untested.
