# Layout and the board

Puzzle behavior belongs in [`puzzle-kinds.md`](puzzle-kinds.md). This guide owns
how pieces and targets are measured and composed on the available screen.

## Compose, do not tabulate

`src/layout.ts` and `src/fit.ts` compose a board from the actual dealt pieces.
There is no table of per-level coordinates.

- Search possible scene and tray arrangements for the largest legal piece size.
- Reserve room for every invariant before choosing that size: target reach,
  ground lines, tray separation, controls, and minimum grabbability.
- Use each dealt piece's own bounds and anchor. Different casts may need
  different row depth even when the level-table row is the same.
- Refuse an impossible board rather than silently shrinking pieces below their
  floor. Reject provably impossible candidates before expensive search. See
  [Refuse an impossible board before searching](<decisions/Refuse an impossible board before searching.md>).
- Build the layout when the stage starts, after the cast and viewport are known.
  See
  [Compose layouts for any cast, rather than tabulating them](<decisions/Compose layouts for any cast, rather than tabulating them.md>).

The layout tests own the current promises and measured floors. Change those
promises only when a named product invariant justifies the cost.

## Tray placement

The tray can use shelves along the upper edge or balanced gutters at the sides.
The choice follows one forgiving rule:

- prefer the upper tray because downward dragging is easiest;
- use side gutters only when they clearly buy a larger puzzle or materially more
  play room without making pieces smaller;
- reserve control clearance before accepting a gutter arrangement.

See
[Put the tray where the play area is biggest](<decisions/Put the tray where the play area is biggest.md>).

A tray cell belongs to a piece, not to a reusable position. It is cut from that
piece's measured grip box so two waiting grab areas cannot overlap. Each kind
shuffles its dealt pieces before layout; the host does not shuffle tray slots.

## Picture boards

Kinds that rebuild one authored picture use a tray-first composition:

- plan the waiting pieces, then give the remaining board to the picture;
- omit decorative landscape behind a picture that is already a scene;
- allow a waiting piece to render smaller than its landing size only within the
  checked floor;
- scale around the center of what the piece draws, not the corner of the whole
  picture box;
- pad the tray from waiting artwork rather than from the assembled-picture slot.

See
[Let a picture take the whole board](<decisions/Let a picture take the whole board.md>).

## One measured box

Every piece has authored bounds, drawn ink, a grip box, and a forgiving reach.
Use the helpers in `src/piece.ts` and `src/layout.ts`; do not substitute the
square slot size.

- Scale by the piece's own proportions.
- Pack the tray from what the piece draws.
- Expand a narrow drawing into a usable grip box without moving its center.
- Clamp a dragged piece to the canvas by that same box.
- Judge a drop by whether the forgiving box covers the center of a valid place.

A kind names valid places and nothing about placement geometry. See
[One box measures a piece, and one rule places it](<decisions/One box measures a piece, and one rule places it.md>)
and
[Keep snapping generous and owned](<decisions/Keep snapping generous and owned.md>).

## Use the whole viewport

`viewFor` derives the logical canvas from the current container. The shorter
screen dimension sets physical scale; the longer dimension receives whatever
logical room its aspect ratio requires.

- Do not letterbox or choose among a fixed set of device canvases.
- Bound size constants against the nominal board span so extreme width does not
  make pieces or effects enormous.
- Use the real width for positions that should spread across the full device.
- Recompose when the viewport changes, preserving puzzle progress.
- Delay a rebuild while a piece is held so rotation or browser chrome cannot
  take it out of the child's hand.

See
[The board is composed for the screen it is on](<decisions/The board is composed for the screen it is on.md>).

## Backdrops

A themed level receives the matching generated backdrop from `src/scenery.ts`.
Themes control palette and environmental props, not furniture or interaction.

- Never draw an animal into a backdrop.
- Keep contrast between the ground and the pieces that stand on it.
- Keep decorative props away from the target area.
- Keep tray, controls, indicators, and holes visually consistent across themes.
- A missing themed backdrop is an error, not a reason to fall back silently.
- Picture-rebuilding kinds use their own neutral picture backdrop.

Background changes are art changes: render representative orientations and look
at them. See
[A background belongs to the theme](<decisions/A background belongs to the theme.md>).

## Changing layout safely

1. Identify the shared invariant or composition rule that owns the change.
2. Tune canonical composition values or search logic, never one output
   coordinate.
3. Exercise varied piece proportions, casts, viewport shapes, and relevant
   puzzle kinds through the property tests.
4. Inspect representative rendered boards in both orientations.
5. Run the full verification.
