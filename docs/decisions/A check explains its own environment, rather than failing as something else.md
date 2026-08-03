# A check explains its own environment, rather than failing as something else

## Context

Two of the checks drive a real browser: `npm run shot` plays the game, and
`npm run audio:check` renders every sound. Both start Chrome themselves and talk
to it on a fixed debugging port.

Three ways of getting that wrong kept costing half an hour each, and all three
cost it the same way: the run did not stop at the thing that was actually wrong.
It carried on and failed later, somewhere with no visible connection to the
cause, so the time went into the wrong question.

**A browser already on the port.** Chrome cannot bind a port that is taken, but
nothing in the connect that follows cares who answers. The run would find the
*old* browser's page and drive that - a browser parked on whatever the
interrupted run left on screen. The failures that produces are the worst kind:
plausible, specific and unrelated. A screenshot run reporting that a new player
does not start on level 1 is describing, accurately, a browser someone left on
level 12. This was reproduced deliberately before it was fixed: a stray browser
was started on the port, the launcher was called the way a check calls it, and
it attached to the stray and read its title back.

**No build, or a build older than the code.** The run serves `dist/`. Without a
build the page is empty and the first symptom is a null `#stage`, deep in the
run. A stale build is worse than none, because everything the run asserts is
then true or false about code that is no longer in the tree. That is not a
far-fetched state: `npm run build` type-checks `tests/` before it emits
anything, so a type error in a test leaves the previous `dist/` standing, and a
run started afterwards quietly checks the old one.

**Importing `scripts/shot.mjs`.** It has no entry point to call - it is a script,
and everything in it happens at import time. So reaching for
`await import("./scripts/shot.mjs")` to see whether the file parses starts a
browser, serves the build and plays the game. That is also how a stray browser
gets created, which means this mistake causes the first one.

## Decision

Each of the three stops the run where it happens, with a message that says what
to do.

`openChrome` refuses to attach to a browser it did not start: before launching
anything it checks whether the port answers, and if it does, it names the port,
names the browser if it can get it to say, explains that attaching would drive
the wrong browser, and prints the two commands that find and stop it.

`scripts/shot.mjs` refuses to run without a build, refuses to run against a
build older than `src/`, `public/` or `index.html`, and refuses to be imported -
the last of those pointing at `node --check`, which is the tool for the job it
was being misused for.

## Consequences

The failures these replace were not rare and were not cheap, and none of them
was a fault in the game. Three checks that cost nothing when things are fine buy
that back.

There is a real cost: the staleness check will stop a run after any edit to a
source file, including one that could not affect the build. That is the right
trade anyway - `npm run build` is quick, and the alternative is a run whose
every assertion is about something other than the working tree - but it does
mean the answer to "why won't it run" is sometimes just "build it".

A guard whose message is wrong is worse than none, so all four were made to fire
on purpose before they were shipped, and the commands the messages suggest were
run to check that they do what the message says.

The general form is the point, and it applies beyond these three: **when a check
can tell that its environment is wrong, it should say so itself.** The
alternative is not that somebody reads the documentation; it is that they debug
the wrong thing, and then write documentation about it.
