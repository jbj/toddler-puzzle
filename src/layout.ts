/**
 * Layouts, and every tunable constant behind them.
 *
 * The game is thirty levels long and the board fills up as it goes, so a layout
 * has to hold whatever the level table asks for - see `levels.ts`, which is
 * where the curve itself is tuned. Each level is composed afresh for the screen
 * it is on, because the puzzle reflows rather than just shrinking: a landscape
 * screen gets rows of pieces with the tray at the top, a portrait screen gets
 * narrower rows and a taller tray. Pieces start in the tray so toddlers can drag
 * them down to their holes. Letterboxing a landscape canvas into a phone held
 * upright would leave the pieces far too small to grab.
 *
 * The canvas is composed rather than chosen: its shorter side is always
 * `SHORT_SIDE` and its longer side takes whatever room the screen has, so the
 * board fills the viewport at any ratio and the generated backdrop extends to
 * meet the edges instead of a border being drawn round it. See `viewFor`.
 *
 * Nothing here is placed by hand. A layout is composed for whatever cast it is
 * given: the targets are split into rows of ground and the pieces into rows of
 * tray, the biggest slot that leaves room for both is chosen, and the ground
 * lines are then set from how far the dealt targets actually reach above and
 * below their own anchors. That last part is why layouts are built when a
 * puzzle starts rather than up front - the cast is random, and a giraffe stands
 * taller in its box than a turtle does.
 *
 * The arithmetic of that choice - how the board is divided between the tray and
 * the play area, and how big everything is drawn - lives in `fit.ts`, over
 * plain sizes and nothing else. This file measures the cast, asks for a fit, and
 * turns the answer into coordinates.
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
import {
  columnWidth,
  columnsPerSide,
  fitPicture,
  fitRows,
  sceneInset,
  sceneRoom,
  shelvedDepth,
  sideEdge,
  type Column,
  type Limits,
  type PicturePlan,
  type Reach,
  type RowsFit,
  type Shelf,
  type TrayPad,
  type TrayPlan,
} from "./fit";
import { isVouchedLevel, type LevelSpec, type PuzzleKindId } from "./levels";
import { assertUniquePieceIds, gripOf, inkOf, type PieceId, type PieceShape } from "./piece";

/**
 * While dragging, the piece is held slightly above the finger so a small hand
 * doesn't cover the very thing it's trying to place.
 */
export const FINGER_LIFT = 34;

/**
 * A stripe of ground, from `top` down to the next band or the bottom of the
 * canvas. Geometry only: what colour a band is painted belongs to the level's
 * theme, and is the backdrop's business (`scenery.ts`).
 */
