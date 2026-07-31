/**
 * Layouts, and every tunable constant behind them.
 *
 * The game is thirty levels long and the board fills up as it goes, so a layout
 * has to hold whatever the level table asks for - see `levels.ts`, which is
 * where the curve itself is tuned. Each level is composed afresh in each
 * orientation, because the puzzle reflows rather than just shrinking: a
 * landscape screen gets rows of pieces with the tray at the top, a portrait
 * screen gets narrower rows and a taller tray. Pieces start in the tray so
 * toddlers can drag them down to their holes. Letterboxing a landscape canvas
 * into a phone held upright would leave the pieces far too small to grab.
 *
 * Nothing here is placed by hand. A layout is composed for whatever cast it is
 * given: the targets are split into rows of ground and the pieces into rows of
 * tray, the biggest slot that leaves room for both is chosen, and the ground
 * lines are then set from how far the dealt targets actually reach above and
 * below their own anchors. That last part is why layouts are built when a
 * puzzle starts rather than up front - the cast is random, and a giraffe stands
 * taller in its box than a turtle does.
 *
 * Targets and pieces are usually the same shapes, one hole per piece. They part
 * company when a kind fills one target with several pieces - a sliced animal -
 * and the two are then composed from their own counts. A piece is measured for
 * the tray by its *own box* rather than by the box it carries (`gripOf` in
 * `piece.ts`), so a tray of eight slices is not laid out as though it held
 * eight whole animals.
 *
 * Composing rather than tabulating is what keeps the invariants true instead of
 * merely tested: a hole cannot land off canvas or under the tray, no piece laid
 * over another's place can cover its own, and two tray slots cannot collide,
 * because the composition leaves room for each of those before it picks a size.
 * The tests say so for every piece count and a spread of random casts.
 *
 * All values are in logical canvas units; geometry.ts maps them to pixels.
 */
import {
  boxCenter,
  covers,
  fitScale,
  growAboutCentre,
  rectAt,
  scaleRect,
  scaleSize,
  type Point,
  type Rect,
  type Size,
} from "./geometry";
import { isVouchedLevel, type LevelSpec, type PuzzleKindId } from "./levels";
import { assertUniquePieceIds, gripOf, inkOf, type PieceId, type PieceShape } from "./piece";

/**
 * While dragging, the piece is held slightly above the finger so a small hand
 * doesn't cover the very thing it's trying to place.
 */
export const FINGER_LIFT = 34;

export interface GroundBand {
  readonly top: number;
  readonly fill: string;
}

/**
 * A shelf the waiting pieces stand on. `lip` is the edge that faces the scene -
 * the one that gets the darker line, so the tray reads as a surface a piece is
 * lifted off rather than a rectangle of a different colour.
 */
export interface TrayBand {
  readonly rect: Rect;
  readonly lip: "bottom" | "left" | "right";
}

/**
 * What one piece measures in this layout: how far its authored box is scaled,
 * the bounds that produces, and how forgiving a drop of it is. Every piece gets
 * its own, because a wide piece, a thin one and a tall one share nothing but
 * the slot they are drawn to fit inside.
 */
export interface PieceBox {
  /** Authored box units -> logical units. */
  readonly scale: number;
  /** The piece's rendered bounds, as a piece and as its hole alike. */
  readonly size: Size;
  /**
   * Where inside that box the piece actually draws, in logical units relative
   * to the box's top-left. The whole box for a piece that fills it; a small
   * corner of it for a slice cut out of a bigger drawing. This is what the
   * sparkle lands on and what the size checks measure.
   */
  readonly ink: Rect;
  /**
   * The piece's own box: its drawing, given a margin and thickened so neither
   * side is less than half the other (`gripOf` in `piece.ts`), in logical units
   * relative to the box's top-left. What a hand reaches for, what holds the
   * piece on canvas, and what the tray cuts a cell for.
   */
  readonly grip: Rect;
  /**
   * The same box at this level's `snapForgiveness`, grown about its own centre.
   * A drop is on target when this, put where the finger let go, covers the
   * centre of where the piece belongs - see `onTarget`. Identical to `grip` on
   * a level of forgiveness 1, which is where the ramp ends up.
   */
  readonly reach: Rect;
}

/**
 * Fit a shape into this level's square slot. Scaling by the longer side is what
 * keeps a piece of any proportions inside the slot the arrangement laid out, so
 * the layout invariants - holes on canvas, tray slots apart - hold whatever
 * shape turns up.
 *
 * `forgiveness` is the level's own multiplier on how far a drop may be out. It
 * is never below 1, so the box rule is the floor everywhere and an early level
 * is only ever kinder than that.
 */
function pieceBox(shape: PieceShape, slotSize: number, forgiveness: number): PieceBox {
  const scale = fitScale({ width: slotSize, height: slotSize }, shape.box);
  const size = scaleSize(shape.box, scale);
  const grip = scaleRect(gripOf(shape), scale);
  return {
    scale,
    size,
    ink: scaleRect(inkOf(shape), scale),
    grip,
    reach: growAboutCentre(grip, forgiveness),
  };
}

/**
 * The one rule every dragged kind places a drop by: is the piece's box, put
 * where the finger let go, over the middle of where the piece belongs?
 *
 * `at` and `home` are both top-lefts of the piece's authored box - what
 * `PuzzleKind.accepts` is handed and what `PuzzleKind.target` answers - so a
 * kind says where the piece goes and nothing about geometry. Because the box is
 * always centred on what the piece draws, this asks the same question of an
 * animal, a slice, a shard and a triangle: cover the middle of your place and
 * you are in.
 */
export function onTarget(layout: Layout, piece: PieceId, at: Point, home: Point): boolean {
  const { grip, reach } = boxOf(layout, piece);
  return covers(rectAt(at, reach), boxCenter({ x: home.x + grip.x, y: home.y + grip.y }, grip));
}

/** The middle of a piece's box, given the top-left the box sits at. */
export function gripCentre(layout: Layout, piece: PieceId, at: Point): Point {
  const { grip } = boxOf(layout, piece);
  return boxCenter({ x: at.x + grip.x, y: at.y + grip.y }, grip);
}

export interface Layout {
  readonly id: "landscape" | "portrait";
  /** The level this was composed for, as it is being played. */
  readonly level: LevelSpec;
  /** The level's pieces - what waits in the tray - in layout order. */
  readonly pieces: readonly PieceShape[];
  /**
   * What the pieces are aimed at: the shapes that stand in the scene, one per
   * hole, in layout order. Usually the pieces themselves; a sliced level stands
   * whole animals here and aims several slices at each of them.
   */
  readonly targets: readonly PieceShape[];
  readonly canvas: Size;
  /** The square every target is drawn to fit inside, and every piece with it. */
  readonly slotSize: number;
  /**
   * How big a piece is drawn while it *waits*, as a fraction of the size it
   * lands at. One almost everywhere: a piece is normally the size of the hole
   * it drops into, which is how a two-year-old tells which hole that is.
   *
   * It is below one on a picture board, and only there. The pieces of a cut-up
   * picture tile it exactly, so a tray holding all of them at the size they
   * land at needs as much room as the picture does - which is what kept the
   * picture down to about a tenth of the board. Letting a piece wait smaller
   * than it lands is what buys the picture the rest of the board, and the floor
   * under it is `COMPOSITION.minWaitingScale`. Use `waitingHome` rather than
   * this number: a piece shrinks about its own drawing's centre, so where its
   * box corner goes is not where it would go at full size.
   */
  readonly waitingScale: number;
  /** What each of this level's pieces and targets measures, and how forgiving. */
  readonly boxes: ReadonlyMap<PieceId, PieceBox>;
  /** Top of the scene; the tray occupies everything above it. */
  readonly sceneTop: number;
  /** Where the ground starts, i.e. the horizon. */
  readonly horizon: number;
  readonly bands: readonly GroundBand[];
  /** Only the targets of this level have holes, keyed by the target's id. */
  readonly holes: ReadonlyMap<PieceId, Point>;
  /**
   * Where each piece waits before it is picked up: one cell per piece, exactly
   * the size of that piece's own drawing. A tray is packed like a bookshelf
   * rather than ruled into a grid, so a narrow piece stands beside a wide one
   * instead of both being given the room the widest of them needs. Use
   * `trayHome` to place a piece in its cell.
   */
  readonly trayCells: ReadonlyMap<PieceId, Rect>;
  /**
   * The sand-coloured shelving the cells stand on, for the scenery to paint.
   * One band across the top usually; two columns down the sides when a solitary
   * picture leaves the middle of the canvas to itself.
   */
  readonly trayBands: readonly TrayBand[];
  /**
   * The part of the canvas the scene has to itself, the tray's shelving taken
   * off. What the sky is furnished within, so the sun does not rise behind a
   * column of waiting pieces.
   */
  readonly sceneBox: Rect;
  /** Where the finish button goes: the emptiest part of the board once won. */
  readonly finishCenter: Point;
  /**
   * The lines the pieces stand on, top to bottom - one per row of the scene.
   * Every target's anchor lands on one of these, whatever height its own anchor
   * sits at inside its box.
   */
  readonly groundLines: readonly number[];
  /** Ground lines that decorative tufts and flowers sit on. */
  readonly decorLines: readonly number[];
}

