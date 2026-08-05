# Let the test run share the machine

`npm run verify` used to give the Vitest run the whole machine and let nothing
else on it. That was not caution for its own sake: overlap of any width - even a
bounded one - reproduced Vitest's five-second guard in the sixty-animal layout
test, on machines where an exclusive run passed. A check that fails because
something else was busy is worse than a check that costs ten seconds.

What made that true has gone. The layout search now refuses an impossible cast
before it searches for a board rather than after, and the test that used to take
1,803 ms takes about 750 ms. Measured again: with six other cores busy, the
slowest test in the whole suite is 1.6 s against the five-second guard - better
headroom under contention than the suite had with the machine to itself before.

That test is `refuses a cast too big to compose rather than shrinking it away`,
in `tests/puzzle.test.ts`, and it is worth naming because it is the slowest test
under every arrangement anyone has measured - so it is the one to re-measure
before changing this budget again. Its neighbour in `tests/fit.test.ts` is named
almost identically and is not the same test; the one that matters asks for a
cast of sixty.

That the guard was real, and that the fit fix is what moved it, can be shown
rather than asserted. The same bounded overlap was measured on a tree from
before that fix and failed on twelve cores, the sixty-animal case landing at
5,039 ms - one worker, charged and honoured, and still over the line. The
identical arrangement on a tree with the fix passes twelve times in a row. Two
trees, one commit apart, opposite results: that pair is why this record can say
what changed rather than only that something did.

So the test run is bounded rather than exclusive, and told its bound. Vitest
opens a worker per core unless it is asked otherwise, so `--maxWorkers` carries
the same number the runner charged; a charge the child does not honour is a
fiction, and that is the whole point of the budget. The same bargain runs
through `scripts/concurrency.mjs`: a caller may **divide** the machine among its
jobs and may never raise it, because half of the memory is a fact about the
machine and not a preference of whoever is asking.

## The list is the order the runner tries things in

Letting the test run overlap is not by itself worth anything, and the first
measurement of it was **slower**: 88 s against 81 s. The browser run is the
longest task and it could not start, because the art check sat earlier in the
task list and took the slots the moment they came free.

`runTasks` walks the list in order and starts whatever fits. That makes the list
a priority as well as a graph, and the longest task has to come first among the
things that would otherwise fit in front of it. Moving the browser run above the
art check is the whole of the difference between 88 s and 70 s. It is also the
order the summary prints in, which is why the two are one list rather than two.

## What it bought

Measured under the machine lock, three runs each, on a twelve-thread laptop:

| | exclusive test run | shared |
| --- | --- | --- |
| `test` | 9.4 s | 16.6 s |
| whole `verify` | 80.5 / 81.0 / 80.5 s | 70.7 / 71.5 / 72.1 s |

Twelve runs in a row on the shared arrangement, all passing, 70.7 s to 72.1 s -
counted rather than assumed, because a fuller machine is a harsher place for
anything that reads a moving value.

The test run itself is nearly twice as slow, and that is the trade: it is no
longer on the critical path, so what it costs stops mattering. What is left is
the four quick diagnostics that everything long waits for, then the build, then
the browser run - about seventy seconds, and none of it is anything this budget
can rearrange. The next second saved has to come out of `shot` itself.

## Four cores as well as twelve, because that is what CI has

A laptop with twelve threads is the wrong machine to settle this on. The
arrangement that failed before failed on four cores while passing on twelve, and
four is what the CI runner gets, so a result from the laptop alone would have
proved the comfortable half of the question.

Emulate the small machine with `taskset -c 0-3` rather than by dividing the
budget by hand. `browserSlots()` is `min(availableParallelism() - 1, ...)` and
Linux honours affinity in `availableParallelism()`, so pinning to four cores
yields three browser workers charged two CPUs - which is the shape CI actually
runs, not merely its core count. Setting `VERIFY_CPU_SLOTS=4` would not have
done that: memory would still have allowed six browsers.

Eight consecutive shared runs passed at that size, against four exclusive runs
as a control. With the twelve on the laptop, that is bounded overlap surviving
twenty runs across both machine sizes, and failing on neither.

## A soak counts only the runs that reached what is being tested

Two ways a run says nothing, both of which happened while measuring this:

- **It failed before `test` ran.** Eight runs once failed in a tenth of a second
  on a stale citation in a code comment, skipping every task after it. Counted
  as failures they would have shown overlap failing on four cores, which is the
  opposite of the truth. A failure of `docs:check`, `lint`, `format:check` or
  `typecheck` is void, not evidence - check them once before taking the lock and
  they cannot spoil a soak at all.
- **It never ran.** A laptop that suspends mid-soak leaves the browser run
  wedged: no progress, no CPU consumed, and a wall time inflated by however long
  the lid was shut. Discard it. If timings look impossible, compare `date`
  against the wall clock before believing any of them.

Neither is a fussy distinction. The whole value of a soak is that it counts, and
a count that includes runs which never reached the contention being measured is
a number with no argument attached to it.
