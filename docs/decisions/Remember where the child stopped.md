# Remember where the child stopped

## Context

The game was stateless: every load started at level 1, and the last level looped
back to the first. Three levels made that fine. Thirty ([Put the whole
difficulty ramp in one table](<Put the whole difficulty ramp in one table.md>))
make it a wall - a two-year-old plays for ten minutes at a time, and nobody is
going to press through five levels of animals to get back to the jigsaws.

So the level being played is stored. The awkward part is not the storing. It is
that the browser this game is aimed at, Safari on an iPad, throws a
`SecurityError` on the mere mention of `localStorage` in private browsing, and
that the record outlives the code that wrote it: a level table retuned next
month can leave a child pointing at a level that no longer exists.

## Decision

`src/progress.ts` holds one record - the current level, the furthest reached,
and the grown-up settings - under one key, with a `STORAGE_VERSION` on it. The
storage object is injected, so every path through it is exercised in Vitest
without a browser.

**Nothing in it throws, and nothing in it is reported.** Reaching for
`localStorage` is wrapped, because private browsing throws before any call is
made. A read that throws, a parse that fails, a version this build does not
know, a write refused for quota: each of them ends with the record in memory and
a game that plays. There is no message, because the person holding the iPad
cannot read one and the game is not diminished by forgetting.

**Reading and writing fail separately.** Storage that is merely disabled, or out
of quota, still has the property and still hands back yesterday's record; it
fails only when written to. So a storage that cannot be written is handed back
rather than thrown away, and the child resumes where they were - refusing the
record because the *next* write will fail would lose a place that was never
actually lost. A probe write at startup, and any write that is refused after it,
set `persists` to false, and it never goes back to true: a device that has
dropped one record cannot be promised to keep the next, and the grown-up panel
would rather say "this will not be remembered" than take it back. Nothing in the
game reads `persists`; it is there so the panel can be honest.

**A stored level is checked against the game as it is now.** An unknown version
drops the whole record. Within a version, each field stands on its own: a level
number outside the table sends the child back to level 1 rather than to level 30
or to a board that cannot be built, while a grown-up's settings survive. Being
put back to the start is a bad day; being put on the hardest level in the game
is a broken toy.

**A `?level=` session writes nothing about the level.** The deep link still wins
over the stored one - it is a tool for working on the game, and a link should go
where it says - but playing from it, and the loop back to level 1 after level 30,
leave the child's place alone. Settings written from such a session are kept,
because changing one is always a deliberate act.

**Clearing progress is not on the play surface.** The store exposes
`clearProgress()` for the grown-up panel (#8), which resets the level and keeps
the settings. The button beside the board goes on doing what it always did:
re-deal the level being played. Re-dealing writes nothing at all, so the two can
never be confused for one another.

## Consequence

A child comes back to the level they were on, and a grown-up who has never
opened a menu never needs to.

Private browsing, a full disk, a hand-edited record and a retuned level table
all degrade to "starts at level 1", which is precisely the game as it was before
this change - the worst case is the old behaviour rather than a broken one.

The settings record is defined here before anything reads it, so the grown-up
panel and rotation mode have one shape to write to rather than each inventing
one. `sound`, `rotation` and `hints` are stored and defaulted today; the code
that acts on them is #8, #14 and #21.

Retuning the level table means deciding whether the numbers still mean what they
did. If they do not, bump `STORAGE_VERSION` and everybody starts again - which
is a cheap thing to do to a game whose first level takes fifteen seconds.