/**
 * The hole a target is cut for. Throws rather than silently misplacing it: a
 * piece that is not itself a target - a slice of an animal - has no hole of its
 * own, and its kind is expected to ask for the target it belongs to.
 */
export function holeOf(layout: Layout, target: PieceId): Point {
  const hole = layout.holes.get(target);
  if (!hole) {
    throw new Error(
      `Piece "${target}" has no hole in the level ${layout.level.level} ${layout.id} layout.`,
    );
  }
  return hole;
}

/** What a piece measures here. Throws rather than guessing at a square. */
export function boxOf(layout: Layout, piece: PieceId): PieceBox {
  const box = layout.boxes.get(piece);
  if (!box) {
    throw new Error(
      `Piece "${piece}" has no box in the level ${layout.level.level} ${layout.id} layout.`,
    );
  }
  return box;
}

/**
 * Where a piece waiting in the tray sits: its box top-left, placed so that its
 * *own box* is centred in the cell packed for it. Which cell that is was decided
 * when the tray was packed, from the same box, so a piece is placed rather than
 * fitted into a square somebody else's size.
 *
 * For a piece whose box fills the box it carries this is simply the cell's own
 * corner, near enough, which is what an animal has always got.
 */
export function trayHome(layout: Layout, piece: PieceId): Point {
  const cell = layout.trayCells.get(piece);
  if (!cell) {
    throw new Error(
      `Piece "${piece}" has no tray cell in the level ${layout.level.level} ${layout.id} layout.`,
    );
  }
  const { grip } = boxOf(layout, piece);
  return {
    x: cell.x + (cell.width - grip.width) / 2 - grip.x,
    y: cell.y + (cell.height - grip.height) / 2 - grip.y,
  };
}

/** A line of pieces standing on the ground at `groundY`. */
interface SceneRow {
  readonly groundY: number;
  readonly count: number;
}

/**
 * Where a waiting piece is actually drawn: the corner to translate its box to,
 * and the fraction of full size to draw it at from there.
 *
 * A piece that waits smaller than it lands shrinks **about its own drawing's
 * centre**, not about its box corner - the box of a jigsaw piece is the whole
 * picture, so shrinking about the corner would swing the drawing halfway across
 * the board. Centred on the ink, a piece grows in place when it is picked up
 * and the child's finger is still on the bit they aimed at.
 *
 * `trayHome` stays what it always was: where the piece's box goes. This is that
 * corner adjusted for the shrink, and is what the board and the hint draw with.
 */
export function waitingHome(
  layout: Layout,
  piece: PieceId,
): { readonly at: Point; readonly shrink: number } {
  const home = trayHome(layout, piece);
  const { ink } = boxOf(layout, piece);
  const shrink = layout.waitingScale;
  return {
    at: {
      x: home.x + (ink.x + ink.width / 2) * (1 - shrink),
      y: home.y + (ink.y + ink.height / 2) * (1 - shrink),
    },
    shrink,
  };
}

/**
 * What a piece draws while it waits, relative to its box corner: the same ink,
 * shrunk about its own centre. The same rectangle as `PieceBox.ink` wherever a
 * piece waits at the size it lands at, which is everywhere but a picture board.
 */
export function waitingInk(layout: Layout, piece: PieceId): Rect {
  const { ink } = boxOf(layout, piece);
  const shrink = layout.waitingScale;
  return {
    x: ink.x + (ink.width * (1 - shrink)) / 2,
    y: ink.y + (ink.height * (1 - shrink)) / 2,
    width: ink.width * shrink,
    height: ink.height * shrink,
  };
}

/** One tray cell: which piece of the cast waits there, and the room it has. */
interface TrayCell {
  readonly piece: number;
  readonly rect: Rect;
}

interface Arrangement {
  readonly canvas: Size;
  /** The square a target of any proportions is drawn to fit inside. */
  readonly slotSize: number;
  /** What a waiting piece is drawn at, as a fraction of `slotSize`. */
  readonly waitingScale: number;
  readonly sceneTop: number;
  readonly horizon: number;
  readonly bands: readonly GroundBand[];
  readonly sceneRows: readonly SceneRow[];
  /** Space kept clear at the left and right of every scene row. */
  readonly sceneMargin: number;
  readonly trayCells: readonly TrayCell[];
  readonly trayBands: readonly TrayBand[];
  readonly sceneBox: Rect;
  readonly finishCenter: Point;
  readonly decorLines: readonly number[];
}

/** Left edges of `count` evenly spaced boxes, inset by `margin` at both ends. */
function spreadX(count: number, size: number, width: number, margin: number): number[] {
  if (count === 1) return [(width - size) / 2];
  const step = (width - 2 * margin - size) / (count - 1);
  return Array.from({ length: count }, (_, index) => margin + index * step);
}

/**
 * Where a shelf's cells start, left to right. The cells differ in width, so the
 * leftovers are shared out as equal gaps rather than as an equal step: a narrow
 * piece beside a wide one gets the same air on either side of it.
 */
function spreadCells(widths: readonly number[], width: number, margin: number): number[] {
  const taken = widths.reduce((sum, one) => sum + one, 0);
  if (widths.length === 1) return [(width - taken) / 2];
  const gap = (width - 2 * margin - taken) / (widths.length - 1);
  const xs: number[] = [];
  let x = margin;
  for (const one of widths) {
    xs.push(x);
    x += one + gap;
  }
  return xs;
}

/**
 * Top-left of a piece's box: centred across the slot at `slotX`, and lifted so
 * its anchor lands on `groundY`. Centring rather than aligning the box keeps a
 * piece narrower than its slot from leaning against one side of it, and keeps
 * every hole inside a slot the arrangement already placed on canvas.
 */
function standing(
  shape: PieceShape,
  box: PieceBox,
  slotX: number,
  slotSize: number,
  groundY: number,
): Point {
  return {
    x: slotX + (slotSize - box.size.width) / 2,
    y: groundY - shape.anchor.y * box.scale,
  };
}

const total = (rows: readonly { readonly count: number }[]): number =>
  rows.reduce((sum, row) => sum + row.count, 0);

