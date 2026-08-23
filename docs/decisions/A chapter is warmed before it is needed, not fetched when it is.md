# A chapter is warmed before it is needed, not fetched when it is

## Context

This game's stated property is no binary assets, nothing to download and
nothing to fail to load (see [Keep assets and runtime
simple](<Keep assets and runtime simple.md>)), so that a device reaches the
first level immediately. As art, celebrations, and puzzle kinds accumulate,
the bundle can grow large enough that this needs active enforcement rather
than being taken on faith.

Lazy-loading a chapter's assets only when the child reaches it is the obvious
way to shrink what loads up front, and it is the wrong shape for this game:
there is no spinner here and there should not be one, so a two-year-old who
presses onwards and is shown nothing while a chunk downloads has been handed
a broken game, and on a bad connection the gap may never end. Assets also
need to go on being validated as a whole at build and test time regardless of
how their code is split, rather than only discovered broken by a child
mid-level.

## Decision

**The bundle is split by puzzle kind, and every split-off chunk is warmed
during play rather than fetched on demand.**

The earliest kinds are loaded as static imports, so a new player has nothing
to wait for. Every other kind is fetched in the background once the first
board is standing, one chunk at a time, well ahead of when the chapter that
needs it is actually reached.

**Nothing ever shows an empty stage.** If a chunk has not arrived yet - a
slow first sitting, or a grown-up jumping ahead from the panel - the board
already on screen stays up until it has. If the celebration chunk
specifically fails to arrive, the level ends the way an ordinary level does,
with its fanfare and its button onwards: a missing party is a disappointment,
a missing way out would be a trap. A fetch that failed once is not
permanently given up on - the next attempt tries again.

Every asset in the catalogue is still validated eagerly as a whole,
independent of how the code that uses it is split, so a malformed asset is
caught at build and test time rather than at play time.

**The initial-load budget is enforced by the build.** A build-time check
measures the size of what loads before the first level appears, both raw and
compressed, and fails the build if it exceeds its budget. Raising the budget
is allowed when the game has genuinely grown a new responsibility; shipping
less art than the game needs, or weakening the check, to stay under a number
is not.

**A chunk that failed to load once is remembered as broken by the browser for
the life of the page**, so retrying it in a loop can never succeed. What
recovers instead:

- The board already on screen stays up; nothing is removed and nothing shows
  a message a two-year-old could not read anyway.
- A fresh page is loaded only once the device comes back online, since that
  is the one moment a previously failed fetch would now succeed. It is
  deliberately not reloaded while the connection was there all along, since a
  chunk that will not load on a working connection will not load on the next
  page load either.
- Progress is saved before the wait, so a fresh page opens on the level the
  child was headed to.
- Reloading this way is capped per sitting, so a flapping connection cannot
  make the game visibly blink.

## Consequence

A puzzle kind is a code-splitting boundary: the registry that names a kind
stays synchronous, and the one function that ensures a kind's code has
arrived is the one place in the game that ever waits on a fetch.

The grown-up panel is deliberately kept as a static import rather than split
further, since splitting it means separating the part of it that has to be
in force before any sound can play from the rest of the panel, and the saved
size does not justify touching the surface that gates sound at boot.

The game is not, and was never, offline-capable across sittings - a reload
with no network depends entirely on the host's HTTP cache headers, and
splitting the bundle into more files does not change that. The invariant of
no binary assets, no runtime dependencies and nothing fetched from anywhere
else should be read as exactly that, not as a promise that the game runs
with no network at all.
