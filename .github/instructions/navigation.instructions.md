---
name: "Navigation and feel"
description: "How the game moves between stages, what the buttons and dots are for, and the feedback and toddler-proofing around a drag."
applyTo: "src/game.ts,src/celebrate.ts,src/drag.ts,src/audio.ts,src/main.ts,src/style.css,index.html"
---

# Navigation and feel

This is the shell around the puzzle: getting from one stage to the next, what
happens when a piece lands, and everything that keeps a two-year-old from
falling out of the game by accident. The rules of a level live elsewhere - see
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Forward only

A game is five stages long: two pieces, then three, then four, then five, then
six. Finishing a
stage clears the tray and puts one big button in it, which leads to the next
stage; the button after the last stage starts the whole game over
(`nextStage` in `src/layout.ts` wraps). So the only way to go is forward and
there is never a menu to get lost in.

There is no menu, no difficulty picker, no settings, no failure state and no
score, and adding one is a change to an invariant, not a feature. The reasoning
is [decision 20260727T072917](../../docs/decisions/20260727T072917-no-menu-or-difficulty-picker.md).

The five dots by the reset button (`buildStageDots` in `src/board.ts`) are
filled up to the current stage so a grown-up can see how far along the set is.
They are an indicator, not a control: they carry `pointer-events: none` on
purpose. Do not make them tappable.

The reset button re-deals the current stage. It goes through the same path as
moving between stages (`startPuzzle` in `src/game.ts`), so a board is rebuilt
one way rather than two, and a toddler never sees the same line-up twice in a
row for long.

## Feedback

- Picking a piece up, snapping one in, and finishing all play synthesised tones
  (`src/audio.ts`). There are no audio files; see the no-binary-assets
  invariant in [`product.instructions.md`](product.instructions.md).
- A refused drop plays `playReturn` - a soft, warm tone - and the piece drifts
  back to the tray. Never a buzzer, and never leaving the piece where it fell.
- A piece that lands gets a sparkle burst; finishing a stage gets a bigger one
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