function fromArrangement(
  id: Layout["id"],
  level: LevelSpec,
  pieces: readonly PieceShape[],
  targets: readonly PieceShape[],
  arrangement: Arrangement,
): Layout {
  const where = `buildLayout(${JSON.stringify(id)}, level ${level.level}, pieces)`;
  assertUniquePieceIds(pieces, where);
  assertUniquePieceIds(targets, `${where} targets`);
  const { canvas, slotSize, sceneRows } = arrangement;
  if (total(sceneRows) !== targets.length || arrangement.trayCells.length !== pieces.length) {
    throw new Error(
      `Level ${level.level} ${id} layout must hold ${targets.length} targets and ` +
        `${pieces.length} pieces, but has ${total(sceneRows)} holes and ` +
        `${arrangement.trayCells.length} tray cells.`,
    );
  }

  // Targets and pieces share one scale, because a piece has to arrive drawn the
  // size of the hole it drops into. Where they are the same shapes - the usual
  // case - this simply measures each of them once.
  const boxes = new Map<PieceId, PieceBox>(
    [...targets, ...pieces].map((shape) => [
      shape.id,
      pieceBox(shape, slotSize, level.snapForgiveness),
    ]),
  );

  const holes = new Map<PieceId, Point>();
  let next = 0;
  for (const row of sceneRows) {
    for (const x of spreadX(row.count, slotSize, canvas.width, arrangement.sceneMargin)) {
      const shape = targets[next++] as PieceShape;
      const box = boxes.get(shape.id) as PieceBox;
      holes.set(shape.id, standing(shape, box, x, slotSize, row.groundY));
    }
  }

  // A cell is cut for the piece that waits in it rather than for the biggest
  // piece of the cast, which is what lets a narrow one stand beside a wide one.
  const trayCells = new Map<PieceId, Rect>(
    arrangement.trayCells.map((cell) => [(pieces[cell.piece] as PieceShape).id, cell.rect]),
  );

  return {
    id,
    level,
    pieces,
    targets,
    canvas,
    slotSize,
    waitingScale: arrangement.waitingScale,
    boxes,
    sceneTop: arrangement.sceneTop,
    horizon: arrangement.horizon,
    bands: arrangement.bands,
    holes,
    trayCells,
    trayBands: arrangement.trayBands,
    sceneBox: arrangement.sceneBox,
    finishCenter: arrangement.finishCenter,
    groundLines: sceneRows.map((row) => row.groundY),
    decorLines: arrangement.decorLines,
  };
}

/**
 * What one orientation offers: the canvas a puzzle is composed on, and where
 * the sky ends on it. Everything else about a layout is worked out from the
 * cast. The two canvases differ in shape rather than in size, which is what
 * lets the puzzle reflow on an upright phone instead of letterboxing onto it.
 */
interface View {
  readonly id: Layout["id"];
  readonly canvas: Size;
  /** Where the horizon sits, as a fraction of the canvas height. */
  readonly horizonShare: number;
}

const VIEWS: Record<Layout["id"], View> = {
  landscape: { id: "landscape", canvas: { width: 1000, height: 700 }, horizonShare: 0.457 },
  portrait: { id: "portrait", canvas: { width: 700, height: 1180 }, horizonShare: 0.254 },
};

/**
 * The composition, as fractions rather than as a table of coordinates. Each of
 * these is a share of the slot size unless it says otherwise, so the whole
 * board scales together: a busier level gets smaller pieces, and its margins,
 * gaps and tufts shrink with them instead of crowding the pieces out.
 *
 * The gaps are not decoration. `columnGap` and `rowGap` are what hold two snap
 * zones apart and `footRoom` is what keeps a hole clear of the tray, so these
 * are the numbers to argue with rather than the coordinates that come out of
 * them.
 */
const COMPOSITION = {
  /** Kept clear at each end of a row. */
  sideMargin: 0.2,
  /** Kept between neighbouring slots in a row. */
  columnGap: 0.12,
  /** Kept between one row's ground band and the next. */
  rowGap: 0.3,
  /** Kept below the lowest piece of the scene, where the tufts grow. */
  footRoom: 0.28,
  /** Kept around and between the tray's rows. */
  trayPad: 0.08,
  /** How far below its ground line a row's tufts and flowers sit. */
  decorDrop: 0.18,
  /**
   * How far above the first ground line the horizon has to stay. Enough green
   * above the line that the pieces standing on it read as standing on a hill
   * rather than floating in the sky.
   */
  horizonClearance: 0.5,
  /**
   * Sky between the tray and the scene, as a fraction of the canvas height. A
   * floor rather than a share: an uncrowded board has height to spare and
   * spends it on sky anyway, and this is what a crowded one may not take.
   */
  skyShare: 0.15,
  /**
   * The most sky worth having, as a fraction of the canvas height. Past this
   * extra height goes to the row gaps rather than a larger sky gap.
   */
  skyMax: 0.42,
  /** The tray's nominal share of the canvas height, used to judge its shape. */
  trayShare: 0.32,
  /** Where the grass takes over, as a share of the ground below the horizon. */
  grassShare: 0.45,
  /**
   * The largest a piece may *draw*, as a fraction of the canvas's shorter side.
   *
   * The cap is on the drawing rather than on the slot, and the two are only the
   * same thing for a cast that fills its boxes. A slice keeps its whole
   * animal's box but draws a corner of it, so capping its slot would cap the
   * animal it is a quarter of and hand the child a quarter of that - which is
   * how a four-slice level ends up as four crumbs under an acre of empty sky.
   * Divided by what the cast actually draws, the same rule gives a sliced level
   * a much bigger animal, which is exactly what it needs: a slice has to stay
   * grabbable, and there is room for it when there are one or two animals on
   * the board instead of six.
   *
   * The divisor is never above 1 - ink cannot leave the box it is measured in -
   * so this only ever raises the ceiling, and for every animal in the game, all
   * of which fill their boxes, it raises it by nothing at all.
   */
  maxSlot: 0.3,
  /**
   * How much smaller than the biggest a composition may be and still be
   * preferred for its shape. Piece size comes first; among the splits that are
   * near enough the same size, the one that suits the canvas wins.
   */
  sizeTolerance: 0.94,
  /**
   * How much bigger a tray down the gutters has to make the picture before it
   * is used instead of a band across the top. A board with the pieces stacked
   * either side of the picture looks deliberate when it buys a tenth again and
   * looks like a mistake when it buys a fiftieth, so the bar is set where the
   * gain is plain to see.
   */
  gutterGain: 1.1,
  /**
   * How much room a tray down the gutters leaves at the bottom of its columns,
   * in canvas units rather than a share of the height. The reset button stands
   * 90 units tall in the bottom left corner and the grown-ups button about 60
   * in the bottom right, both of them inside a gutter; a piece a child cannot
   * reach for without pressing one of them is worse than a slightly smaller
   * piece. Not a share, because what it is protecting is not one either.
   */
  controlRoom: 96,
  /**
   * The smallest a slot may be, as a fraction of the canvas width. A piece
   * narrower than this is a fiddly target for a small hand, so a cast that
   * cannot be composed above it is refused rather than laid out unplayably.
   */
  minSlot: 0.105,
  /**
   * The smallest a *piece* may draw, on its longer side, as a fraction of the
   * canvas width. The same rule as `minSlot` for anything that fills its box,
   * and the one that bites for a slice: a slice keeps its animal's box, so its
   * slot says nothing about how much of it there is to grab. Below `minSlot`
   * because a quarter of an animal is inevitably smaller than a whole one, and
   * the recipes already refuse a slice too thin to pick up.
   *
   * It had to come down from 0.085 for level 27, the busiest board in the
   * table: eight slices of two animals, whose worst cast in landscape - a
   * butterfly beside a pig - draws 0.0705. Every other sliced level clears
   * 0.08, so this is the floor for one level rather than for the chapter, and
   * it is set below the measured worst rather than on top of it, so that
   * redrawing an animal a little thinner does not make a level refuse to
   * start. That refusal is the thing to avoid: it is a child looking at a
   * puzzle that will not open.
   *
   * Do not lower it to fit a board. It was lowered once, to 0.06, when the real
   * problem was `maxSlot` capping a sliced animal by a box its slices do not
   * fill; with that fixed the slices are half as big again and this went most
   * of the way back up. A board that fails here is a board to make roomier.
   */
  minPieceInk: 0.065,
  /**
   * The smallest a piece may be drawn while it waits, as a fraction of the size
   * it lands at - on each axis, so two thirds here is four ninths of the area.
   *
   * It applies to a picture board and nowhere else, and it is the price of one.
   * The pieces of a cut-up picture tile it exactly, so a tray that holds them
   * all at the size they land at needs the picture's own area over again, and
   * the picture is squeezed into a third of the board at best. Two thirds is
   * as far as that trade goes: below it a piece stops reading as the thing that
   * fits the shape it is next to, which is the whole skill the game is built
   * on. See
   * [decision 20260730T230000](../docs/decisions/20260730T230000-a-picture-takes-the-board.md).
   */
  minWaitingScale: 2 / 3,
  /**
   * How much of the canvas's shorter side a picture board keeps clear around
   * the picture, on every side.
   *
   * Small, and not nothing. A picture is drawn to the room it is given, and a
   * room measured to the canvas edge puts the picture's own border half over
   * the tray's lip at the top and hard against the bottom of the screen, which
   * reads as tucked under the shelf rather than as standing on the board. This
   * costs about three per cent of the picture and is the difference between a
   * board that fills and a board that overflows.
   */
  pictureMargin: 0.022,
  /**
   * What a picture board's tray keeps clear between a waiting piece and the
   * edge of the sand it stands on, as a share of the largest drawing waiting
   * there.
   *
   * A share of the *piece* rather than of the slot, and that is the whole
   * point. Everywhere else a slot is about the size of the piece standing in
   * it, so `sideMargin` and `trayPad` are measured against the thing they are
   * holding apart. On a picture board the slot is the whole picture and a
   * waiting piece is a fraction of it, so the same numbers put a third of a
   * picture's width of sand around a single shard - a tray half again as wide
   * as it needs to be to hold anything, and every unit of it taken off the
   * picture. Measured against the piece, the tray is as big as what stands in
   * it and the rest goes back to the board.
   */
  trayEdge: 0.13,
  /**
   * What a picture board's tray keeps between one waiting piece and the next,
   * as a share of the largest drawing waiting there. Wider than `trayEdge`,
   * because two pieces side by side have to read as two things to pick up
   * rather than as one shape with a crack in it.
   */
  trayGap: 0.2,
} as const;

