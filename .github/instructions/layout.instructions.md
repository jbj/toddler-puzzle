---
name: "Layout and the board"
description: "How a level's layout is composed for its cast and its screen, the tray, the box a piece is measured by, and the backdrop a theme is played against."
applyTo: "src/layout.ts,src/fit.ts,src/board.ts,src/scenery.ts,src/piece.ts,src/geometry.ts"
---

# Layout and the board

What the kinds of puzzle are is
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Composing a layout

`buildLayout(id, level, pieces, targets)` takes any number of pieces and works
out how many targets stand on each ground line, how many pieces wait in each
tray row, and how big a slot they are all drawn to fit. `targets` defaults to the
pieces themselves. There is no table of coordinates and nothing to add when a
level wants a piece count nobody has asked for before.

`buildLevelLayout` is the same for a level of the thirty: it checks the cast is
the size the level deals and that the level is one the table vouches for
(`isVouchedLevel`) rather than a record written by hand, so a board's difficulty
can only come from the table. A kind needing different numbers derives them
through `derivedFrom`.

The composition is fractions of a slot rather than positions (`COMPOSITION` in
`src/layout.ts`), so the whole board scales together - a busier level gets
smaller pieces, and margins, gaps and tufts shrink with them. Five steps, the
first three of them in `src/fit.ts`, which is the search on its own over plain
sizes:

1. split the cast into scene rows and tray shelves, every way worth trying, and
   for each split find the largest slot that fits the canvas - then the same for
   gutters, one to half the cast in columns a side;
2. take the biggest of each placement, preferring the split that suits the
   canvas's shape among those within `sizeTolerance`, and refuse the cast
   outright below `minSlot` rather than laying out pieces too small to grab;
