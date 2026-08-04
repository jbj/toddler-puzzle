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