export interface GroundBand {
  readonly top: number;
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
   * One band across the top usually; columns down both sides, the same number
   * each side, when standing them there leaves the scene a markedly better
   * board - which is mostly what a wide screen does.
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

/**
 * Left edges of `count` evenly spaced boxes across `room`, inset by `margin` at
 * both ends.
 *
 * Across the room the scene was given rather than across the canvas, because
 * those are the same thing only while the tray is a band at the top. Standing
 * the tray down the sides takes the canvas's edges away from the scene, and a
 * row spread over them would put its outermost holes underneath the pieces
 * waiting to fill them.
 */
function spreadX(count: number, size: number, room: Rect, margin: number): number[] {
  if (count === 1) return [room.x + (room.width - size) / 2];
  const step = (room.width - 2 * margin - size) / (count - 1);
  return Array.from({ length: count }, (_, index) => room.x + margin + index * step);
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
    for (const x of spreadX(row.count, slotSize, arrangement.sceneBox, arrangement.sceneMargin)) {
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
 * What one screen offers: the canvas a puzzle is composed on, and where the sky
 * ends on it. Everything else about a layout is worked out from the cast.
 *
 * A view is composed for the screen rather than chosen from a pair of them; see
 * `viewFor`. `REFERENCE_VIEWS` holds the two the game grew up on, which are
 * still what the tests and the measured floor tables are written against.
 */
export interface View {
  readonly id: Layout["id"];
  readonly canvas: Size;
  /** Where the horizon sits, as a fraction of the room below the tray. */
  readonly horizonShare: number;
}

/**
 * The side every canvas keeps, in logical units.
 *
 * Both of the canvases this game was built on hold their *shorter* side at 700 -
 * the landscape one is 700 tall and the portrait one 700 wide - and spend the
 * long side on whatever room the screen has. That is the whole rule, and
 * `viewFor` simply runs it continuously instead of at two points.
 *
 * It is what makes a piece the same physical size on every screen: the board
 * fills the viewport, so a logical unit is always `device short side / 700`
 * however the screen is shaped.
 */
const SHORT_SIDE = 700;

/** The shape of the canvas the game was originally drawn for, wide side up. */
const REFERENCE_RATIO = 1000 / SHORT_SIDE;

/**
 * A width to measure a *size* against.
 *
 * A dozen constants are written as a fraction of the canvas width - the piece
 * floors here, a bubble's radius, a parade animal's width. On a 3:1 board the
 * canvas is 2100 wide and every one of them triples: the floors start refusing
 * levels that compose perfectly well, and a parade animal is drawn taller than
 * the board it walks across. So a size is measured against the width, but never
 * more than a board of this height would have had at the reference shape.
 *
 * It is exactly 1000 on the landscape canvas and 700 on the portrait one, so
 * every constant that uses it keeps its value on both of them and neither board
 * changes. Positions *across* the board - where a bubble is released, how a
 * parade is spaced - go on using the real width, because those are spreads
 * rather than sizes.
 */
export const spanWidth = (canvas: Size): number =>
  Math.min(canvas.width, canvas.height * REFERENCE_RATIO);

/** Where the horizon sits on each of the two reference canvases. */
const HORIZON_SHARE = { landscape: 0.457, portrait: 0.254 } as const;

const viewOf = (canvas: Size, horizonShare: number): View => ({
  id: canvas.width >= canvas.height ? "landscape" : "portrait",
  canvas,
  horizonShare,
});

/**
 * The two canvases the game was composed on when there were only two, kept
 * because the layout tests and the measured floor tables in `puzzle.test.ts`
 * are written against them. They are members of the family below rather than
 * exceptions to it: `viewFor` returns exactly these for a 10:7 and a 7:11.8
 * screen.
 */
export const REFERENCE_VIEWS: Record<Layout["id"], View> = {
  landscape: viewOf({ width: 1000, height: 700 }, HORIZON_SHARE.landscape),
  portrait: viewOf({ width: 700, height: 1180 }, HORIZON_SHARE.portrait),
};

const aspectOf = (size: Size): number => size.width / size.height;

/**
 * Where the sky ends on a canvas of this shape.
 *
 * The horizon is the one part of the composition that cannot be worked out from
 * the cast, so it is interpolated between the two reference views by aspect
 * ratio and never extrapolated past them: anything wider than the landscape
 * canvas gets the landscape horizon, anything taller than the portrait canvas
 * gets the portrait one. Exact at both references, and on any crowded board the
 * first row of ground clamps it lower anyway (see `compose`).
 */
function horizonShareFor(canvas: Size): number {
  const wide = aspectOf(REFERENCE_VIEWS.landscape.canvas);
  const tall = aspectOf(REFERENCE_VIEWS.portrait.canvas);
  const between = Math.min(1, Math.max(0, (aspectOf(canvas) - tall) / (wide - tall)));
  return HORIZON_SHARE.portrait + between * (HORIZON_SHARE.landscape - HORIZON_SHARE.portrait);
}

/**
 * Compose a canvas for the screen the game is actually on.
 *
 * The short side is always `SHORT_SIDE`; the long side takes whatever room the
 * screen has. So the board fills the viewport at every ratio rather than
 * letterboxing into it, the generated backdrop simply extends to meet the
 * edges, and the tray stands at the edge of the screen rather than at the edge
 * of a canvas floating inside it.
 *
 * There is no clamp and no special case for a thin screen. Everything a size is
 * measured against is bounded - `spanWidth`, and `maxSlot` against the shorter
 * side - so a 3:1 screen composes by the same arithmetic as a 4:3 one; what it
 * gets is an airier board, never a smaller piece.
 */
export function viewFor(container: Size): View {
  const long = Math.max(container.width, container.height);
  const short = Math.max(1, Math.min(container.width, container.height));
  const far = Math.round(SHORT_SIDE * (long / short));
  const canvas =
    container.height > container.width
      ? { width: SHORT_SIDE, height: far }
      : { width: far, height: SHORT_SIDE };
  return viewOf(canvas, horizonShareFor(canvas));
}

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
   * docs/decisions/Let a picture take the whole board.md.
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
 * The limits the sizing search in `fit.ts` is judged against: the subset of
 * `COMPOSITION` that is about how big a thing may be rather than about where it
 * is drawn. Handed over rather than imported, so the arithmetic can be dialled
 * in a test without the game's own numbers being in the way.
 */
const LIMITS: Limits = {
  rowGap: COMPOSITION.rowGap,
  footRoom: COMPOSITION.footRoom,
  skyShare: COMPOSITION.skyShare,
  controlRoom: COMPOSITION.controlRoom,
  maxSlot: COMPOSITION.maxSlot,
  trayShare: COMPOSITION.trayShare,
  sizeTolerance: COMPOSITION.sizeTolerance,
  gutterGain: COMPOSITION.gutterGain,
  minSlot: COMPOSITION.minSlot,
  minPieceInk: COMPOSITION.minPieceInk,
  minWaitingScale: COMPOSITION.minWaitingScale,
  pictureMargin: COMPOSITION.pictureMargin,
};

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

/**
 * How far a piece reaches above and below its own anchor, at slot size 1. A row
 * is given room for the worst reach in each direction among the pieces dealt
 * into it, which is what stands all of them on one line without any of them
 * poking into the row above or the tray below.
 */
function reach(shape: PieceShape): Reach {
  const scale = fitScale({ width: 1, height: 1 }, shape.box);
  const rise = shape.anchor.y * scale;
  return { rise, drop: shape.box.height * scale - rise };
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
 * Columns down both sides, with the scene between them. Worth having where the
 * canvas has width to spare: a tray band across the top pays for the scene's
 * height while the canvas either side of it stays empty, and standing the
 * pieces in that empty room gives the height back.
 */
function gutterTray(
  columns: readonly Column[],
  grips: readonly Size[],
  canvas: Size,
  slotSize: number,
  pad: TrayPad,
): LaidTray {
  const scaled = (share: number): number => share * slotSize;
  const width = scaled(columnWidth(columns));
  // Rounded exactly as `sideEdge` rounds it, so `edge - taken` below is the two
  // margins and nothing left over.
  const gap = Math.round(scaled(pad.gap));
  const perSide = columnsPerSide(columns);
  const edge = sideEdge(columns, slotSize, pad);
  // The columns are centred in the sand they stand on rather than pushed
  // against the scene: the shelf is what the child reads as "these are
  // waiting". The left band fills outwards in, the right band inwards out, so
  // the two are mirrors of each other rather than the same band drawn twice.
  const taken = perSide * width + (perSide - 1) * gap;
  const inset = (edge - taken) / 2;
  const lefts = columns.map((_, at) =>
    at < perSide
      ? inset + at * (width + gap)
      : canvas.width - edge + inset + (at - perSide) * (width + gap),
  );
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
  return tray.place === "top"
    ? shelveTray(tray.shelves, grips, canvas, slotSize, pad)
    : gutterTray(tray.columns, grips, canvas, slotSize, pad);
}

/**
 * Lay a plan out on the canvas. The tray sits at the top, the ground bands are
 * stacked below it, and the height left over is shared out between the sky gap
 * and the gaps between rows - which is what stops a two-row scene from
 * bunching up at the bottom with an empty band of sky above it.
 */
function compose(view: View, fit: RowsFit, grips: readonly Size[]): Arrangement {
  const { canvas } = view;
  const { slotSize } = fit;
  const scaled = (share: number): number => share * slotSize;

  /** How deep each row of ground has to be for the pieces dealt into it. */
  const depths = fit.rises.map((rise, index) => (rise + (fit.drops[index] as number)) * slotSize);
  const rowGap = scaled(COMPOSITION.rowGap);
  const tray = layTray(fit.tray, grips, canvas, slotSize, SLOT_TRAY);
  const laid = fit.tray.place === "top" ? tray : null;
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
      groundY: Math.round(top + (fit.rises[index] as number) * slotSize),
      count: fit.sceneCounts[index] as number,
    });
    top += depth + rowGap + spare;
  }

  // The horizon is a constant of the canvas's shape until a crowded board pushes
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

  const gutters = fit.tray.place === "sides" ? tray : null;
  if (!laid && !gutters) {
    throw new Error("A tray is either a band or two columns; this fit was neither.");
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
      { top: horizon },
      {
        top: Math.round(horizon + COMPOSITION.grassShare * (canvas.height - horizon)),
      },
    ],
    sceneRows,
    sceneMargin: Math.round(sceneInset(fit.tray, SLOT_TRAY, COMPOSITION.sideMargin) * slotSize),
    decorLines: sceneRows.map((row) => Math.round(row.groundY + scaled(COMPOSITION.decorDrop))),
  };
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
 * docs/decisions/Let a picture take the whole board.md.
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

/** What a picture board keeps clear around the picture, on every side. */
const pictureMargin = (canvas: Size): number =>
  COMPOSITION.pictureMargin * Math.min(canvas.width, canvas.height);

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
function composePicture(
  view: View,
  plan: PicturePlan,
  grips: readonly Size[],
  pad: TrayPad,
  picture: PieceShape,
): Arrangement {
  const { canvas } = view;
  const { sceneSlot, traySlot } = plan;
  const tray = layTray(plan.tray, grips, canvas, traySlot, pad);
  const room = sceneRoom(plan.tray, canvas, traySlot, pad, pictureMargin(canvas));
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
      plan.tray.place === "top"
        ? { x: canvas.width / 2, y: Math.round(tray.sceneTop / 2) }
        : { x: Math.round(band.rect.width / 2), y: Math.round(canvas.height / 2) },
    sceneRows: [{ groundY, count: 1 }],
    sceneMargin: Math.round(COMPOSITION.sideMargin * sceneSlot),
    decorLines: [],
  };
}

