---
name: "Navigation and feel"
description: "How the game moves between levels, what the buttons and dots are for, and the feedback and toddler-proofing around a drag."
applyTo: "src/game.ts,src/celebrate.ts,src/drag.ts,src/audio.ts,src/main.ts,src/style.css,index.html"
---

# Navigation and feel

This is the shell around the puzzle: getting from one level to the next, what
happens when a piece lands, and everything that keeps a two-year-old from
falling out of the game by accident. The rules of a level live elsewhere - see
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Forward only

A game is thirty levels long, in six chapters of five, and it starts on level 1
with a single huge animal. What each level holds is the table in `src/levels.ts`,
not anything here; see
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md). Finishing a
level clears the tray and puts one big button in it, which leads to the next
level; the button after the last level starts the whole game over
(`nextLevel` in `src/levels.ts` wraps). So the only way to go is forward and
there is never a menu to get lost in.

There is no menu, no difficulty picker, no settings, no failure state and no
score, and adding one is a change to an invariant, not a feature. The reasoning
is [decision 20260727T072917](../../docs/decisions/20260727T072917-no-menu-or-difficulty-picker.md).

The six dots by the reset button (`buildChapterDots` in `src/board.ts`) are one
per chapter, filled up to the chapter being played, so a grown-up can see how far
along the set is without thirty dots of clutter. They are an indicator, not a
control: they carry `pointer-events: none` on purpose. Do not make them tappable.

`?level=` in the URL (`src/main.ts`) starts partway along the ramp. It exists for
the screenshot run and for whoever is working on the game - playing to level 30
to look at level 30 takes minutes - and is emphatically not a difficulty picker:
nothing in the game offers it, and the player cannot read a URL. Do not surface
it. It wins over the saved level, because a link should go where it says, and it
writes nothing: a level played from a deep link, and the loop back to level 1
after it, leave the child's own place exactly where it was.

The reset button re-deals the current level. It goes through the same path as
moving between levels (`startPuzzle` in `src/game.ts`), so a board is rebuilt
one way rather than two, and a toddler never sees the same line-up twice in a
row for long.

## Coming back to it

Thirty levels is more than one sitting, so the level being played is remembered
in `localStorage` and the next visit resumes there. `src/progress.ts` owns the
record - current level, furthest reached, and the grown-up settings - and
`startPuzzle` in `src/game.ts` is the one place that tells it which level is
being played. Re-dealing the same level writes nothing, which is what keeps the
reset button from touching progress.

Three things about it are load-bearing:

- **Storage failing is not an error.** iPad Safari in private browsing throws on
  the mere mention of `localStorage`. Every failure - throwing, disabled, full,
  corrupt, a version this build does not know - falls back to an in-memory
  record and level 1, silently. Never surface it: the player cannot read, and
  the game is not diminished by forgetting.
- **A stored level is checked against the table.** A level number the thirty no
  longer has sends the child back to level 1, not to the last level.
- **Progress is cleared from the grown-up panel and nowhere else** (#8, via
  `clearProgress()`). The button on the play surface deals a fresh puzzle for
  the level being played; that is all it has ever done.

The settings in the record - `sound`, `rotation` and `hints` - are stored and
defaulted before anything reads them, so the panel that sets them (#8) and the
code that acts on them (#14, #21) have one shape to agree on. The reasoning for
all of this is
[decision 20260728T212500](../../docs/decisions/20260728T212500-remember-where-the-child-stopped.md).

## Feedback

- Picking a piece up, snapping one in, and finishing all play synthesised tones
  (`src/audio.ts`). There are no audio files; see the no-binary-assets
  invariant in [`product.instructions.md`](product.instructions.md).
- A refused drop plays `playReturn` - a soft, warm tone - and the piece drifts
  back to the tray. Never a buzzer, and never leaving the piece where it fell.
- A piece that lands gets a sparkle burst; finishing a level gets a bigger one
  (`src/celebrate.ts`).
- `prefers-reduced-motion` is honoured throughout: the settle transition and
  the sparkles collapse to 1ms rather than being removed, so the same code path
  still ends with the element in the right place, and the finish button's pulse
  simply does not start.
- Audio needs a gesture to start, so `unlockAudio` runs off the first pointer
  down rather than at load.

## Drag feel

`src/drag.ts` is the pointer-event drag engine; `src/game.ts` owns what a drag
means. Between them:

- The piece is held slightly above the finger, so a small hand does not cover
  the thing it is moving.
- A piece is picked up anywhere inside the box around its artwork, not only
  where a finger lands on paint. Every piece carries an invisible rectangle over
  its drawing (`fitGrabBox` in `src/board.ts`), which is what makes the gap
  between a giraffe's legs part of the giraffe. It is measured from the artwork
  at mount and clamped to the piece's authored box - which is exactly the slot
  it was laid out in, and slots never overlap - so one piece's grab area can
  never reach into the next one's. Do not delete the rectangle as dead markup;
  the reasoning is
  [decision 20260728T120732](../../docs/decisions/20260728T120732-grab-anywhere-in-the-piece-box.md).
- Pieces are clamped to the canvas by their own bounds (`boxOf(layout, piece)`),
  so one can never be dragged out of reach whatever shape it is.
- A piece settles back with a short animation (`SETTLE_MS`), whether it was
  accepted or refused - the difference is where it settles, not how abruptly.
- Which tray slot each piece belongs to is remembered in the host and survives a
  re-layout, so rotating the device mid-puzzle does not lose progress.

## Toddler-proofing

A toddler holds a tablet with both hands and touches it everywhere. These are
all deliberate, and each one is load-bearing:

- `touch-action: none` on the stage, so a drag never turns into a scroll;
- `user-select: none`, so a slow drag never selects text;
- `maximum-scale=1.0, user-scalable=no` in `index.html`, so pinch and double-tap
  cannot zoom the board away;
- `contextmenu` and `dragstart` are prevented in `src/drag.ts`, because a
  long-press menu or a native image drag both interrupt play.

## Repeatable runs

`src/main.ts` reads `?seed=123` from the URL and hands `createGame` a seeded
random source instead of `Math.random`. Without it, every puzzle deals fresh
animals. The screenshot run uses a seed to compare like with like; see
[`tests.instructions.md`](tests.instructions.md).
