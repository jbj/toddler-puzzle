# Navigation

This is the shell around a puzzle: forward progression, celebrations,
persistence, reset, and grown-up controls. Puzzle contents belong in
[`puzzle-kinds.md`](puzzle-kinds.md); sound, rest, and drag belong in
[`feel.md`](feel.md).

## Forward only

- The level table owns the ramp, its order, and progression boundaries.
- Completing a puzzle clears the tray and offers one large way onward.
- The final way onward restarts the ramp.
- The child's surface has no menu, difficulty picker, settings, failure state,
  or score. See
  [Keep the game moving forward](<decisions/Keep the game moving forward.md>).
- Progress indicators are indicators, not controls.
- URL overrides are development tools and must not become player navigation.
- Reset re-deals the current puzzle through the normal start path. Because it
  discards progress, it requires the shared held-press gate and gives visible
  progress without asking the child to read. See
  [Hold the button that throws the puzzle away](<decisions/Hold the button that throws the puzzle away.md>).
- A grown-up kind filter changes which rows progression visits without mutating
  the table. Every progression helper must answer about the same filtered game.

## Celebrations

Every completed puzzle receives a celebration. Progression boundaries receive
the larger celebrations selected by the canonical celebration mapping; other
levels receive a smaller interlude.

- **Played, not watched.** A celebration responds to a finger immediately.
- **Never made from the finished board.** The puzzle remains visible, so reused
  subject matter looks like a duplicate rather than a reward. See
  [A celebration is not made of the board](<decisions/A celebration is not made of the board.md>).
- **Not a puzzle kind.** Celebrations have no pieces, targets, difficulty, or
  level-table rows.
- **Not a trap.** The way onward appears while play continues. New arrivals may
  stop, but things already present remain playable.
- **Never advances by itself.** Only the child's onward action changes the level.
- **The initial pause is deliberate.** It gives the finished board and
  celebration a moment before the conditioned onward control appears. The
  celebration responds throughout, a failed celebration creates no empty wait,
  and unattended time does not consume the pause.
- **Layering protects the control.** Celebration interaction must not cover the
  onward control or effects above it.
- **Reduced motion preserves the event.** It changes movement, not whether the
  child receives and can play the celebration.

See
[A celebration is played, and it ends by itself](<decisions/A celebration is played, and it ends by itself.md>)
and
[A celebration between every level](<decisions/A celebration between every level.md>).

The celebration mapping, rotations, spans, and timing values are code-owned.
Tests derive coverage from those canonical sources.

## Persistence

`src/progress.ts` owns the current level, furthest progress, and grown-up
settings. `src/game.ts` records the level actually in play.

- **Storage failure is not a player-visible error.** Throwing, disabled, full,
  corrupt, or unfamiliar storage falls back to a playable in-memory record.
- **Read and write capability are independent.** Keep usable saved progress even
  when a later write fails.
- **Stored levels are validated against the current table.** Invalid progress
  returns to the start rather than guessing another row.
- **Re-dealing does not count as progress.**
- **Only the grown-up panel clears progress.**
- **Settings are read at the boundary that uses them.** Do not copy settings
  into parallel state that can drift.
- **Storage format changes are tolerant where fields are independent.**
  `STORAGE_VERSION` in `src/progress.ts` and its tests own the versioning policy.

See
[Remember where the child stopped](<decisions/Remember where the child stopped.md>).

## Grown-up controls

The grown-up panel is the only part of the game intended for a reader.

- The entry control is visible and plainly labelled, not a secret gesture.
- Opening requires one continuous hold through the shared hold state machine;
  taps do not accumulate.
- The panel uses ordinary adult controls rather than toddler styling.
- It is mounted outside the replaceable board so closing it returns to the same
  puzzle.
- Choosing a level does not mark that level as reached.
- A kind may be disabled, but the last playable kind may not.
- Switching off the current kind moves forward to a playable row.
- Reset asks for confirmation and is the only progress-clearing control.
- Every option must have a current effect; do not leave placeholder switches.

See
[Put the settings behind a deliberate hold](<decisions/Put the settings behind a deliberate hold.md>)
and
[A grown-up can take a kind of puzzle out](<decisions/A grown-up can take a kind of puzzle out.md>).

The current controls, labels, map shape, and hold timing live in the panel,
level table, and hold module; browser checks guard the assembled behavior.