/**
 * What a tray keeps clear around and between the pieces waiting in it, in slot
 * units.
 *
 * A record rather than four reads of `COMPOSITION` because a picture board
 * measures them against something else; see `pictureTrayPad`.
 */
interface TrayPad {
  /** Kept between a waiting piece and each end of the sand it stands on. */
  readonly margin: number;
  /** Kept between neighbouring pieces along a shelf. */
  readonly gap: number;
  /** Kept above, below and between the shelves of a band. */
  readonly pad: number;
  /** Kept between a gutter's column and the scene beside it. */
  readonly inside: number;
}

/**
 * What a tray keeps clear on an ordinary board: shares of the slot, like every
 * other gap in the composition, because there a slot is about the size of the
 * piece standing in it.
 */
const SLOT_TRAY: TrayPad = {
  margin: COMPOSITION.sideMargin,
  gap: COMPOSITION.columnGap,
  pad: COMPOSITION.trayPad,
  // Half a column gap, so two gutters put a whole one between the pieces and
  // the scene, the same as two neighbours in a row put between themselves.
  inside: COMPOSITION.columnGap / 2,
};

/** `count` pieces over `rows` rows, as evenly as possible, fullest row first. */
function splitRows(count: number, rows: number): number[] {
  const base = Math.floor(count / rows);
  const spare = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < spare ? 1 : 0));
}

/**
 * How far a piece reaches above and below its own anchor, at slot size 1. A row
 * is given room for the worst reach in each direction among the pieces dealt
 * into it, which is what stands all of them on one line without any of them
 * poking into the row above or the tray below.
 */
function reach(shape: PieceShape): { readonly rise: number; readonly drop: number } {
  const scale = fitScale({ width: 1, height: 1 }, shape.box);
  const rise = shape.anchor.y * scale;
  return { rise, drop: shape.box.height * scale - rise };
}

/** One shelf of the tray: which pieces stand in it, and what it costs. */
interface Shelf {
  /** Indices into the cast, left to right. */
  readonly pieces: readonly number[];
  /** What it takes across the canvas, in slot units, margins and gaps counted. */
  readonly span: number;
  /** How tall it is: the tallest drawing standing in it, in slot units. */
  readonly height: number;
}

/** One column of the tray: pieces stacked in a gutter beside a lone target. */
interface Column {
  /** Indices into the cast, top to bottom. */
  readonly pieces: readonly number[];
  /** The widest drawing standing in it, in slot units. */
  readonly width: number;
  /** What it takes down the canvas, in slot units, padding counted. */
  readonly depth: number;
}

/**
 * Where the pieces wait. A tray is a band of shelves across the top of the
 * board; where the scene is a single picture, which leaves most of the canvas
 * empty on either side of it, it can instead be two columns down the gutters.
 */
type TrayPlan =
  | { readonly shape: "shelves"; readonly shelves: readonly Shelf[] }
  | { readonly shape: "gutters"; readonly columns: readonly Column[] };

/** One candidate: how the cast is split, and how big that lets a slot be. */
interface Plan {
  readonly sceneCounts: readonly number[];
  readonly tray: TrayPlan;
  /** What each piece of the cast takes up in the tray, in slot units, in cast order. */
  readonly grips: readonly Size[];
  /** Per scene row, the worst reach above and below its ground line, at slot size 1. */
  readonly rises: readonly number[];
  readonly drops: readonly number[];
  readonly slotSize: number;
  /** The largest drawing in the cast, on its longer side, in slot units. */
  readonly largest: number;
  /**
   * How much of a slot the *smallest* piece of the cast draws on its longer
   * side. One for a cast that fills its boxes; a fraction for a cast of slices,
   * which is what keeps them from being composed too small to grab.
   */
  readonly smallest: number;
}

/**
 * What each piece takes up, in slot units, measured by `pick`. A piece is
 * scaled by the longer side of its authored box, so this is a constant of the
 * cast rather than of the size it ends up at: a piece that occupies a corner of
 * a big box - a slice, a jigsaw piece - takes up the corner rather than the box.
 */
function sharesOf(pieces: readonly PieceShape[], pick: (shape: PieceShape) => Rect): Size[] {
  return pieces.map((shape) => {
    const scale = 1 / Math.max(shape.box.width, shape.box.height);
    const rect = pick(shape);
    return { width: rect.width * scale, height: rect.height * scale };
  });
}

/**
 * What the tray is packed by: each piece's own box, thickened. A cell is cut
 * for the box a hand reaches for rather than for the drawing inside it, which
 * is what keeps two neighbours in the tray from sharing a press.
 */
const gripShares = (pieces: readonly PieceShape[]): Size[] =>
  sharesOf(pieces, (shape) => gripOf(shape));

/**
 * What each piece *draws*. The size floors and the cap on how big a piece may
 * be are about what a child can see and hold, so they measure the drawing
 * rather than the margin around it.
 */
const inkShares = (pieces: readonly PieceShape[]): Size[] => sharesOf(pieces, inkOf);

/** What a row of these drawings takes across the canvas, in slot units. */
function spanOf(widths: readonly number[], pad: TrayPad = SLOT_TRAY): number {
  return (
    widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * pad.gap + 2 * pad.margin
  );
}

/**
 * Pack the cast into `rows` shelves, taking the pieces in `order` and giving
 * each to the shelf with the least on it so far.
 *
 * A tray used to be a grid: every cell the size of the biggest piece's box,
 * however little the piece standing in it drew. That is nearly free for a cast
 * of animals, which are all much of a size, and expensive for a shattered
 * picture, whose whole point is that its shards are not - so the widest shard
 * set the size of all of them and the tray filled the canvas while drawing
 * about two thirds of it. Packed as shelves the leftover goes back into the
 * slot, which is to say into the picture the child is rebuilding.
 *
 * Two orders are worth trying and both are offered to the search: widest first
 * balances the rows' widths, tallest first gathers the tall pieces into the same
 * row so the *other* rows can be shallow. Which of them wins depends on the
 * cast, so neither is chosen here.
 */
