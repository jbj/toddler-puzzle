# Measure the artwork in parallel, and report it in order

`npm run art:check` rasterises sixteen animals and four scenes, judges every
committed slice recipe, and compares every pair of silhouettes inside a theme.
Almost none of that is arithmetic: a CPU profile of a whole run put over 99% of
it inside `execFileSync`, waiting for `rsvg-convert` or ImageMagick, and no two
animals, scenes or pairs need anything from one another.

Run one after another, that was 51 s on its own and 72 s inside `npm run
verify` - the longest task in the run, and by then the only thing the whole
check was waiting for. So it is spread over a pool of workers.

## The concurrency is bounded by what the runner promised

The obvious version of this change is the one that breaks a machine.
`scripts/verify.mjs` schedules against a slot budget, and it used to charge the
art check **one** CPU. A check that quietly opens a worker per core beside a
browser run that was promised most of them oversubscribes the machine, and what
that costs is not slowness - it is a timing-sensitive check failing on a machine
that has too much to do, somewhere else in the run, hours later.

So the number is declared and then honoured, in three places that cannot drift
apart:

- `verifyTasks` gives `art:check` whatever is left of the CPUs once the browser
  run has its share, so between them the two long tasks are exactly the machine.
- `spawnTask` passes it down as `VERIFY_CPU_SLOTS`, next to the
  `VERIFY_BROWSER_SLOTS` the browser checks already read.
- `cpuSlots()` in `scripts/concurrency.mjs` reads it the same way `browserSlots`
  does: a caller may divide the machine's capacity, never raise it. Run on its
  own, with nobody to divide it, the check has the whole machine.

**A slot has to be a CPU, or the declaration is a fiction.** ImageMagick opens a
thread per core by default, so six workers would have been eighteen busy
threads. `check-art.mjs` sets `MAGICK_THREAD_LIMIT=1` unless something already
set it. Measured on a twelve-thread machine, that costs about 15% of a serial
run (50 s to 58 s) and *saves* total CPU - the per-call thread pool was never
earning its keep on images this size - and it is what makes six slots mean six.

## The report is put back in order

Results come back in whatever order the rasterisers finish, which is not an
order anyone can read. A run that reshuffles itself is unusable in a diff and
worse in CI, where the only thing anyone sees is the text.

So a unit of work does not print. It records what it observed - sections,
details, and each check with its file, its label and its problems - and the main
thread replays the recordings into one report, in the order the files sit on
disk. Output is byte-identical to the serial version, passing (88 bytes) and
failing, plain and `--verbose`. An exception inside a worker still stops the run
with the same message and the same exit code.

## What it bought, and where it stops

Measured under the machine lock, three runs each, on a twelve-thread laptop, at
`e2758ad` serial and `0227c7e` parallel:

| | serial | parallel |
| --- | --- | --- |
| `art:check` alone | 50.9 s | 21.4 s |
| `art:check` inside `verify` | 72.4 s | 35.4 s |
| whole `verify` | 87.1 s | 80.8 s |

The check stopped being the critical path, which is the whole of the win: the
six seconds it gave back are all `verify` had left to give. What the run waits
for now is `test`, then `bundle`, then the 65-second browser run, and nothing
about the art check can shorten any of those. It has nearly thirty seconds of
margin under the browser run and no use for more.

The scaling is also worse than the work deserves, and honestly so. Doubling the
workers does not halve the time - six workers turn a 57-second run into 24
seconds, not 10 - because a laptop with two performance cores and eight
efficient ones has one power budget between them, and a rasteriser is not short
of memory bandwidth to run out of either. The pool is sized by CPUs because that
is the resource the runner can account for; the machine decides what a CPU is
worth on the day.

## A full machine found a race that was always there

Spreading the art check over six CPUs means the machine is genuinely busy while
the browser run is on it, where before it was half idle beside a check using one
core. That did not create a fault; it exposed one. The browser run read the cut
edges of a finished picture the instant the last piece landed, and those edges
fade over about a third of a second rather than vanishing, so the read could
catch the fade part-way down. It showed up as roughly one run in ten to fifteen
failing `an assembled animal has no lines across it (4 edges faded)` - the count
right, the brightest edge not zero.

