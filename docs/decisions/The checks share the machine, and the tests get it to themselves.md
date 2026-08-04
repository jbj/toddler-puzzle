# The checks share the machine, and the tests get it to themselves

`npm run verify` used to run its checks one after another and took a little over
six minutes. It now runs them against a budget of the machine and takes about
eighty seconds. The rule that looks like an oversight is in the middle of that:
the test run is charged the whole machine, so nothing overlaps it, and it is the
one task the runner deliberately refuses to share.

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

## Why the tests do not overlap

Vitest brings its own worker pool, which means it does not use the CPUs it is
given so much as take the ones that are there. Overlapping it was measured, on
twelve cores and on four, with its pool bounded to one worker, to four, and left
at its default. The rows that failed all failed the same way: the separate
sixty-animal `buildLayout` case ran past its five-second guard, on machines
where the same test passed comfortably when run alone. Only the exclusive
schedule passed on both machine sizes.

That is worth seven to ten seconds of the run, and it is not a close call. A
check that is a little slower is a cost; a real check that fails once in some
number of runs for a reason that has nothing to do with the change under test is
worse than the time it saves, because somebody then has to spend an evening
proving it was the runner rather than their work. Two agents lost most of a
night to exactly that on a different check, which is written up in
[Measure the artwork in parallel, and report it in order](<Measure the artwork in parallel, and report it in order.md>).

## What has since expired, and what would settle it

The measurement above was taken before two changes that move both sides of it.
The sixty-animal case now takes about 750 ms rather than 1,803 ms, so its
headroom under the guard went from roughly threefold to nearly sevenfold. The
art check now takes most of the machine rather than a single core, so the
contention an overlapping test run would meet is a different shape entirely.

Overlap may well be safe now. What it would take to know:

- the four-core case as well as the twelve, because four is where overlap failed
  and it is also what the CI runner has;
- repeats of each row rather than one pass, because the failure being ruled out
  was intermittent - a single green run is not evidence about it;
- judged on whether the test run ever fails across those repeats, not on which
  arrangement has the lower mean.

Anyone tempted to skip that should first look at what is on the table. Building
the bundle and running the browser checks is a seventy-second floor underneath
an eighty-second run, and no arrangement of the tests can go below it. This is
worth single digits of seconds. It is a fine thing to leave alone; it is not a
fine thing to change on a hunch, and rerunning the expired rows above without
re-measuring them proves nothing at all.