/**
 * Compose a board for a level whose one picture takes it over. `fit.ts` costs
 * every tray a cast of this size could be packed into and hands back the one
 * that leaves the picture biggest; here it is turned into coordinates.
 */
function arrangePicture(
  view: View,
  pieces: readonly PieceShape[],
  picture: PieceShape,
): Arrangement {
  // The same two measures `arrange` takes: the box a hand reaches for, which
  // the tray cuts its cells from, and the drawing, which the floors are about.
  const grips = gripShares(pieces);
  const drawn = inkShares(pieces);
  const pad = pictureTrayPad(drawn);
  const plan = fitPicture(
    { canvas: view.canvas, span: spanWidth(view.canvas), box: picture.box, grips, drawn, pad },
    LIMITS,
  );
  return composePicture(view, plan, grips, pad, picture);
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

  // Two measures of the same cast: what a hand reaches for, which is what the
  // tray packs cells from, and what the piece draws, which is what the size
  // floors and the cap on a piece's size are about.
  const grips = gripShares(pieces);
  const fit = fitRows(
    {
      canvas: view.canvas,
      span: spanWidth(view.canvas),
      reaches: targets.map(reach),
      grips,
      drawn: inkShares(pieces),
      pad: SLOT_TRAY,
    },
    LIMITS,
  );
  return compose(view, fit, grips);
}

