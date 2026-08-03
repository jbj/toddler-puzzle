# Play an unbuilt kind as a stand-in

## Context

The thirty-level table ([Put the whole difficulty ramp in one
table](<Put the whole difficulty ramp in one table.md>)) names six kinds of
puzzle. One of them is built. Sliced animals, jigsaws, polygon shapes, shatter
and cause-and-effect play are each their own piece of work.

So the table describes a game that does not entirely exist yet, and something has
to happen when a child reaches level 11. Landing only the levels whose kinds
exist would mean coming back to edit the table five more times, and would lose
the thing the table is for: seeing the whole curve at once. Crashing, or skipping
to the next playable level, both end the game early for the player.

## Decision

`src/kinds/registry.ts` resolves a level's kind by name. A kind that has been
registered plays its own level. A kind that has not is played by **shape-match**
instead, at a piece count that follows the chapter the level is in rather than
the missing kind's own numbers, so the ramp keeps climbing.

The stand-in is deliberately visible rather than silent: `resolveLevel` returns
`standIn: true`, the board carries the kind that is actually playing in
`data-kind`, and the tests assert which levels are currently standing in. It is
a scaffold with a date on it, not a fallback that quietly swallows a typo - a
kind id that is not in `PuzzleKindId` does not compile.

Building a kind is `registerKind(...)` and nothing else. The table does not
change; the levels that named that kind start playing it.

## Consequence

Every level of the thirty is a real, finishable level today. A two-year-old
playing level 11 gets a puzzle rather than a stall, which is the only thing that
matters from where they sit.

The screenshot run and the tests exercise the whole table, including the levels
that are standing in, so a level whose numbers the layout cannot honour is caught
now rather than when its kind lands.

The count of levels standing in is a progress bar for the project: when
`tests/levels.test.ts` says none are, the game the table describes is the game
that exists.

## Superseded

All six kinds are built. `shatter` was the last ([Cut a picture into shards that
are things to hold](<Cut a picture into shards that are things to hold.md>)),
and the stand-in machinery went with it: `kindFor` now resolves a level's kind
or throws, there is no `standIn` flag, and no level plays as anything but
itself. The record stays because the scaffold was the right shape for the six
weeks it held the table up, and the next time a table runs ahead of its code
this is the argument for letting it.