It is worth knowing how badly that reproduces on its own. Running the level-14
act by itself, ten times, idle and then against twenty busy cores, the fade had
always finished before the read. What makes it fail is not load in general but
the particular contention of a whole `verify`, which is exactly the shape this
change created. A flake that only appears in the full run is the kind that gets
blamed on the last thing merged, so it is written down here rather than left to
be rediscovered.

The fix, in `#113`, moves when the reading is taken rather than what it demands:
it waits for the count the check already asks for and an edge of zero, and gives
up on a two-second deadline, six times the fade. The three checks - the
assembled animal, the finished jigsaw, the mended picture - are unchanged, so a
board that never draws an edge, or never loses one, fails exactly as before.

The obvious next question is whether the browser run has more of them, and the
answer is no - which is worth writing down, because it is not obvious and
finding it out again means reading every assertion in `shot.mjs` a second time.
Every computed style the run reads was checked against what drives it. The cut
edges were the only one read while moving. The hole's opacity does not
transition; a clip path, a panel's `display` and a backdrop's fill are discrete;
the night sky over a finished picture rises to its value under `fill:
"forwards"` and is waited for before it is read; and the sleeping hint's pulse
is only read after the run has already established that the board is asleep and
that nothing is animating on it.

That last one is the pattern to copy rather than the exception. A value that
moves can be read safely as soon as something else has settled - so wait for the
thing that stops it moving, then read. What went wrong with the cut edges was
not that a value moved but that nothing in the check had established it had
stopped.

## Counting it, because reading it cannot settle it

Reading every assertion says a value is not moving when it is read. It cannot
say that a race nobody has thought of does not fire, and the only race found
here fired about once in a dozen runs and only under a whole `verify`. So the
answer to "is the browser run safe on a full machine" has to be counted as well
as argued.

Twelve consecutive runs of `npm run verify` on `63300ba`, under `taskset -c
0-3`, one lock held across the series: all twelve passed, 102 to 104 seconds
each. Four pinned cores are the runner's shape and not merely its core count -
`availableParallelism()` honours affinity, so `browserSlots()` yields three
browsers charged two CPUs, which is what CI gets. `VERIFY_CPU_SLOTS=4` looks
like the same thing and is not: five runs of it came back at 70 to 71 seconds,
the same as the full budget, because dividing the charge leaves every worker on
a real core of its own.

That difference can be seen without running anything, which is worth knowing
because it takes seconds and the timings take an hour:

```
node -e 'import("./scripts/concurrency.mjs").then(m =>
  console.log(m.cpuSlots(), m.browserSlots()))'
```

| | `cpuSlots()` | `browserSlots()` |
| --- | --- | --- |
| unpinned, twelve threads | 12 | 6 |
| `taskset -c 0-3` | 4 | 3 |
| `VERIFY_CPU_SLOTS=4` | 4 | **6** |

The last row is the whole of it: the variable divides the CPU charge and leaves
the browser count alone, so six Chromes still spread over twelve real cores and
nothing is emulated. Pinning takes the cores away, which is what the runner
does to us.

Two things make a count mean anything, both learnt by losing runs to them.
Preflight `docs:check`, `lint`, `format:check` and `typecheck` once before
taking the lock, because those fail in a tenth of a second and skip everything
after them - eight runs once "failed" on a stale citation without reaching a
single test, and counting them would have shown the opposite of the truth. And
log the wall clock at both ends of every run, because a laptop that suspends
mid-series inflates one run's time and can leave the browser run wedged with no
CPU burn at all; in the series above each run's end is the next run's start to
the second, so none of them slept.

What twelve runs support is that the browser run passed twelve times at the
runner's shape with the machine full. They do not support "there are no flakes
left". Two failures in twenty-nine is roughly one in fourteen, and a hazard at
that rate survives twelve clean runs about two times in five. The number is a
floor under confidence, not a proof, and the next person to see a lone
unexplained failure here should re-run it before believing it.