function packShelves(
  shares: readonly Size[],
  rows: number,
  order: readonly number[],
  pad: TrayPad,
): Shelf[] {
  const packed: number[][] = Array.from({ length: rows }, () => []);
  const widths: number[][] = Array.from({ length: rows }, () => []);
  for (const index of order) {
    const share = shares[index] as Size;
    let best = 0;
    for (let row = 1; row < rows; row++) {
      if (spanOf(widths[row] as number[], pad) < spanOf(widths[best] as number[], pad)) best = row;
    }
    (packed[best] as number[]).push(index);
    (widths[best] as number[]).push(share.width);
  }
  // Left to right in the order they were dealt, so the tray is not sorted by
  // size in front of the child.
  return packed.map((indices) => {
    const inOrder = [...indices].sort((a, b) => a - b);
    return {
      pieces: inOrder,
      span: spanOf(
        inOrder.map((index) => (shares[index] as Size).width),
        pad,
      ),
      height: Math.max(...inOrder.map((index) => (shares[index] as Size).height)),
    };
  });
}

const orderedBy = (shares: readonly Size[], measure: (share: Size) => number): number[] =>
  shares
    .map((_, index) => index)
    .sort((a, b) => measure(shares[b] as Size) - measure(shares[a] as Size) || a - b);

/** The two packings of this cast into `rows` shelves that are worth costing. */
function shelvings(shares: readonly Size[], rows: number, pad: TrayPad = SLOT_TRAY): Shelf[][] {
  return [
    packShelves(
      shares,
      rows,
      orderedBy(shares, (share) => share.width),
      pad,
    ),
    packShelves(
      shares,
      rows,
      orderedBy(shares, (share) => share.height),
      pad,
    ),
  ];
}

/**
 * The cast stacked into two gutters, tallest first into whichever column is
 * shorter. Only two, one either side, because the point of the arrangement is
 * that the picture keeps the middle of the board.
 */
function gutterings(shares: readonly Size[], pad: TrayPad = SLOT_TRAY): Column[] {
  const packed: number[][] = [[], []];
  const depths = [0, 0];
  for (const index of orderedBy(shares, (share) => share.height)) {
    const at = (depths[0] as number) <= (depths[1] as number) ? 0 : 1;
    (packed[at] as number[]).push(index);
    depths[at] = (depths[at] as number) + (shares[index] as Size).height;
  }
  return packed.map((indices, at) => {
    const inOrder = [...indices].sort((a, b) => a - b);
    return {
      pieces: inOrder,
      width: Math.max(...inOrder.map((index) => (shares[index] as Size).width), 0),
      depth: (depths[at] as number) + (inOrder.length + 1) * pad.pad,
    };
  });
}

function planFor(
  view: View,
  shares: readonly Size[],
  drawn: readonly Size[],
  targets: readonly PieceShape[],
  sceneRowCount: number,
  tray: TrayPlan,
): Plan {
  const sceneCounts = splitRows(targets.length, sceneRowCount);
  const drawnSides = drawn.map((share) => Math.max(share.width, share.height));

  const rises: number[] = [];
  const drops: number[] = [];
  let taken = 0;
  for (const count of sceneCounts) {
    const reaches = targets.slice(taken, taken + count).map(reach);
    taken += count;
    rises.push(Math.max(...reaches.map((one) => one.rise)));
    drops.push(Math.max(...reaches.map((one) => one.drop)));
  }

  // Every height the composition needs is a multiple of the slot size, so the
  // tallest slot that still fits is a division rather than a search.
  const sceneHeight =
    rises.reduce((sum, rise, index) => sum + rise + (drops[index] as number), 0) +
    (sceneRowCount - 1) * COMPOSITION.rowGap +
    COMPOSITION.footRoom;

  // A band of shelves is height the scene does not get; a pair of gutters is
  // width it does not get. Which of the two the canvas can better spare is the
  // whole reason both are costed.
  const trayHeight =
    tray.shape === "shelves"
      ? tray.shelves.reduce((sum, shelf) => sum + shelf.height, 0) +
        (tray.shelves.length + 1) * SLOT_TRAY.pad
      : 0;
  const sceneSpan =
    tray.shape === "shelves"
      ? spanOf(Array.from({ length: Math.max(...sceneCounts) }, () => 1))
      : spanOf([gutterWidth(tray.columns), 1, gutterWidth(tray.columns)]);
  const trayWidthSpan =
    tray.shape === "shelves" ? Math.max(...tray.shelves.map((shelf) => shelf.span)) : 0;
  const trayDepth =
    tray.shape === "gutters" ? Math.max(...tray.columns.map((column) => column.depth)) : 0;

  const { width, height } = view.canvas;
  const columnRoom = height - COMPOSITION.controlRoom;
  const largest = Math.max(...drawnSides);
  const slotSize = Math.floor(
    Math.min(
      (height * (1 - COMPOSITION.skyShare)) / (sceneHeight + trayHeight),
      width / Math.max(sceneSpan, trayWidthSpan),
      trayDepth > 0 ? columnRoom / trayDepth : Infinity,
      (COMPOSITION.maxSlot * Math.min(width, height)) / largest,
    ),
  );
  return {
    sceneCounts,
    tray,
    grips: shares,
    rises,
    drops,
    slotSize,
    largest,
    smallest: Math.min(...drawnSides),
  };
}

/** Both gutters get the width of the deeper drawing, so the picture stays centred. */
const gutterWidth = (columns: readonly Column[]): number =>
  Math.max(...columns.map((column) => column.width));

/**
 * How deep a band of shelves is at this tray slot size. The one place the
 * answer is worked out, so what a picture board plans around and what
 * `shelveTray` then lays out cannot drift apart.
 */
const shelvedDepth = (shelves: readonly Shelf[], slotSize: number, pad: TrayPad): number =>
  Math.round(
    (shelves.reduce((sum, shelf) => sum + shelf.height, 0) + (shelves.length + 1) * pad.pad) *
      slotSize,
  );

/** How far in from each side a pair of gutters reaches, at this tray slot size. */
const gutterEdge = (columns: readonly Column[], slotSize: number, pad: TrayPad): number =>
  Math.round(pad.margin * slotSize) +
  gutterWidth(columns) * slotSize +
  Math.round(pad.inside * slotSize);

interface LaidTray {
  readonly cells: readonly TrayCell[];
  readonly bands: readonly TrayBand[];
  readonly sceneTop: number;
}

/**
 * A band of shelves across the top: the arrangement every kind uses, and the
 * only one where the tray costs the scene any height.
 */
function shelveTray(
  shelves: readonly Shelf[],
  grips: readonly Size[],
  canvas: Size,
  slotSize: number,
  pad: TrayPad,
): LaidTray {
  const scaled = (share: number): number => share * slotSize;
  const margin = Math.round(pad.margin * slotSize);
  const heights = shelves.map((shelf) => scaled(shelf.height));
  const shelved = heights.reduce((sum, height) => sum + height, 0);
  const sceneTop = shelvedDepth(shelves, slotSize, pad);
  const between = (sceneTop - shelved) / (shelves.length + 1);

  const cells: TrayCell[] = [];
  let top = between;
  for (const [index, shelf] of shelves.entries()) {
    const height = heights[index] as number;
    const widths = shelf.pieces.map((piece) => scaled((grips[piece] as Size).width));
    for (const [at, x] of spreadCells(widths, canvas.width, margin).entries()) {
      cells.push({
        piece: shelf.pieces[at] as number,
        rect: { x, y: Math.round(top), width: widths[at] as number, height },
      });
    }
    top += height + between;
  }
  return {
    cells,
    bands: [{ rect: { x: 0, y: 0, width: canvas.width, height: sceneTop }, lip: "bottom" }],
    sceneTop,
  };
}

