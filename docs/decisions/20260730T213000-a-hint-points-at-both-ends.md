# 20260730T213000. A hint points at both ends

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

The child this feature exists for is the one at the young end of a game that
opens without requiring a drag, on purpose, because a one-year-old cannot yet
pinch, carry and let go (see
[decision 20260729T072100](20260729T072100-the-game-opens-with-something-to-touch.md)).
The first time they meet a tray, "there is a rabbit-shaped space in the grass" is
not actionable. "*That* rabbit goes in *that* space" is.

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
exactly the region `accepts` will take it in; a polygon glows the shadow it is
aimed at *now*, swaps included; a jigsaw piece glows its own place in the
picture. Adding a kind gets a working hint for free, as long as the kind
implements `target` honestly.

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

### A level played by touching is never hinted at

`PuzzleKind.play` levels - the bubbles, the bushes, the answering scene - have no
tray, no drag engine, no targets and no wrong place. A finger anywhere lands on
something that answers.

The frustration this feature relieves is "I do not know where this goes", and on
those levels it cannot arise: there is nowhere for anything to go. A hint there
would have to invent a thing to point at, and the only candidates are things the
kind owns and animates - a drifting bubble, a bush mid-wobble - so the host would
be pointing at somewhere they no longer are.

The coherent answer is that a level with nothing to aim at gets nothing aimed.
`npm run shot` leaves a touch level idle for the full window and checks that
nothing glows.

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
  touch-played level without asking for that either.
- The delays - 5s for "Sooner", 14s for "Later", the default - are argued rather
  than observed. They are one constant each in `src/hint.ts` and are the first
  thing to change if a real two-year-old finds them wrong.
- No sound was added. A hint that announces itself is a hint that can be ignored
  wrongly, and silence was asked for.
