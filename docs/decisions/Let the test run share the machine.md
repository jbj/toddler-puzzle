# Let the test run share the machine

A check that fails merely because another verified task is running is worse
than a slower check. The test suite can share the machine only while both the
suite and its scheduler honor the same resource budget.

The verify scheduler therefore charges the test run a bounded CPU share and
passes that bound to the test runner. A child process may divide the capacity
it receives; it may never rediscover the host and raise its own allowance.
`scripts/concurrency.mjs` owns that contract for every long-running check.

Task order is part of the same decision. The scheduler starts the first work
that fits, so the ordered task list is a priority as well as a dependency
graph. Put critical long work ahead of shorter tasks that could occupy its
slots, or nominal parallelism can lengthen the whole run.

Validate changes to this budget under the contention and machine shape they
claim to improve. A run that never reaches that contention is not evidence.