/**
 * Two columns down the sides, with the picture between them. Worth having only
 * where the scene is a single target: a picture is drawn to a square slot and
 * fills about three quarters of it, so a tray band across the top pays for the
 * picture's height twice over while the canvas either side of it stays empty.
 * Standing the pieces in that empty room gives the height back to the picture.
 */
function gutterTray(
  columns: readonly Column[],
  grips: readonly Size[],
  canvas: Size,
  slotSize: number,
  pad: TrayPad,
): LaidTray {
  const scaled = (share: number): number => share * slotSize;
  const width = scaled(gutterWidth(columns));
  const edge = gutterEdge(columns, slotSize, pad);
  // The column is centred in the sand it stands on rather than pushed against
  // the picture: the shelf is what the child reads as "these are waiting".
  const inset = (edge - width) / 2;
  const lefts = [inset, canvas.width - edge + inset];
  const room = canvas.height - COMPOSITION.controlRoom;
  const cells: TrayCell[] = [];
  for (const [side, column] of columns.entries()) {
    const heights = column.pieces.map((piece) => scaled((grips[piece] as Size).height));
    const stacked = heights.reduce((sum, height) => sum + height, 0);
    const pad = (room - stacked) / (column.pieces.length + 1);
    let top = pad;
    for (const [at, piece] of column.pieces.entries()) {
      const height = heights[at] as number;
      cells.push({
        piece,
        rect: { x: lefts[side] as number, y: Math.round(top), width, height },
      });
      top += height + pad;
    }
  }
  return {
    cells,
    bands: [
      { rect: { x: 0, y: 0, width: edge, height: canvas.height }, lip: "right" },
      {
        rect: { x: canvas.width - edge, y: 0, width: edge, height: canvas.height },
        lip: "left",
      },
    ],
    sceneTop: 0,
  };
}

/** Lay whichever tray a plan asked for, at the slot size its pieces wait at. */
function layTray(
  tray: TrayPlan,
  grips: readonly Size[],
  canvas: Size,
  slotSize: number,
  pad: TrayPad,
): LaidTray {
  return tray.shape === "shelves"
    ? shelveTray(tray.shelves, grips, canvas, slotSize, pad)
    : gutterTray(tray.columns, grips, canvas, slotSize, pad);
}

/**
 * Lay a plan out on the canvas. The tray sits at the top, the ground bands are
 * stacked below it, and the height left over is shared out between the sky gap
 * and the gaps between rows - which is what stops a two-row scene from
 * bunching up at the bottom with an empty band of sky above it.
 */
function compose(view: View, plan: Plan): Arrangement {
  const { canvas } = view;
  const { slotSize } = plan;
  const scaled = (share: number): number => share * slotSize;

  /** How deep each row of ground has to be for the pieces dealt into it. */
  const depths = plan.rises.map((rise, index) => (rise + (plan.drops[index] as number)) * slotSize);
  const rowGap = scaled(COMPOSITION.rowGap);
  const margin = Math.round(scaled(COMPOSITION.sideMargin));
  const tray = layTray(plan.tray, plan.grips, canvas, slotSize, SLOT_TRAY);
  const laid = plan.tray.shape === "shelves" ? tray : null;
  const sceneTop = tray.sceneTop;

  const sceneNeed =
    depths.reduce((sum, depth) => sum + depth, 0) +
    (depths.length - 1) * rowGap +
    scaled(COMPOSITION.footRoom);
  const skyNeed = COMPOSITION.skyShare * canvas.height;

  // Whatever the canvas has below the tray over what scene and sky need is
  // shared out: one share per row gap and one for the sky, so a single row
  // stands near the bottom and more rows spread themselves up. The sky stops
  // taking its share at `skyMax`.
  const spare = Math.max(0, canvas.height - sceneTop - sceneNeed - skyNeed) / depths.length;
  const sky = Math.min(skyNeed + spare, COMPOSITION.skyMax * canvas.height);

  const sceneRows: SceneRow[] = [];
  let top = sceneTop + sky;
  for (const [index, depth] of depths.entries()) {
    sceneRows.push({
      groundY: Math.round(top + (plan.rises[index] as number) * slotSize),
      count: plan.sceneCounts[index] as number,
    });
    top += depth + rowGap + spare;
  }

  // The horizon is a constant of the orientation until a crowded board pushes
  // the first row up to meet it. Expressed as a fraction of the scene height
  // below the tray, so it stays proportionally placed. An animal may stand
  // against the sky; none may stand on it.
  const horizon = Math.max(
    sceneTop,
    Math.round(
      Math.min(
        sceneTop + view.horizonShare * (canvas.height - sceneTop),
        (sceneRows[0] as SceneRow).groundY - scaled(COMPOSITION.horizonClearance),
      ),
    ),
  );

  const gutters = plan.tray.shape === "gutters" ? tray : null;
  if (!laid && !gutters) {
    throw new Error("A tray is either shelves or gutters; this plan was neither.");
  }

  return {
    canvas,
    slotSize,
    // Every board but a picture board draws a piece the size of the hole it
    // drops into, which is how a child tells which hole that is.
    waitingScale: 1,
    sceneTop,
    horizon,
    trayCells: tray.cells,
    trayBands: tray.bands,
    sceneBox: laid
      ? { x: 0, y: sceneTop, width: canvas.width, height: canvas.height - sceneTop }
      : {
          x: (tray.bands[0] as TrayBand).rect.width,
          y: 0,
          width: canvas.width - 2 * (tray.bands[0] as TrayBand).rect.width,
          height: canvas.height,
        },
    finishCenter: laid
      ? { x: canvas.width / 2, y: Math.round(sceneTop / 2) }
      : // No band across the top, so the button goes in the sky above the
        // picture, which is the one part of the board nothing else is using.
        { x: canvas.width / 2, y: Math.round((sceneTop + sky) / 2) },
    bands: [
      { top: horizon, fill: "#8ed76f" },
      {
        top: Math.round(horizon + COMPOSITION.grassShare * (canvas.height - horizon)),
        fill: "url(#grass)",
      },
    ],
    sceneRows,
    sceneMargin: margin,
    decorLines: sceneRows.map((row) => Math.round(row.groundY + scaled(COMPOSITION.decorDrop))),
  };
}

/**
 * How many rows suit a region: the split whose grid comes closest to the shape
 * of the region it fills, so a wide strip gets one long row and a tall one
 * stacks shallower rows. `span` is the region's nominal height.
 */
function idealRows(count: number, span: number, width: number): number {
  return Math.min(count, Math.max(1, Math.round(Math.sqrt((count * span) / width))));
}

/* ---------------------------------------------------------------------------
 * A picture board
 *
 * The kinds that cut one hand-drawn picture up and hand the child the pieces.
 * They are laid out the other way round from every other board: the tray is
 * planned first, from what a piece needs to be grabbable, and the picture then
 * takes *everything else*, aspect ratio allowing, with the light blue behind
 * showing wherever the ratio does not reach.
 *
 * The reason they cannot be composed like anything else is arithmetic. A
 * cut-up picture's pieces tile it exactly, so a tray holding all of them at the
 * size they land at needs the picture's own area over again - which capped the
 * picture at about a tenth of the board and left it standing in a landscape
 * three quarters empty. So a piece here waits smaller than it lands, and no
 * smaller than `COMPOSITION.minWaitingScale`. See
 * [decision 20260730T230000](../docs/decisions/20260730T230000-a-picture-takes-the-board.md).
 * ------------------------------------------------------------------------ */

/**
 * The kinds whose one target is a picture the board exists to show. Named here
 * rather than asked of the kind because the composition happens before any kind
 * is consulted, and because what is being said is a fact about the *board* - a
 * scene with no landscape in it - rather than about the rules of the puzzle.
 */