3. choose between the two placements by the rule under **The tray** below;
4. give each scene row room for the worst reach above and below the line among
   the pieces *dealt into it* (`reach()` measures from each piece's own anchor),
   so a giraffe's row is deeper than a row of turtles;
5. spend the height left on sky and the gaps between rows, then read the horizon,
   the grass band and the tray's bands off the result.

Steps 3 and 4 are why layouts are built when a puzzle starts rather than up
front. See
[Generate layouts at stage start](<../../docs/decisions/Generate layouts at stage start.md>)
and
[Compose layouts for any cast, rather than tabulating them](<../../docs/decisions/Compose layouts for any cast, rather than tabulating them.md>).

Because room is left for each invariant *before* a size is picked, the
invariants hold by construction rather than by tuning. `layout.groundLines` says
where the lines came out and `layout.trayBands` where the tray did; those are
what the tests measure against.

## The tray

**The tray is not always a band across the top.** `layout.trayBands` is a list of
rectangles, each with the edge it is lipped along, in two shapes:

- **Shelves** - rows across the top, lipped along the bottom.
- **Gutters** - columns down both sides, the same number each side so the scene
  keeps the middle, lipped along the edge facing the scene. Any level may take
  them. `COMPOSITION.controlRoom` keeps the bottom of a gutter clear of the reset
  and grown-ups buttons, in canvas units rather than as a share, because what it
  protects is not a share either. See
  [Stand a lone picture's pieces in the gutters](<../../docs/decisions/Stand a lone picture's pieces in the gutters.md>).

**The tray belongs at the top**, because down is the easiest direction for a
small arm to drag, so `takeSides` in `src/fit.ts` makes the gutters earn it: they
have to buy either `COMPOSITION.gutterGain` (a linear tenth) more slot, or - when
`maxSlot` has both placements pinned at the same size, which is most of what a
wide screen does - that tenth squared in play *area*, and never at the cost of a
smaller puzzle. More than one column a side matters for the same reason a wide
screen does: a gutter is capped by its deepest column. See
[Put the tray where the play area is biggest](<../../docs/decisions/Put the tray where the play area is biggest.md>).

**A tray cell belongs to a piece, not to a position.** `layout.trayCells` maps a
piece id to its rectangle, cut to that piece's own box rather than to the largest
box in the cast, and `trayHome(layout, piece)` centres it there. Cutting the cell
from the same box a piece is grabbed by is what keeps two waiting pieces'
grab boxes apart, so a press in the tray is never ambiguous. The consequence:
the host can no longer shuffle *slots* to deal a tray in a random order, so
**every kind must shuffle its own `pieces`**.

## A picture board

The two kinds that cut one hand-drawn picture up are composed by their own path,
`arrangePicture`, which runs the other way round: the tray is planned first and
the picture is centred in everything left, less `COMPOSITION.pictureMargin`, as
large as its aspect ratio allows.

- There is no landscape behind it - `layout.bands` and `layout.decorLines` are
  empty and the kinds paint `pictureBackdrop` rather than `renderScenery` -
  because a picture of a farmyard is already a scene.
- `PICTURE_BACKDROP` is the `--board-blue` variable the page's own background
  uses rather than a second copy of the colour, so the letterbox has no seam.
  The shot run checks the variable reaches both.
- **A piece of a picture may wait smaller than it lands**, down to
  `COMPOSITION.minWaitingScale` (2/3 per axis) and no further, which is the room
  the picture grows into. Read it through `layout.waitingScale` and place a
  waiting piece with `waitingHome(layout, piece)` rather than `trayHome`: it
  shrinks about the piece's *own drawing's* centre, because a piece of a picture
  carries the whole picture's box and shrinking about the box corner would swing
  it across the board. Everything else - the drag engine, `accepts`, `target`,
  every kind - keeps talking in full-size positions.
- **A picture board's tray is padded against the drawing, not the slot.** Every
  gap in the composition is a share of the slot, which is right where a slot is
  about the size of a piece; on a picture board the slot is the whole picture, so
  those numbers would wrap a shard in a third of a picture's width of sand. A
  picture board passes `pictureTrayPad` instead: the same `TrayPad` record,
  measured in `COMPOSITION.trayEdge` and `trayGap`, which are shares of the
  largest drawing waiting there.

A board that stops filling the room it was given without sitting on the 2/3
floor is a regression, as is a tray spending more sand on itself than the pieces
in it are worth. `tests/picture-board.test.ts` catches both. See
[Let a picture take the whole board](<../../docs/decisions/Let a picture take the whole board.md>).

## The box a piece is measured by

`slotSize` is a square; a piece need not be. Each piece gets its own `PieceBox`
(`boxOf(layout, piece)`) holding the scale from its authored box to logical
units, the bounds that produces, its `ink` (what it draws), its `grip` (the box
it is measured by) and its `reach` (that box at this level's forgiveness).

- A piece is scaled by its *longer* side, then centred across the slot, so a
  plank still fits.
- **Measure a piece with its `PieceBox`, never with `slotSize`.** Clamping a wide
  piece as though it were square would let it hang off the canvas on one axis and
  lock it out of reach on the other.
- **A tray is packed by what a piece draws.** `PieceShape.inked` is a piece's own
  bounds within its box; a piece leaving it out fills its box, as every animal
  does. A slice cannot, because it keeps the whole animal's box. `gripOf` in
  `piece.ts` turns the drawing into the piece's own box - a margin, then
  thickened - and the tray cell is cut from that, `clampGripToCanvas` holds a
  dragged piece on canvas by it, and `fitGrabBox` believes a declared `inked`
  over `getBBox`, which cannot see a clip path and would hand every slice the
  same animal-sized grab box.
- `minPieceInk` floors the drawing where `minSlot` floors the slot; for a cast
  that fills its boxes they are the same floor.
- `maxSlot` caps what a piece may **draw**, not the slot it is drawn inside.
  Capping the slot would cap a sliced level by the whole animal's box and hand
  the child a quarter of an animal under an acre of empty sky.
- `spreadX` spaces each row evenly across the room the scene was given - not the
  whole canvas, which would put a row's outermost holes under a gutter - and each
  piece's reach follows its own box,
  so a busier level gets tighter, more accurate placing rather than pieces that
  reach each other's holes.

**Placing is one box and one rule for every kind.** `onTarget(layout, piece, at,
home)` asks whether the piece's box, put where the finger let go, covers the
middle of the place the kind named. A kind says *where* a piece belongs and
nothing about geometry, so no kind can be more or less forgiving than another.
See
[One box measures a piece, and one rule places it](<../../docs/decisions/One box measures a piece, and one rule places it.md>)
and
[Keep snapping generous and owned](<../../docs/decisions/Keep snapping generous and owned.md>).
A level's `snapForgiveness` grows that box about its centre, between
`MIN_SNAP_FORGIVENESS` and `MAX_SNAP_FORGIVENESS` - a multiplier rather than a
size of its own, so no level can be less forgiving than the piece's own box.

## The shape of the board

**The canvas is composed for the screen it is drawn on.** `viewFor(container)`
keeps the canvas's *shorter* side at 700 logical units and gives the longer one
whatever the container's ratio asks for: no letterbox, the tray at the edge of
the device, scenery run out to the corners. The scale to device pixels is
`device short side / 700` at every ratio, so a piece is the same physical size
however the screen is shaped. `REFERENCE_VIEWS` keeps the two canvases the game
used to have (`1000x700`, `700x1180`) because the tests and the measured floor
tables are written against them, and the rule reproduces both exactly. See
[The board is composed for the screen it is on](<../../docs/decisions/The board is composed for the screen it is on.md>).

**A size measured across the board is measured against `spanWidth`, not
`canvas.width`.** `spanWidth(canvas)` is the width but never more than a
landscape-shaped board of this height would have had (`min(width, height*10/7)`).
A constant written as a fraction of the width - `minSlot`, `minPieceInk`, a
bubble's radius, a balloon's, a parade animal's - would otherwise treble on a 3:1
screen. Positions *across* the board - where a bubble is released, how a parade
is spaced, the cloud lanes - go on using the real width, because a spread is not
a size.

`Layout["id"]` is `"landscape"` or `"portrait"`, derived from the canvas
(`width >= height`), and the puzzle reflows between the two rather than merely
shrinking: landscape puts the animals in one row with the tray beneath, portrait
uses shallower rows and a taller tray, and a landscape board with width to spare
often takes the gutters where portrait, having none, never does. Rotating or resizing
mid-puzzle rebuilds the board and keeps progress - except while a piece is in the
air, which `game.ts` waits out rather than taking the animal out of a hand.

The background landscape is generated from the layout (`src/scenery.ts`) rather
than being a fixed-size image, so a wider board simply grows more meadow.

## The backdrop a theme is played against

A level that names a `theme` gets that theme's world rather than the meadow.
`src/scenery.ts` holds one `Backdrop` per theme - a sky wash, a far ground, a
near ground, what furnishes the air, what stands in the distance, what grows on a
ground line - and `renderScenery` looks it up from `layout.level.theme`. Nothing
above it passes a theme down.

Each themed backdrop is redrawn in code from that theme's hand-drawn scene, in
the same palette and flat-shape language: `farm` from `farmyard.svg`, `jungle`
from `jungle-path.svg`, `sea` from `rockpool.svg` read underwater. The scenes are
not inlined - a fixed-size picture with a shape in every quarter is a jigsaw's
contract, not a backdrop's.

- **No animal is ever painted into a background.** The farmyard's cow is drawn
  here as a tractor; the rockpool's crab and the jungle's bird are left out. The
  scene SVGs keep theirs, because there an animal is part of the picture being
  assembled.
- **The ground is chosen for what stands on it.** No themed ground may be darker
  than the animals on it: the jungle floor stays green because the monkey is
  brown, the seabed stays pale sand because the whale and the fish are blue.
- **Props stay near the horizon.** The middle of the board is where the holes
  are.
- **The furniture is never themed.** Tray, buttons, dots and hole treatment are
  identical in every level - a child learns them once.
- **A level with no theme is the meadow, unchanged.**

Adding a theme means adding its `Backdrop`; a theme without one fails
`tests/scenery.test.ts` rather than falling back silently. A `jigsaw` or
`shatter` level has no backdrop of any kind. Backgrounds are art, so review a
change by rendering it in both orientations and looking at it. See
[A background belongs to the theme](<../../docs/decisions/A background belongs to the theme.md>).

## Rules for changing layout

- **Tune `COMPOSITION`, not the output.** Every number in it is a fraction of a
  slot or of the canvas, and several are load-bearing: `columnGap` and `rowGap`
  hold one target's reach off another's, `footRoom` keeps a hole clear of the
  tray, `controlRoom` keeps a gutter clear of the buttons, `minSlot` keeps a
  piece grabbable. Nudging a coordinate moves a piece without moving the room
  left for it.
- **All layout tunables belong in `src/layout.ts`.**
- A piece stands on its shape's `anchor`, which for an animal comes from
  `FOOT_LEVEL` in `src/assets.ts`, which comes from `npm run art:check` output -
  never from the eye. See [`art.instructions.md`](art.instructions.md).

The layout tests are properties, not expected coordinates. Every promise in
`PROMISES` (`tests/puzzle.test.ts`) is checked against every piece count a level
could ask for, in both orientations, over random casts of animals and of pieces
of no particular shape:

- every piece has a target, a box and a tray cell;
- several pieces may share one target, and all are drawn at that target's scale;
- every piece fits the slot it was dealt into, whatever its proportions;
- targets stay on canvas and clear of the tray;
- every piece stands on one of the layout's ground lines;
- no piece laid squarely over another's place covers its own;
- tray cells stay on a tray band, never collide, never overlap another piece's
  box, and never sit where the piece waiting in them would be taken home;
- pieces stay grabbable - over a tenth of the canvas's nominal width;
- the board fills its viewport, whatever shape the viewport is.

The same promises sweep screens from 1:3 to 3:1, holding every level's piece to
within 7% of the size the two fixed canvases would have drawn it on that screen,
in device pixels - a number that may not grow. Alongside them, `how big the
board gets` holds a measured floor under all thirty levels in both orientations:
the slot as a share of the canvas (for a picture kind, the assembled picture's
own width) and the smallest piece's ink, taken as the worst of twenty-four deals
shaded down three per cent. Raising one is a good day; lowering one has to name
the invariant that bought the loss.

A layout change must leave every one of those properties standing.
