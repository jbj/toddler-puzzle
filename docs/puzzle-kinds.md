# Puzzle kinds

Layout belongs in [`layout.md`](layout.md). Cutting one drawing into several
pieces belongs in [`cutting.md`](cutting.md).

## Host and kind

`src/game.ts` is the host for dragging, settling, feedback, and the level
lifecycle. Behavior that varies by puzzle belongs behind the `PuzzleKind`
contract in `src/puzzle.ts`.

- A kind deals pieces and targets, draws its backdrop, names accepted places,
  reports completion, and may record a placement choice.
- Pieces and targets are separate concepts. Several pieces may rebuild one
  target, and completion need not mean an empty tray.
- A kind names *where* a piece may go. Shared layout code owns *how close* a drop
  must be, so no kind can opt out of forgiveness.
- A kind with several equally valid destinations must expose all open
  destinations to the idle hint and record the destination actually chosen.
  Those two capabilities are one contract and must stay paired.
- Refused drops always return through the host's gentle shared path.

## Difficulty table

`LEVELS` in `src/levels.ts` is the sole source of truth for the difficulty ramp.
It says what a level asks for; dealing decides which eligible pieces appear.

- **Tune difficulty in the table, nowhere else.** See
  [Put the whole difficulty ramp in one table](<decisions/Put the whole difficulty ramp in one table.md>).
- **Keep deals fresh.** A row constrains kind, subject, size, and forgiveness but
  does not fix the cast or tray order.
- **Name the subject explicitly.** Level identity is kind, subject, and size;
  the level tests reject duplicate identities. See
  [A level names what it is made of](<decisions/A level names what it is made of.md>).
- **Themes narrow a deal without making the game fragile.** If an eligible cast
  is short, the deal remains playable rather than failing to start.
- **A grown-up filter is read over the table.** It never edits the ramp, and all
  progression helpers answer about the filtered game consistently.
- **Code derives the level count and progression boundaries from the table.**
  Do not copy them into docs or downstream constants.

## Shape pictures

The shape-picture kind builds one recognizable scene from whole geometric
parts described in `src/scenes.ts`.

- The catalogue is geometry, not authored SVG.
- A level names the scene it wants; missing or inconsistent data is an error, not
  a reason to choose another scene.
- The finished scene is one target even though several pieces build it.
- Parts do not overlap unless the scene explicitly permits layering. A layered
  picture keeps the shared area small and reads correctly whichever piece lands
  last.
- Congruent, identically painted parts are interchangeable. A visibly correct
  placement must never be refused because the deal assigned a twin elsewhere.
  See
  [Two shapes the same are the same piece](<decisions/Two shapes the same are the same piece.md>).
- Every free congruent destination is offered to the idle hint.

### Adding a shape picture

1. Add the scene to the canonical catalogue in `src/scenes.ts`.
2. Render it and judge whether the whole picture and every part read clearly.
3. Ensure congruent parts are painted identically and spaced so a drop on one
   valid place cannot be mistaken for another.
4. Name the scene in the appropriate level-table row.
5. Run the focused scene, level, and layout tests, then the full verification.

## Kind registry

The registry in `src/kinds/registry.ts` is strict: a known and loaded kind
resolves; a missing implementation or unavailable chunk is an error. There is
no gameplay stand-in.

Deferred kinds are warmed during play so lookup remains synchronous at the
level seam. Failed dynamic imports are not retried in a loop; browser module
loading does not make that a meaningful recovery strategy.

### Adding a kind

1. Implement the `PuzzleKind` contract in its own module.
2. Add its loader to the strict registry.
3. Add its id to the canonical ordered kind list in `src/levels.ts`.
4. Add level-table rows that exercise it.
5. Confirm warming reaches it before progression does.
6. Run kind, level, layout, audio, grown-up-control, browser, and full repository
   checks through their existing entry points.

The grown-up switch list, audio mapping, deferred loading, and coverage checks
derive from the canonical kind list. Do not maintain their current inventory in
this guide.