const BOARD_FILLING_KINDS: ReadonlySet<PuzzleKindId> = new Set<PuzzleKindId>(["jigsaw", "shatter"]);

/** Is this a level where one picture takes the whole board? */
const takesTheBoard = (level: LevelSpec, targets: readonly PieceShape[]): boolean =>
  BOARD_FILLING_KINDS.has(level.kind) && targets.length === 1;

/**
 * What a picture board's tray keeps clear, in slot units - which is to say the
 * shares above, converted by the size of the largest thing waiting in the tray.
 *
 * Measured on the largest *drawing* rather than on the largest box: the cells
 * are cut from the boxes and already hold the margin a hand needs, so pricing
 * this off them too would charge the picture for that margin twice.
 *
 * The margin is the same on both sides of a gutter's column, so the column
 * stays centred in the sand it stands on; what changes against an ordinary
 * board is that there is much less sand.
 */
const pictureTrayPad = (drawn: readonly Size[]): TrayPad => {
  const largest = Math.max(...drawn.map((ink) => Math.max(ink.width, ink.height)));
  return {
    margin: COMPOSITION.trayEdge * largest,
    gap: COMPOSITION.trayGap * largest,
    pad: COMPOSITION.trayEdge * largest,
    inside: COMPOSITION.trayEdge * largest,
  };
};

/** The slot at which a shape drawn to fit a square exactly fills `room`. */
const slotFilling = (box: Size, room: Size): number =>
  Math.max(box.width, box.height) * fitScale(room, box);

/**
 * The room a tray of this shape leaves the picture, at this tray slot size,
 * less the margin a picture keeps around itself on every side.
 */
function sceneRoom(tray: TrayPlan, canvas: Size, slotSize: number, pad: TrayPad): Rect {
  const margin = COMPOSITION.pictureMargin * Math.min(canvas.width, canvas.height);
  const taken =
    tray.shape === "shelves"
      ? { top: shelvedDepth(tray.shelves, slotSize, pad), side: 0 }
      : { top: 0, side: gutterEdge(tray.columns, slotSize, pad) };
  return {
    x: taken.side + margin,
    y: taken.top + margin,
    width: canvas.width - 2 * (taken.side + margin),
    height: canvas.height - taken.top - 2 * margin,
  };
}

/**
 * The largest a tray of this shape can be drawn before it stops fitting. Both
 * measures - a shelf's span, a column's depth - already carry the padding they
 * were packed with, so this needs no `TrayPad` of its own.
 */
function trayCeiling(tray: TrayPlan, canvas: Size): number {
  if (tray.shape === "shelves") {
    return canvas.width / Math.max(...tray.shelves.map((shelf) => shelf.span));
  }
  // A gutter is capped by its own depth rather than by the canvas: its columns
  // stop short of `controlRoom` so a piece never waits under the reset button.
  const depth = Math.max(...tray.columns.map((column) => column.depth));
  return (canvas.height - COMPOSITION.controlRoom) / depth;
}

/** One way to lay a picture board out: a tray, and the two sizes it settles. */
interface PicturePlan {
  readonly tray: TrayPlan;
  /** What each piece of the cast takes up in the tray, in slot units. */
  readonly grips: readonly Size[];
  /** What this tray keeps clear around the pieces waiting in it. */
  readonly pad: TrayPad;
  /** What the picture, and every piece standing in it, is drawn to. */
  readonly sceneSlot: number;
  /** What a piece waiting in the tray is drawn to. Never above `sceneSlot`. */
  readonly traySlot: number;
}

/**
 * The best this tray can do for the picture.
 *
 * Two things pull against each other and the answer is where they cross. A
 * bigger tray leaves the picture less room, so the size the picture *fits* into
 * falls as the tray grows; but a piece may not be drawn below two thirds of
 * what it lands at, so the size the picture is *allowed* rises with the tray.
 * Swept rather than solved, because the tray's depth is rounded and a formula
 * that agreed with `shelvedDepth` today would not have to tomorrow.
 */
function bestPicturePlan(
  tray: TrayPlan,
  grips: readonly Size[],
  canvas: Size,
  box: Size,
  pad: TrayPad,
): PicturePlan {
  let best: PicturePlan = { tray, grips, pad, sceneSlot: 0, traySlot: 0 };
  for (let traySlot = 1; traySlot <= Math.floor(trayCeiling(tray, canvas)); traySlot++) {
    const room = sceneRoom(tray, canvas, traySlot, pad);
    if (room.width <= 0 || room.height <= 0) break;
    const sceneSlot = Math.floor(
      Math.min(slotFilling(box, room), traySlot / COMPOSITION.minWaitingScale),
    );
    if (sceneSlot > best.sceneSlot) {
      // A piece never waits larger than it lands: that would be a picture
      // shrinking as it is built, which is the opposite of the promise.
      best = { tray, grips, pad, sceneSlot, traySlot: Math.min(traySlot, sceneSlot) };
    }
  }
  return best;
}

/**
 * Lay a picture board out: the tray where it was planned, and the picture
 * centred in everything that is left.
 *
 * There is no landscape and no sky here, so `bands` and `decorLines` are empty
 * and the kind paints a flat backdrop instead (`picture-pieces.ts`). What is
 * kept is the ground line: the picture stands on one, as every target in this
 * game does, which is what lets a celebration walk a parade along the bottom of
 * it without knowing what sort of board it is on.
 */
function composePicture(view: View, plan: PicturePlan, picture: PieceShape): Arrangement {
  const { canvas } = view;
  const { sceneSlot, traySlot } = plan;
  const tray = layTray(plan.tray, plan.grips, canvas, traySlot, plan.pad);
  const room = sceneRoom(plan.tray, canvas, traySlot, plan.pad);
  const drawn = scaleSize(
    picture.box,
    fitScale({ width: sceneSlot, height: sceneSlot }, picture.box),
  );
  const groundY = Math.round(room.y + (room.height + drawn.height) / 2);

  const band = tray.bands[0] as TrayBand;
  return {
    canvas,
    slotSize: sceneSlot,
    waitingScale: sceneSlot > 0 ? traySlot / sceneSlot : 1,
    sceneTop: tray.sceneTop,
    // Nothing stands on the horizon here; it is the foot of the picture, so a
    // rainbow arcs over what the child has just built rather than through it.
    horizon: groundY,
    bands: [],
    trayCells: tray.cells,
    trayBands: tray.bands,
    sceneBox: room,
    // Straight into the empty tray. Every piece is home by the time this is
    // asked for, so the shelf the child has been taking them off is the one
    // part of the board with nothing on it - and it is where they are looking.
    finishCenter:
      plan.tray.shape === "shelves"
        ? { x: canvas.width / 2, y: Math.round(tray.sceneTop / 2) }
        : { x: Math.round(band.rect.width / 2), y: Math.round(canvas.height / 2) },
    sceneRows: [{ groundY, count: 1 }],
    sceneMargin: Math.round(COMPOSITION.sideMargin * sceneSlot),
    decorLines: [],
  };
}

/**
 * Compose a board for a level whose one picture takes it over. Every tray a
 * cast of this size could be packed into is costed, and the one that leaves the
 * picture biggest wins; a tie goes to the tray whose pieces wait largest.
 */
