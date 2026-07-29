---
name: "Navigation and feel"
description: "How the game moves between levels, how a chapter and the game end, what the buttons and dots are for, and the feedback and toddler-proofing around a drag."
applyTo: "src/game.ts,src/celebrate.ts,src/celebration.ts,src/drag.ts,src/audio.ts,src/grownups.ts,src/main.ts,src/style.css,index.html"
---

# Navigation and feel

This is the shell around the puzzle: getting from one level to the next, what
happens when a piece lands, and everything that keeps a two-year-old from
falling out of the game by accident. The rules of a level live elsewhere - see
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Forward only

A game is thirty levels long, in six chapters of five, and it starts on level 1
with a screenful of bubbles to pop - a level that asks for a finger and nothing
else, because dragging is beyond many one-year-olds and a first screen they
cannot work is a closed door. What each level holds is the table in
`src/levels.ts`, not anything here; see
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md). Finishing a
level clears the tray and puts one big button in it, which leads to the next
level - a level played by touching has no tray to clear, and the same button
appears in the same place. Finishing the fifth level of a chapter puts that
button on top of a celebration; see [The end of a chapter](#the-end-of-a-chapter)
below. The button after the last level starts the whole game
over
(`nextLevel` in `src/levels.ts` wraps). So the only way to go is forward and
there is never a menu to get lost in.

There is no menu, no difficulty picker, no settings, no failure state and no
score on the play surface, and putting one there is a change to an invariant,
not a feature. The reasoning is
[decision 20260727T072917](../../docs/decisions/20260727T072917-no-menu-or-difficulty-picker.md).
Everything a grown-up can change lives in the panel described below, which the
child cannot open.

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

## The end of a chapter

Thirty levels that all end with the same four-note fanfare and the same 700ms
sparkle flatten completely, so the fifth level of every chapter ends with a
celebration instead: balloons, a parade, blossom, a rainbow, fireworks, and
after level 30 the finale. `src/celebration.ts` owns all six; `endsChapter` in
`src/levels.ts` says when one is due, read off the level table rather than
written down as a list of level numbers.

The rules a celebration has to keep:

- **It is played, not watched.** Everything in one answers a finger in the tick
  the finger landed - a balloon pops, an animal hops, a tap paints the next arc
  or sets off a firework. A two-year-old will not sit through a cutscene; they
  will put a finger on it, and what a finger lands on has to do something good.
- **It is not a level and not a `PuzzleKind`.** It has no pieces, no targets, no
  difficulty and no row in the thirty-level table. What it copies from
  `PuzzleKind.play` is the shape: handed a layer, answers the finger itself,
  returns a teardown, keeps its progress outside the board so a rotation does not
  lose it.
- **It cannot be a trap at either end.** The big button onwards goes up while
  the celebration is still going, not after it, so a child who pops everything in
  four seconds already has the way on; and new things go on arriving unasked for
  `CELEBRATION_SPAN_MS`, so a child who touches nothing is not looking at an
  empty screen. When the span runs out only the *arriving* stops - whatever is on
  screen goes on answering for as long as the child stays. A floater hands its
  place on part way through its journey rather than at the edge
  (`TUNING.handOnAt`), so a handful released together cannot reach the edge
  together and leave a hole behind them.
- **The button arrives rather than sitting there - but only on a chapter end,
  and only the first time.** It holds back for `FINISH_BUTTON_BEAT_MS`
  (`src/celebration.ts` explains the number) and then fades up, because after
  twenty-five presses it is the most conditioned thing on the screen and would
  otherwise be pressed before the celebration is noticed. The celebration answers
  a finger throughout that beat, so nothing is withheld except the way out. Do
  not extend the beat to an ordinary level, where the button is the whole reward,
  and do not re-run it after a rotation: `showFinish` takes a `fresh` flag for
  exactly that.
- **Nothing here ever changes the level by itself.** A clock that advanced the
  game would take it away mid-tap. The finale does not wind down at all: the end
  of thirty levels is a room to stay in, and the way out is the same button.
- **It is drawn below the effects layer.** `board.celebrationLayer` sits between
  the pieces and `fx`, which is what makes it impossible for a balloon or a
  full-board tap catcher to cover the button onwards. Do not move it above.

The reasoning is
[decision 20260729T152400](../../docs/decisions/20260729T152400-a-celebration-is-played-not-finished.md).

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
  the game is not diminished by forgetting. A storage that can be read but not
  written is still read, though, so a device out of quota resumes where the
  child was; `persists` is how the panel tells that apart, and once it is false
  it stays false.
- **A stored level is checked against the table.** A level number the thirty no
  longer has sends the child back to level 1, not to the last level.
- **Progress is cleared from the grown-up panel and nowhere else**, via
  `clearProgress()`. The button on the play surface deals a fresh puzzle for the
  level being played; that is all it has ever done.

The settings in the record - `sound`, `rotation` and `hints` - are set from the
grown-up panel below. `sound` is wired: `applySettings` in `src/grownups.ts`
calls `setSoundEnabled` in `src/audio.ts`, which every tone goes through, so off
means silent whatever is played next. `rotation` (#14) and `hints` (#21) are
stored and read back correctly and have no consumer yet; each is one line in
`applySettings` when its consumer arrives. The reasoning for all of this is
[decision 20260728T212500](../../docs/decisions/20260728T212500-remember-where-the-child-stopped.md).

## The grown-up panel

The one part of the game that is not for the child (`src/grownups.ts`). It holds
a map of the thirty levels to jump about in, the switches, and the only reset in
the game. The reasoning is
[decision 20260729T000652](../../docs/decisions/20260729T000652-a-door-for-grown-ups.md);
what the code has to keep true is this.

- **The button is visible and says "Grown-ups".** It is not a secret gesture and
  must not become one: a parent who has never seen the game has to be able to
  find it, and a gesture obscure enough to defeat a toddler defeats them too.
- **Tapping it never opens anything.** A press starts a two-second hold
  (`HOLD_MS`) and shows "Hold to open"; a release starts the next hold from
  zero, so taps never add up. The rule is `createHoldGate`, a state machine with
  the clock passed in and no DOM in it, which is why two hundred taps can be
  checked in Vitest. The ring around the button is painted from the same gate on
  an animation frame, but the opening is armed on a timer as well: frames are
  for the ring, the clock is the rule.
- **The prompt outlives the press.** "Hold to open" stays up for `PROMPT_MS`
  after a tap, because the tap is the moment a grown-up needs telling and the
  answer has to still be there when they look.
- **The panel is not toddler-styled.** Small text, ordinary switches, ordinary
  spacing. Making it big and bright would invite exactly the person it is
  hiding from.
- **It never touches the board.** It is HTML mounted outside `#app` - which
  `buildBoard` replaces wholesale - so closing it puts the child back mid-puzzle
  without re-dealing anything. Only choosing a level changes the board.
- **Choosing a level is not reaching it.** The map's squares come from
  `furthest`, and a level chosen here goes through `jumpToLevel` rather than
  `reachLevel`, so reading the map never fills the map in. `createGame` returns
  the handle the panel drives (`chooseLevel`, `currentLevel`).
- **Reset asks twice**, and is the only place progress can be cleared.

## Feedback

- Picking a piece up, snapping one in, and finishing all play synthesised tones
  (`src/audio.ts`). There are no audio files; see the no-binary-assets
  invariant in [`product.instructions.md`](product.instructions.md).
- A refused drop plays `playReturn` - a soft, warm tone - and the piece drifts
  back to the tray. Never a buzzer, and never leaving the piece where it fell.
- A piece that lands gets a sparkle burst; finishing a level gets a bigger one
  (`src/celebrate.ts`), and finishing a chapter gets a celebration on top of it
  (`src/celebration.ts`, above).
- On a level played by touching (`PuzzleKind.play`), the host does the same for
  a touch: the kind reports one through `host.touched(at)` and gets a sparkle
  there and a check for completion, so a bubble bursting and an animal landing
  are answered the same way. Everything else about the response - the sound, the
  spin, the bush going - belongs to the kind, and all of it happens in the tick
  the finger landed. See
  [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).
- `prefers-reduced-motion` is honoured throughout, and `prefersReducedMotion()`
  in `src/motion.ts` is the one place that is asked: the settle transition and
  the sparkles collapse to 1ms rather than being removed, so the same code path
  still ends with the element in the right place, and the finish button's pulse
  simply does not start. A floating thing in `src/pop.ts` is the one exception -
  it holds still instead, because collapsing its drift would carry it off screen
  at once; see
  [decision 20260729T072100](../../docs/decisions/20260729T072100-reduced-motion-holds-still.md).
  A celebration follows the same rule: the parade stands in a row rather than
  walking, a rainbow appears without wiping itself on, and a firework bursts
  without climbing - the moment still happens, more calmly.
- Audio needs a gesture to start, so `unlockAudio` runs off the first pointer
  down rather than at load.

## Drag feel

`src/drag.ts` is the pointer-event drag engine; `src/game.ts` owns what a drag
means. Neither is started for a level played by touching. Between them:

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
