---
name: "Navigation"
description: "How the game moves between levels, how a chapter and the game end, coming back to it, and the grown-up panel."
applyTo: "src/game.ts,src/celebrate.ts,src/celebration.ts,src/grownups.ts,src/progress.ts,src/main.ts"
---

# Navigation

The shell around the puzzle: getting from one level to the next, how a chapter
and the game end, resuming, and the one panel a grown-up can open. What a level
holds is elsewhere - see
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md). The feel of a
level - sound, sparkles, the hint, drag, rest - is in
[`feel.instructions.md`](feel.instructions.md).

## Forward only

- Thirty levels, six chapters of five, starting on level 1. The level table is
  `src/levels.ts`, not here.
- Finishing a level clears the tray and puts one big button in it, leading to the
  next level. A touch level has no tray to clear; the same button appears in the
  same place. Finishing a chapter's fifth level puts that button on top of a
  celebration.
- The button after the last level starts the game over (`nextLevel` in
  `src/levels.ts` wraps).
- No menu, difficulty picker, settings, failure state or score on the play
  surface - putting one there weakens an invariant. See
  [Keep the game moving forward](<../../docs/decisions/Keep the game moving forward.md>).
- A grown-up shortens the ramp only by switching a kind off (panel below); the
  table is never edited and nothing is added to the play surface. Levels of an
  off kind are stepped over. `nextLevel`, `endsChapter`, `playableFrom` and
  `isLastPlayable` in `src/levels.ts` all take the same optional `EnabledKinds`
  and answer about the game actually in play. `src/game.ts` reads the setting
  when it needs it rather than copying it, so a switch moved mid-level is
  answered by the button at that level's end. See
  [A grown-up can take a kind of puzzle out](<../../docs/decisions/A grown-up can take a kind of puzzle out.md>).
- The six dots by the reset button (`buildChapterDots` in `src/board.ts`) are one
  per chapter, filled up to the chapter in play. They are an indicator, not a
  control: they carry `pointer-events: none`. Do not make them tappable.
- `?level=` in the URL (`src/main.ts`) starts partway along the ramp - a tool for
  the screenshot run and for working on the game, not a difficulty picker. Do not
  surface it. It wins over the saved level and writes nothing: a deep-linked
  level, and the loop back to level 1 after it, leave the child's own place
  untouched.
- The reset button re-deals the current level through the same path as moving
  between levels (`startPuzzle` in `src/game.ts`).

## The end of a chapter

Each chapter's fifth level ends with a celebration instead of the ordinary
finish - balloons, a rainbow, blossom, a parade, fireworks, and after level 30
the finale. `src/celebration.ts` owns all six; `endsChapter` in `src/levels.ts`
says when one is due, read off the level table. See
[A celebration is played, and it ends by itself](<../../docs/decisions/A celebration is played, and it ends by itself.md>).

- **Never made of what the finished board is made of.** The puzzle stays on
  screen to be admired, so anything the celebration shares with it arrives as a
  second copy. The parade ends the chapter of coloured shapes, not the chapter of
  animals, and deals its walkers from the animals the board is *not* holding
  (`paradeCast`). Check what a chapter's fifth level leaves on screen before
  hanging a celebration on it. See
  [A celebration is not made of the board](<../../docs/decisions/A celebration is not made of the board.md>).
- **Played, not watched.** Everything answers a finger in the tick it lands.
- **Not a level and not a `PuzzleKind`.** No pieces, targets, difficulty or table
  row. It copies the shape of `PuzzleKind.play`: handed a layer, answers the
  finger itself, returns a teardown, keeps progress outside the board so a
  rotation does not lose it.
- **Not a trap at either end.** The button onwards goes up while the celebration
  is still running; new things keep arriving unasked for `CELEBRATION_SPAN_MS`;
  when the span runs out only the *arriving* stops, and whatever is on screen
  keeps answering. A floater hands its place on partway through its journey
  (`TUNING.handOnAt`) so a batch released together cannot reach the edge together
  and leave a hole.
- **The button arrives, but only on a chapter end and only the first time.** It
  holds back `FINISH_BUTTON_BEAT_MS` (see `src/celebration.ts`) then fades up; the
  celebration answers a finger throughout that beat. Do not extend the beat to an
  ordinary level, where the button is the whole reward, and do not re-run it after
  a rotation: `showFinish` takes a `fresh` flag for exactly that.
- **Nothing here changes the level by itself.** The finale never winds down; the
  way out is the same button.
