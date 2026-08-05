# A hint points at both ends

## Context

Issue #21 asked for an idle hint: after a stretch with no progress, gently glow
the target belonging to whichever piece the child last touched. Silent and
non-punitive - no "try again", no voice, no penalty, just a pulse where the piece
wants to go.

Read literally that is one glow, on one hole, in one situation. The game has
several situations the sentence does not reach, and three of them turn out to
matter more than the sentence does.

## Decision

### It glows both ends, not one

A glow on a hole says *something goes here*. It does not say *which* thing, and
it does not say that anything can be moved at all.

The child this feature exists for is the one at the young end of the game: the
first time they meet a tray, "there is a rabbit-shaped space in the grass" is not
actionable. "*That* rabbit goes in *that* space" is.

So the hint draws the piece's outline twice: brightly at
`kind.target(puzzle, layout, piece)`, and faintly at the piece's own place in the
tray. Two ends of one move, the quieter one on the thing to pick up.

The product's tie-breaker settles it: when a question is open, choose whatever is
more forgiving and requires less understanding. Two marks require less
understanding than one.

### It is the same path the piece and the hole are drawn from

Both marks are `PieceShape.outline` - the exact path the piece is drawn from and
the hole is cut from, which is already an invariant of the game because one path
makes it impossible for a piece to drift out of alignment with its hole.

Reusing it means the hint contains no per-kind knowledge whatsoever and cannot
drift out of alignment either. It also means it does the right thing for kinds it
was never written for: a slice glows the whole animal it belongs to, which is
exactly the region `accepts` will take it in, and a jigsaw piece glows its own
place in the picture. Adding a kind gets a working hint for free, as long as the
kind answers honestly about where the piece may go - which is the next section.

### Where a kind has a choice, it glows all of it

The first version of this pointed at `kind.target(piece)` and nothing else. That
is wrong for the polygon kind, and wrong in a way worth naming.

That kind treats congruent parts as interchangeable on purpose: a piece is
accepted by *any* free place whose signature matches it, and `settle` writes
down which one the finger chose (see [Two shapes the same are the same
piece](<Two shapes the same are the same piece.md>)). `placeOf` is a bijection
seeded at deal time, so `target` always answers - but for a piece that has not
been dropped yet, what it answers is merely where the deal happened to aim it. A
sunflower has five identical petals. Glowing one of them says "that one", when
the truth is "any of these five".

The child would not be *punished* for ignoring it - nothing in this game punishes
anything - but they would have been taught a rule the game does not have, and the
child being hinted at is by definition the one with the least basis to discover
it was a lie. A hint that has to be second-guessed is not a hint.

So the contract grew `openTargets`, the mirror image of `settle`: the same choice
that has to be written down has to be pointed at. A kind that implements one must
implement the other; every other kind leaves both out and the host falls back to
`target` alone. The polygon kind returns one point per free congruent place,
which is exactly the set `chosen` picks from - so the hint cannot point somewhere
a drop would be refused, and cannot fail to point somewhere it would be taken.

Two consequences worth expecting rather than discovering:

- **A hint can be five glows.** On a fresh sunflower the whole flower lights up.
  That looks like a lot, and it is exactly true: every one of those places will
  take the piece. It is also self-correcting - as twins fill up the set shrinks,
  so the hint sharpens on its own as the picture comes together.
- **It cannot go stale.** A hint showing while another piece is placed would be
  pointing at an assignment that has just changed. It cannot happen: a placement
  is an interaction, every interaction takes the hint down, and a re-layout stops
  it outright. The glow is always computed from the board as it stands.

Two things that look like bugs in the single-target version are not, and both
took tracing to establish, so they are written down here rather than left to be
re-discovered. `target` reads `placeIndex(scene, piece)`, which is defined for
every piece from the moment the scene is dealt, so it is never undefined for a
piece nobody has touched. And the glow cannot be seen to *jump*: a swap only
happens on a drop, a drop is an interaction, and an interaction takes the hint
down - so it is recomputed between showings rather than moving under the child's
eye. What was actually wrong with pointing at one place was subtler than either:
the single glow was a *partial* truth rather than a false one - dropping on the
glowed twin works and dropping on its twin works too - and a partial truth is
still read as "that one" by a child with no way to second-guess it.

### Stroke only, never a fill

This is the failure mode the issue calls out by name: a hint must not look like a
target that has already been filled.

In this game a filled target is an opaque animal sitting in its hole, and an
empty hole is a thin, 45%-white rim on the backdrop. A warm unfilled double
stroke - a wide soft pass with a narrow bright one over it - is neither of those
things. It reads as light on the rim rather than as a shape in the hole.

`npm run shot` counts the filled shapes inside a hint and expects none, so this
cannot be undone by accident.

### When nobody has touched anything, it points anyway

"Whichever piece the child last touched" is undefined twice: at the start of a
level, and immediately after a successful placement.

The tempting answer is "then no hint". It is the wrong one. A child who has never
worked out that pieces move has touched nothing *because* they are stuck, which
is precisely the state the valve exists to open. Withholding help from the child
who most needs it, on the grounds that they have not demonstrated enough
engagement to earn it, is the opposite of forgiving.

So there is one rule, `hintPiece`:

> the last-touched piece if it is still unplaced; otherwise the first unplaced
> piece; otherwise nothing.

One rule covers both gaps without a special case, and covers a third for free: a
`lastTouched` left over from a board that has since been replaced is simply not
among the pieces, so it falls through.

### Reduced motion keeps the glow and drops the pulse

`prefers-reduced-motion` could reasonably be read as "no hint". It is not read
that way here. A child who needs the hint still needs it; what they do not need
is the breathing. Under reduced motion the marks appear and hold at a steady
opacity. The help survives; the animation does not. This matches how the rest of
the game honours the preference - the settle and the sparkles collapse to 1ms
rather than being removed, and a celebration still happens, more calmly.

### `stop()` latches, and that is the whole race guard

A hint is a timer, and timers outlive the thing they were armed for. Three ways
this goes wrong: the board is replaced while a hint is pending, the level is
completed and a celebration starts, or a drag begins after the hint was armed.

Rather than three defences there is one. `stop()` sets a flag that is checked
*inside* the scheduled callback and at the top of every other method, so a
callback that fires late draws nothing and a stray event on a dead board re-arms
nothing. `src/game.ts` calls it in exactly two places - the `mount()` teardown,
before `buildBoard` replaces the DOM, and `checkComplete`, before any celebration
is built - and the drag case is handled by `pause()`, which takes the hint down
without re-arming.

The latching is covered by tests that hold the callback and fire it *after*
`stop()`, which is the only way to reproduce the race deterministically.

## Consequences

- The idle hints control on the grown-up panel now does something, so the
  panel's rule that every option on it does something is true again with no
  footnotes. Its note no longer says "Not in play yet."
- `src/hint.ts` is the one home for the feature: the delays, the state machine,
  `hintPiece`, and the markup. Nothing about hinting lives in a kind.
- A new `PuzzleKind` gets a working hint without writing one, and gets none on a
  touch-played level without asking for that either. The one thing it must do is
  implement `openTargets` if it implements `settle`.
- The delays - 5s for "Sooner", 14s for "Later", the default - are argued rather
  than observed. They are one constant each in `src/hint.ts` and are the first
  thing to change if a real two-year-old finds them wrong.
- No sound was added. A hint that announces itself is a hint that can be ignored
  wrongly, and silence was asked for.