/**
 * Which canvas to compose on, given either one worked out for a screen or the
 * name of one of the two reference views. The name is a convenience for the
 * tests and for anything reasoning about "landscape" as a shape rather than as
 * a particular screen; the game itself always passes a composed view.
 */
const viewOrReference = (view: View | Layout["id"]): View =>
  typeof view === "string" ? REFERENCE_VIEWS[view] : view;

/**
 * Compose one layout for one canvas around a given cast, however many pieces
 * that cast holds. Layouts are built when a puzzle starts rather than up
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
  view: View | Layout["id"],
  level: LevelSpec,
  pieces: readonly PieceShape[],
  targets: readonly PieceShape[] = pieces,
): Layout {
  const on = viewOrReference(view);
  return fromArrangement(on.id, level, pieces, targets, arrange(on, level, pieces, targets));
}

/**
 * The same, for a level of the thirty, where the cast has to be the size that
 * level deals - a level showing the wrong number of pieces is a bug in the
 * deal, not a layout to be composed around. The composition itself does not
 * care: `buildLayout` takes any count.
 */
export function buildLevelLayout(
  view: View | Layout["id"],
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
  return buildLayout(view, level, pieces, targets);
}

/**
 * Compose a level for the box the board is drawn in, whatever shape it is.
 *
 * `container` is the box the SVG fills rather than the window: with a safe-area
 * inset the two differ, and composing for the window would letterbox the board
 * inside the very margin the inset was for.
 */
export function chooseLayout(
  container: Size,
  level: LevelSpec,
  pieces: readonly PieceShape[],
  targets: readonly PieceShape[] = pieces,
): Layout {
  return buildLevelLayout(viewFor(container), level, pieces, targets);
}
