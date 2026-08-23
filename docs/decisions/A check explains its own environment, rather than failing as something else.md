# A check explains its own environment, rather than failing as something else

## Context

Some checks in this project drive a real browser: they start Chrome
themselves, talk to it on a fixed debugging port, and serve a built copy of
the app rather than running against source. Three ways of getting the
environment wrong kept costing real debugging time, and all three cost it the
same way: the run did not stop at what was actually wrong, but carried on and
failed later, somewhere with no visible connection to the cause.

- **A browser already on the port.** A launcher that finds an existing
  browser already answering on its debugging port cannot tell it apart from
  one it started itself, and will happily drive whatever page a leftover
  browser from an earlier, interrupted run happens to have open - producing
  failures that are plausible, specific, and describe a screen the current
  run never actually showed.
- **No build, or a build older than the code.** A run that serves a stale or
  missing build fails deep inside itself, in a way that describes code no
  longer in the tree.
- **Importing a script instead of running it**, when the script has no entry
  point and performs its real work at import time - which both fails to
  answer the question asked (does this file parse?) and quietly performs the
  side effects of a real run, including starting a stray browser.

## Decision

Each of these is checked for directly, with a message that says what to do,
rather than left to fail downstream later:

- A browser launcher refuses to attach to a browser it did not start: it
  checks whether the debugging port already answers before launching
  anything, and if so names the port and the browser where possible, and
  prints the commands to find and stop it.
- A script that requires a fresh build refuses to run without one, and
  refuses to run against a build older than the sources that produce it.
- A script written to run standalone refuses to be imported, and points at
  the tool meant for checking that a file merely parses.

## Consequences

There is a real cost: the staleness check stops a run after any source edit,
including one that could not affect the build - but the alternative is a run
whose every assertion is about something other than the working tree.

The general form is the point, and it applies beyond these specific checks:
when a check can tell that its environment is wrong, it should say so itself.
The alternative is not that somebody reads documentation about it; it is that
they debug the wrong thing, and then write documentation about that.
