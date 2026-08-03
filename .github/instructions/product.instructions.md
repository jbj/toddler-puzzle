---
name: "Product decisions"
description: "What Animal Puzzle is for, the invariants that must not be weakened, and the tie-breaker for an open design question."
---

# Product decisions

Animal Puzzle is a drag-and-drop animal shape puzzle for toddlers: thirty
levels, six chapters of five, growing from bubbles to pop and one animal to drag
into more pieces, more kinds of puzzle and a little less forgiveness.

Read this before changing what the game *does*. It is not attached
automatically; pull it in whenever a task touches behaviour a player would
notice.

## Tie-breaker

The player is a two-year-old who cannot read. When a design question is
genuinely open, choose whatever is more forgiving and needs less understanding.

## Invariants

Deliberate, and not to be weakened silently. Several look like oversights until
you know why; the reason is the clause after the rule, and the record behind it.

### Drawing and fit

- Draw the hole and the piece from the same `#silhouette` path, never
  separately, so a piece cannot drift out of alignment with its hole.
- Keep `#detail` inside `#silhouette` unless tagged `data-overhang="..."`;
  tagged overhang is budgeted at 3% of the animal's area. Accidental overhang
  makes a piece look as if it does not fit. See
  [Budget overhang instead of banning it](<../../docs/decisions/Budget overhang instead of banning it.md>).
- Set `FOOT_LEVEL` in `src/assets.ts` from `npm run art:check`, never by eye.
- Paint no animal into a background, ever, in any theme. A cow standing in the
  field beside a cow-shaped hole tells a two-year-old, correctly as far as they
  can tell, that the cow they are holding is already there. See
  [A background belongs to the theme](<../../docs/decisions/A background belongs to the theme.md>).

### Forgiveness

- Let a piece snap only into its own hole. A wrong drop is impossible to make;
  it drifts back to the tray with a soft warm tone, never a buzzer.
- Measure a piece by one box and place it by one rule, in every kind of puzzle:
  the box is what the piece draws, thickened so neither side is under half the
  other, and a drop is taken when that box covers the middle of where the piece
  belongs. The same box is what a piece can be grabbed by, what holds it on the
  canvas, and what the tray packs a cell from. Do not tighten it; do not give a
  kind a rule of its own. See
  [One box measures a piece, and one rule places it](<../../docs/decisions/One box measures a piece, and one rule places it.md>).
- Keep the idle hint silent, unrepeated and unearned: a glow and never a sound,
  never a second nag, never a cost. Never point it at a level played by
  touching, and never let it land on a celebration. See
  [A hint points at both ends](<../../docs/decisions/A hint points at both ends.md>).
- Keep every target large: pieces stay well over a tenth of the canvas wide.

### The shape of the game

- Let the child's game move only forward: no menu, no difficulty picker, no
  settings, no failure state, no score on the play surface. The chapter dots are
  an indicator for a grown-up, not a control, and `?level=` is a tool for
  working on the game, not a way in. See
  [Keep the game moving forward](<../../docs/decisions/Keep the game moving forward.md>).
- Keep the opening chapter playable without a drag. Levels 1, 3 and 5 are
  cause-and-effect levels that end on a handful of touches, or on the level's
  ten seconds, whichever comes first. Never ask for aiming, carrying or letting
  go there, and never ask for a screenful. See
  [Open the game with something to touch](<../../docs/decisions/Open the game with something to touch.md>)
  and
  [Ask a touch level for a handful, and let the child out anyway](<../../docs/decisions/Ask a touch level for a handful, and let the child out anyway.md>).
- Mark the end of a chapter and the end of the game, and make both something to
  play with rather than sit through. A celebration never changes the level by
  itself, and never runs longer than the first moment without the button onwards
  on screen. See
  [A celebration is played, and it ends by itself](<../../docs/decisions/A celebration is played, and it ends by itself.md>).
- Keep everything a grown-up can change behind the two-second hold on the
  "Grown-ups" button, plainly styled for an adult. Not on the play surface, and
  not behind a secret gesture. See
  [Put the settings behind a two-second hold](<../../docs/decisions/Put the settings behind a two-second hold.md>).
- Let a grown-up switch a kind of puzzle out from that panel - one switch per
  kind, never the last one, never by editing the level table. A kind switched
  off is stepped over; the ramp, its order and the child's screen are unchanged.
  See
  [A grown-up can take a kind of puzzle out](<../../docs/decisions/A grown-up can take a kind of puzzle out.md>).
- Resume on the level the child stopped on, and treat storage as a nicety: any
  failure to remember falls back silently to level 1 and a game that plays. See
  [Remember where the child stopped](<../../docs/decisions/Remember where the child stopped.md>).

### What it costs

- Let nothing move while nobody is playing. Two minutes untouched, or a hidden
  tab, freezes the whole page until a finger or the tab returns. A freeze is
  never a change: nothing ends, nothing advances, and the touch that wakes the
  game plays it too. See
  [The game sleeps when nobody is playing](<../../docs/decisions/The game sleeps when nobody is playing.md>).
- Keep the project free of binary assets, runtime dependencies and network
  requests: art is hand-authored SVG, sound is synthesised with the Web Audio
  API. See
  [Keep assets and runtime simple](<../../docs/decisions/Keep assets and runtime simple.md>).
- Keep the game inside its bundle budget, and keep every chunk warmed during
  play rather than fetched when it is reached. See
  [A chapter is warmed before it is needed, not fetched when it is](<../../docs/decisions/A chapter is warmed before it is needed, not fetched when it is.md>).
- Give the board the whole screen, whatever shape it is: short side always 700
  logical units, long side whatever the ratio asks for. Never letterbox, never
  special-case an extreme ratio. See
  [The board is composed for the screen it is on](<../../docs/decisions/The board is composed for the screen it is on.md>).

## Where the mechanics live

| For | Read |
| --- | --- |
| Snapping, hints, celebrations, the panel, resting, drag feel | [`navigation.instructions.md`](navigation.instructions.md) |
| Kinds of puzzle, the level table, themes | [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md) |
| Backdrops, board shape, where pieces stand | [`layout.instructions.md`](layout.instructions.md) |
| The SVG contract and the art checks | [`art.instructions.md`](art.instructions.md) |
