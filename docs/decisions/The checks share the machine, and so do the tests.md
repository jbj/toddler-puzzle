# The checks share the machine, and so do the tests

`npm run verify` used to run its checks one after another and took a little over
six minutes. It now runs them against a budget of the machine and takes about
seventy seconds. For most of that history the test run was the exception - it
was charged the whole machine, so nothing overlapped it - and this record was
called *and the tests get it to themselves*. That rule is gone; what follows is
why it was there, and what it took to retire it.

## How the budget works

A task declares what it needs rather than when it should go: a number of CPUs
and a number of browsers. The runner starts whatever fits in what is left, so
the order is a consequence of the budget and not a schedule anybody wrote down.
Browsers are counted separately from CPUs because they are limited by memory
rather than by cores: a headless Chromium and its child processes were measured
at a 1,387 MiB peak, and `scripts/concurrency.mjs` rounds that to two gigabytes
apiece and divides the machine's memory by it. The comment above that constant
says how to re-measure it, which is worth reading before adjusting it - the
figure is a whole process tree, and sampling only the parent gives an answer
about a third of the size that looks plausible and is wrong.

Both budgets are asked for through `scripts/concurrency.mjs`, and a caller may
only ever **divide** the machine, never raise it. That direction matters more
than it looks. A check that spreads itself over workers has no way of knowing
that something else was promised half the cores, so if it counts them itself it
will take them; several checks doing that at once is how a parallel run becomes
slower than the serial one it replaced.

## Why the tests were kept out of it

Vitest brings its own worker pool, which means it does not use the CPUs it is
given so much as take the ones that are there. Overlapping it was measured, on
twelve cores and on four, with its pool bounded to one worker, to four, and left
at its default. The rows that failed all failed the same way: the separate
sixty-animal `buildLayout` case ran past its five-second guard, on machines
where the same test passed comfortably when run alone. Only the exclusive
schedule passed on both machine sizes.

That was worth seven to ten seconds of the run and it was not a close call. A
check that is a little slower is a cost; a real check that fails once in some
number of runs for a reason that has nothing to do with the change under test is
worse than the time it saves, because somebody then has to spend an evening
proving it was the runner rather than their work. Two agents lost most of a
night to exactly that on a different check, which is written up in
[Measure the artwork in parallel, and report it in order](<Measure the artwork in parallel, and report it in order.md>).

## What retired it

Both sides of that measurement moved. The sixty-animal case now refuses an
impossible cast before it searches for a board, so it takes about 750 ms rather
than 1,803 ms. The art check now takes most of the machine rather than a single
core, so the contention an overlapping test run meets is a different shape.

There was also a hole in it. Every overlapping row it measured used either
Vitest's default pool, which takes every core whatever it was charged, or a
bound nobody passed to the runner - so the failures were real but they were
failures of an arrangement nobody had actually built. A charge the child does
not honour is a fiction, and the fiction was what was measured.

An expired measurement is not a wrong one, so it was taken again rather than
argued with, on both machine sizes and with repeats, and judged on whether
anything failed rather than on which arrangement had the lower mean. The small
machine is made small with `taskset -c 0-3`, not by dividing the budget:
`availableParallelism()` then reports four, so `concurrency.mjs` gives four CPU
slots and three browser slots - the CI runner's shape - and the cores really are
gone. Dividing the budget on a twelve-core machine leaves every worker running
at full speed and proves nothing about the machine that failed.

| | exclusive | shared | runs |
| --- | --- | --- | --- |
| twelve cores | 80.5 - 81.0 s | 70.7 - 72.1 s | 12 shared, 0 failed |
| four cores | 102.5 - 111.8 s | 100.3 - 103.2 s | 8 shared, 0 failed |

And the guard itself, measured rather than inferred: with the machine held to
four cores, two of them deliberately busy, and Vitest bounded to two workers,
the sixty-animal case takes **2,165 ms against its five-second guard** - still
faster than the 1,803 ms it took with the whole machine to itself before it was
made to refuse early. It is the slowest test in the suite under every
arrangement tried, so it remains the one to re-measure if this is revisited.

So the test run is bounded rather than exclusive, and told its bound:
`--maxWorkers` carries the number the runner charged, because a charge the child
does not honour is a fiction.

## The list is a priority, not only a graph

Letting the test run overlap is worth nothing by itself, and the first
measurement of it was **slower** - 88 s against 81 s. The browser run is the
longest task in `verify` and it could not start, because the art check sat
earlier in the task list and took the slots the moment they came free.

`runTasks` walks the list in order and starts whatever fits, so the list is a
priority as well as a graph, and the longest task has to come first among the
things that would otherwise fit in front of it. Moving the browser run above the
art check is the whole of the difference between 88 s and 71 s. It is also the
order the summary prints in, which is why the two are one list rather than two.

## What is left

The four quick diagnostics that everything long waits for, then the build, then
the browser run: about seventy seconds on twelve cores, and no arrangement of
the budget can go below it. The next second has to come out of `shot` itself.