function arrangePicture(
  view: View,
  pieces: readonly PieceShape[],
  picture: PieceShape,
): Arrangement {
  // The same two measures `arrange` takes: the box a hand reaches for, which
  // the tray cuts its cells from, and the drawing, which the floors are about.
  const shares = gripShares(pieces);
  const drawn = inkShares(pieces);
  const pad = pictureTrayPad(drawn);
  const trays: TrayPlan[] = [];
  for (let trayRows = 1; trayRows <= pieces.length; trayRows++) {
    for (const shelves of shelvings(shares, trayRows, pad)) {
      trays.push({ shape: "shelves", shelves });
    }
  }
  if (pieces.length > 1) trays.push({ shape: "gutters", columns: gutterings(shares, pad) });

  const { width } = view.canvas;
  const smallestInk = COMPOSITION.minPieceInk * width;
  // Measured on what the child sees of the piece as it waits, drawn small.
  const grabbable = (plan: PicturePlan): boolean =>
    plan.sceneSlot >= COMPOSITION.minSlot * width &&
    plan.traySlot * Math.min(...drawn.map((ink) => Math.max(ink.width, ink.height))) >= smallestInk;

  const viable = trays
    .map((tray) => bestPicturePlan(tray, shares, view.canvas, picture.box, pad))
    .filter(grabbable);
  if (viable.length === 0) {
    throw new Error(
      `${pieces.length} pieces of a picture do not fit the ${view.id} canvas at a size a ` +
        `toddler could grab.`,
    );
  }

  const best = viable.reduce((chosen, plan) =>
    plan.sceneSlot > chosen.sceneSlot ||
    (plan.sceneSlot === chosen.sceneSlot && plan.traySlot > chosen.traySlot)
      ? plan
      : chosen,
  );
  return composePicture(view, best, picture);
}

/**
 * Compose an arrangement for this cast. Every way of splitting it into rows of
 * ground and rows of tray is costed, and the pieces are made as big as the
 * canvas allows; where two splits come out much the same size, the one whose
 * shape suits the canvas wins. Which split that is is therefore worked out
 * rather than declared - a wide canvas spends its width on one long row, an
 * upright one stacks shallower rows and gives the tray the height it saves.
 *
 * `targets` is what stands in the scene and `pieces` is what waits in the tray.
 * They are usually the same shapes, one hole per piece; a sliced level has
 * fewer targets than pieces, and the two are laid out from their own counts.
 *
 * A level whose one target is a picture the board is *for* is composed the
 * other way round; see `arrangePicture`.
 */
function arrange(
  view: View,
  level: LevelSpec,
  pieces: readonly PieceShape[],
  targets: readonly PieceShape[],
): Arrangement {
  const count = pieces.length;
  if (count < 1) throw new Error(`A ${view.id} layout needs at least one piece.`);
  if (targets.length < 1) throw new Error(`A ${view.id} layout needs at least one target.`);

  if (takesTheBoard(level, targets)) {
    return arrangePicture(view, pieces, targets[0] as PieceShape);
  }

  const { width, height } = view.canvas;
  const traySpan = COMPOSITION.trayShare * height;
  const wantedSceneRows = idealRows(
    targets.length,
    height * (1 - COMPOSITION.skyShare) - traySpan,
    width,
  );
  const wantedTrayRows = idealRows(count, traySpan, width);

  // Two measures of the same cast: what a hand reaches for, which is what the
  // tray packs cells from, and what the piece draws, which is what the size
  // floors and the cap on a piece's size are about.
  const shares = gripShares(pieces);
  const drawn = inkShares(pieces);
  const plans: Plan[] = [];
  for (let sceneRows = 1; sceneRows <= targets.length; sceneRows++) {
    for (let trayRows = 1; trayRows <= count; trayRows++) {
      for (const shelves of shelvings(shares, trayRows)) {
        plans.push(planFor(view, shares, drawn, targets, sceneRows, { shape: "shelves", shelves }));
      }
    }
  }

  // Two floors, and for a cast that fills its boxes they are the same floor: a
  // slot too narrow to aim at, and a piece that draws too little of its slot to
  // pick up. A slice fails the second one long before the first.
  const smallest = COMPOSITION.minSlot * width;
  const smallestInk = COMPOSITION.minPieceInk * width;
  const grabbable = (plan: Plan): boolean =>
    plan.slotSize >= smallest && plan.slotSize * plan.smallest >= smallestInk;
  const viable = plans.filter(grabbable);
  if (viable.length === 0) {
    throw new Error(
      `${count} pieces do not fit the ${view.id} canvas without dropping below ` +
        `${Math.round(smallest)} units each, which is too small for a toddler to grab.`,
    );
  }

  const biggest = Math.max(...viable.map((plan) => plan.slotSize));
  const misshapen = (plan: Plan): number =>
    Math.abs(plan.sceneCounts.length - wantedSceneRows) +
    Math.abs(trayRowsOf(plan) - wantedTrayRows);
  const best = viable
    .filter((plan) => plan.slotSize >= biggest * COMPOSITION.sizeTolerance)
    // Plans are in row order, so a tie keeps the one with fewest rows.
    .reduce((chosen, plan) =>
      misshapen(plan) < misshapen(chosen) ||
      (misshapen(plan) === misshapen(chosen) && plan.slotSize > chosen.slotSize)
        ? plan
        : chosen,
    );

  // A tray down the gutters is unusual enough to look like a mistake if it
  // bought nothing, so it has to buy something: it stands only where the scene
  // is one target - a picture, keeping the middle of the board - and only where
  // it makes that picture markedly bigger than a band across the top would.
  if (targets.length === 1 && count > 1) {
    const gutters = planFor(view, shares, drawn, targets, 1, {
      shape: "gutters",
      columns: gutterings(shares),
    });
    if (grabbable(gutters) && gutters.slotSize >= best.slotSize * COMPOSITION.gutterGain) {
      return compose(view, gutters);
    }
  }
  return compose(view, best);
}

const trayRowsOf = (plan: Plan): number =>
  plan.tray.shape === "shelves" ? plan.tray.shelves.length : plan.tray.columns.length;

/**
 * Compose one layout for one orientation around a given cast, however many
 * pieces that cast holds. Layouts are built when a puzzle starts rather than up
 * front because the cast is random and the ground lines follow it: each shape's
 * anchor sits at a different height inside its box.
 *
 * `targets` is what stands in the scene, one hole each, and defaults to the
 * pieces themselves - which is the usual arrangement, and the only one there
 * was until slices arrived. A kind that fills one target with several pieces
 * passes its targets in; nothing else about the composition changes.
 *
 * The level is passed whole rather than by number: the composition reads its
 * `snapForgiveness`, and everything downstream - the board, the dots, an error
 * message - wants to know which level and chapter it is looking at.
 */
export function buildLayout(
  id: Layout["id"],
  level: LevelSpec,
  pieces: readonly PieceShape[],
  targets: readonly PieceShape[] = pieces,
): Layout {
  return fromArrangement(id, level, pieces, targets, arrange(VIEWS[id], level, pieces, targets));
}

/**
 * The same, for a level of the thirty, where the cast has to be the size that
 * level deals - a level showing the wrong number of pieces is a bug in the
 * deal, not a layout to be composed around. The composition itself does not
 * care: `buildLayout` takes any count.
 */
export function buildLevelLayout(
  id: Layout["id"],
  level: LevelSpec,
  pieces: readonly PieceShape[],
  targets: readonly PieceShape[] = pieces,
): Layout {
  // Levels are vouched for rather than trusted, so a spec invented out of thin
  // air cannot put a board on screen that no level in the table describes -
  // including one that borrows a real level's number and changes its numbers.
  if (!isVouchedLevel(level)) {
    throw new Error(
      `Level ${level.level} is not one of the thirty, nor derived from one; ` +
        `see LEVELS in levels.ts.`,
    );
  }
  if (pieces.length !== level.pieces) {
    throw new Error(
      `Level ${level.level} deals ${level.pieces} pieces, but was given ${pieces.length}.`,
    );
  }
  if (targets.length !== level.targets) {
    throw new Error(
      `Level ${level.level} has ${level.targets} targets, but was given ${targets.length}.`,
    );
  }
  return buildLayout(id, level, pieces, targets);
}

/** Portrait reflow kicks in once the viewport is taller than it is wide. */
export function chooseLayout(
  viewport: Size,
  level: LevelSpec,
  pieces: readonly PieceShape[],
  targets: readonly PieceShape[] = pieces,
): Layout {
  return buildLevelLayout(
    viewport.height > viewport.width ? "portrait" : "landscape",
    level,
    pieces,
    targets,
  );
}