- **Drawn below the effects layer.** `board.celebrationLayer` sits between the
  pieces and `fx`, so a balloon or a full-board tap catcher can never cover the
  button onwards. Do not move it above.

## Coming back to it

The level in play is remembered in `localStorage` and the next visit resumes
there. `src/progress.ts` owns the record - current level, furthest reached, and
the grown-up settings - and `startPuzzle` in `src/game.ts` is the one place that
tells it which level is in play. Re-dealing the same level writes nothing. See
[Remember where the child stopped](<../../docs/decisions/Remember where the child stopped.md>).

- **Storage failing is not an error.** iPad Safari in private browsing throws on
  the mere mention of `localStorage`. Every failure - throwing, disabled, full,
  corrupt, an unknown version - falls back silently to an in-memory record and
  level 1. Never surface it. Storage that reads but cannot write is still read, so
  a device out of quota resumes where the child was; `persists` tells that apart,
  and once false it stays false.
- **A stored level is checked against the table.** A level number the thirty no
  longer has sends the child to level 1, not the last level.
- **Progress is cleared from the grown-up panel and nowhere else**, via
  `clearProgress()`. The play-surface button only deals a fresh puzzle for the
  current level.
- **Settings live in the record** - `sound`, `hints`, `kinds` - set from the
  panel. `applySettings` in `src/grownups.ts` is the single place `sound` and
  `hints` reach the game: `sound` calls `setSoundEnabled` in `src/audio.ts`,
  `hints` calls `setHintTiming` in `src/hint.ts`. Both are answered on the board
  in front of the grown-up, not at the next level. `kinds` is deliberately not in
  `applySettings`: `src/game.ts` asks the record which kinds are in play when it
  needs to know, and `src/main.ts` resumes forward off a level whose kind has
  since been switched off.
- **No `rotation` setting**: the feature was dropped, so the field and switch went
  with it. See
  [Rotation mode is not built, and the switch is gone](<../../docs/decisions/Rotation mode is not built, and the switch is gone.md>).
- **`STORAGE_VERSION` is not bumped for a field coming or going.** Each field is
  read on its own and an unknown one is passed over, so a record written before
  `kinds` reads as the whole ramp and one written while `rotation` existed still
  resumes on the right level.

## The grown-up panel

The one part of the game not for the child (`src/grownups.ts`): a map of the
thirty levels, the switches, and the only reset in the game. See
[Put the settings behind a two-second hold](<../../docs/decisions/Put the settings behind a two-second hold.md>).

- **The button is visible and says "Grown-ups".** Not a secret gesture, and must
  not become one.
- **Tapping never opens it.** A press starts a two-second hold (`HOLD_MS`) and
  shows "Hold to open"; a release restarts the hold from zero, so taps never add
  up. The rule is `createHoldGate`, a pure state machine with the clock passed in
  and no DOM, so hundreds of taps are testable in Vitest. The ring is painted from
  the same gate on an animation frame, but the opening is armed on the clock.
- **The prompt outlives the press.** "Hold to open" stays up for `PROMPT_MS`
  after a tap.
- **The panel is not toddler-styled.** Small text, ordinary switches and spacing.
- **It never touches the board.** It is HTML mounted outside `#app` (which
  `buildBoard` replaces wholesale), so closing it puts the child back mid-puzzle
  without re-dealing. Only choosing a level, or switching off the kind of the
  level in play, changes the board.
- **Choosing a level is not reaching it.** The map's squares come from `furthest`,
  and a chosen level goes through `jumpToLevel`, not `reachLevel`, so reading the
  map never fills it in. `createGame` returns the handle the panel drives
  (`chooseLevel`, `currentLevel`).
- **A kind can be switched out, but never the last one.** Six switches, one per
  `PuzzleKindId`, walked off `PUZZLE_KINDS` in `src/levels.ts` so a seventh kind
  cannot arrive without one. `toggleKind` is the rule and is pure: it refuses the
  press that would leave nothing to play, and `refresh` draws the lone survivor as
  held on. Switching off the kind under the child moves them to the next level in
  play. The map keeps all thirty squares, fades the skipped ones, and they stay
  pressable. See
  [A grown-up can take a kind of puzzle out](<../../docs/decisions/A grown-up can take a kind of puzzle out.md>).
- **Reset asks twice**, and is the only place progress can be cleared.
- **Every option does something.** A switch for sound, a choice of idle-hint
  timing, and a switch per kind. `npm run shot` reads the option labels and checks
  the list so a dropped one cannot creep back, and reads the notes underneath and
  fails on any that admits to doing nothing.
