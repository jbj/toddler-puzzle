/**
 * Stages and layouts.
 *
 * The game is three stages long - three pieces, then four, then six - so a
 * toddler starts with an easy win and the board fills up as they go. Each stage
 * has its own layout in each orientation, because the puzzle reflows rather than
 * just shrinking: a landscape screen gets rows of pieces with the tray
 * underneath, a portrait screen gets narrower rows and a taller tray.
 * Letterboxing a landscape canvas into a phone held upright would leave the
 * pieces far too small to grab.
 *
 * Nothing here is placed by hand. A layout is composed for whatever cast it is
 * given: the pieces are split into rows of ground and rows of tray, the biggest
 * slot that leaves room for both is chosen, and the ground lines are then set
 * from how far the dealt pieces actually reach above and below their own
 * anchors. That last part is why layouts are built when a puzzle starts rather
 * than up front - the cast is random, and a giraffe stands taller in its box
 * than a turtle does.
 *
 * Composing rather than tabulating is what keeps the invariants true instead of
 * merely tested: a hole cannot land off canvas or under the tray, two snap zones
 * cannot overlap, and two tray slots cannot collide, because the composition
 * leaves room for each of those before it picks a size. The tests say so for
 * every piece count and a spread of random casts.
 *
 * All values are in logical canvas units; geometry.ts maps them to pixels.
 */
import { fitScale, scaleSize, shuffle, type Point, type Size } from "./geometry";
import type { PieceId, PieceShape } from "./piece";

/**
 * How close a piece's centre must get to its hole's centre to snap in, as a
 * fraction of the piece. Deliberately large - about two thirds of a piece -
 * because toddlers have poor fine motor control and near-misses should still
 * feel like a win.
 */
const SNAP_FRACTION = 0.68;

/**
 * While dragging, the piece is held slightly above the finger so a small hand
 * doesn't cover the very thing it's trying to place.
 */
export const FINGER_LIFT = 34;

/**
 * How far a piece's grab area reaches past its artwork, as a fraction of the
 * shorter side of the authored box. A piece is picked up anywhere inside the
 * box around its drawing, not just where a finger lands on paint, and this is
 * the margin around that drawing: enough to cover the outline's stroke, which
 * measuring the geometry leaves out, plus a little for a toddler aiming at an
 * edge. `padWithin` holds the result inside the authored box, which is what
 * keeps one piece's grab area out of the next one's.
 */
export const GRAB_PADDING = 0.04;

/**
 * How many pieces each stage holds. The cast itself is drawn at random from the
 * available shapes every time a puzzle starts, so no two runs are quite the
 * same; only the *number* of pieces is fixed, and the layout is composed around
 * whatever number that is.
 */
export const STAGE_SIZES: readonly number[] = [3, 4, 6];

export const STAGE_COUNT = STAGE_SIZES.length;

/** How many pieces stage `stage` (1-based) shows. */
export function stageSize(stage: number): number {
  const size = STAGE_SIZES[stage - 1];
  if (size === undefined) throw new Error(`No stage ${stage}.`);
  return size;
}

/**
 * Deal a stage's pieces: a random subset of the shapes on offer, in a random
 * order. Both matter - which pieces turn up keeps the puzzle fresh, and their
 * order decides which hole each one stands in, so the same piece isn't always
 * on the left.
 */
export function pickStagePieces(
  stage: number,
  shapes: readonly PieceShape[],
  random: () => number = Math.random,
): readonly PieceShape[] {
  assertUniquePieceIds(shapes, "pickStagePieces()");
  const size = stageSize(stage);
  if (size > shapes.length) {
    throw new Error(`Stage ${stage} needs ${size} pieces but only ${shapes.length} exist.`);
  }
  return shuffle(shapes, random).slice(0, size);
}

function assertUniquePieceIds(shapes: readonly PieceShape[], context: string): void {
  const seen = new Set<PieceId>();
  for (const shape of shapes) {
    if (seen.has(shape.id)) {
      throw new Error(`${context} needs unique piece ids; found duplicate "${shape.id}".`);
    }
    seen.add(shape.id);
  }
}

export interface GroundBand {
  readonly top: number;
  readonly fill: string;
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
   * How near this piece's centre must get to its target's centre to count as
   * in. `SNAP_FRACTION` of the piece's *smaller* side, so the circle is
   * generous for a big piece and correspondingly tighter for a small one, and
   * never reaches further than the piece does on its narrow axis.
   */
  readonly snapRadius: number;
}

/**
 * Fit a shape into this stage's square slot. Scaling by the longer side is what
 * keeps a piece of any proportions inside the slot the arrangement laid out, so
 * the layout invariants - holes on canvas, tray slots apart - hold whatever
 * shape turns up.
 */
function pieceBox(shape: PieceShape, slotSize: number): PieceBox {
  const scale = fitScale({ width: slotSize, height: slotSize }, shape.box);
  const size = scaleSize(shape.box, scale);
  return {
    scale,
    size,
    snapRadius: Math.round(Math.min(size.width, size.height) * SNAP_FRACTION),
  };
}

export interface Layout {
  readonly id: "landscape" | "portrait";
  /** 1-based stage this layout belongs to. */
  readonly stage: number;
  /** The stage's pieces, in layout order. */
  readonly pieces: readonly PieceShape[];
  readonly canvas: Size;
  /** The square every piece is drawn to fit inside, hole and tray slot alike. */
  readonly slotSize: number;
  /** What each of this stage's pieces measures, and how forgiving it is. */
  readonly boxes: ReadonlyMap<PieceId, PieceBox>;
  /** Top of the piece tray; scenery fills everything above it. */
  readonly trayTop: number;
  /** Where the ground starts, i.e. the horizon. */
  readonly horizon: number;
  readonly bands: readonly GroundBand[];
  /** Only the pieces of this stage have holes. */
  readonly holes: ReadonlyMap<PieceId, Point>;
  readonly traySlots: readonly Point[];
  /**
   * The lines the pieces stand on, top to bottom - one per row of the scene.
   * Every piece's anchor lands on one of these, whatever height its own anchor
   * sits at inside its box.
   */
  readonly groundLines: readonly number[];
  /** Ground lines that decorative tufts and flowers sit on. */
  readonly decorLines: readonly number[];
}

/** The hole a piece belongs in. Throws rather than silently misplacing it. */
export function holeOf(layout: Layout, piece: PieceId): Point {
  const hole = layout.holes.get(piece);
  if (!hole) {
    throw new Error(
      `Piece "${piece}" has no hole in the stage ${layout.stage} ${layout.id} layout.`,
    );
  }
  return hole;
}

/** What a piece measures here. Throws rather than guessing at a square. */
export function boxOf(layout: Layout, piece: PieceId): PieceBox {
  const box = layout.boxes.get(piece);
  if (!box) {
    throw new Error(
      `Piece "${piece}" has no box in the stage ${layout.stage} ${layout.id} layout.`,
    );
  }
  return box;
}

/** A line of pieces standing on the ground at `groundY`. */
interface SceneRow {
  readonly groundY: number;
  readonly count: number;
}

/** A row of tray slots whose boxes start at `top`. */
interface TrayRow {
  readonly top: number;
  readonly count: number;
}

interface Arrangement {
  readonly canvas: Size;
  /** The square a piece of any proportions is drawn to fit inside. */
  readonly slotSize: number;
  readonly trayTop: number;
  readonly horizon: number;
  readonly bands: readonly GroundBand[];
  readonly sceneRows: readonly SceneRow[];
  /** Space kept clear at the left and right of every scene row. */
  readonly sceneMargin: number;
  readonly trayRows: readonly TrayRow[];
  readonly trayMargin: number;
  readonly decorLines: readonly number[];
}

/** Left edges of `count` evenly spaced boxes, inset by `margin` at both ends. */
function spreadX(count: number, size: number, width: number, margin: number): number[] {
  if (count === 1) return [(width - size) / 2];
  const step = (width - 2 * margin - size) / (count - 1);
  return Array.from({ length: count }, (_, index) => margin + index * step);
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
  stage: number,
  pieces: readonly PieceShape[],
  arrangement: Arrangement,
): Layout {
  assertUniquePieceIds(pieces, `buildLayout(${JSON.stringify(id)}, ${stage}, pieces)`);
  const { canvas, slotSize, sceneRows, trayRows } = arrangement;
  if (total(sceneRows) !== pieces.length || total(trayRows) !== pieces.length) {
    throw new Error(
      `Stage ${stage} ${id} layout must hold ${pieces.length} pieces, but has ` +
        `${total(sceneRows)} holes and ${total(trayRows)} tray slots.`,
    );
  }

  const boxes = new Map<PieceId, PieceBox>(
    pieces.map((shape) => [shape.id, pieceBox(shape, slotSize)]),
  );

  const holes = new Map<PieceId, Point>();
  let next = 0;
  for (const row of sceneRows) {
    for (const x of spreadX(row.count, slotSize, canvas.width, arrangement.sceneMargin)) {
      const shape = pieces[next++] as PieceShape;
      const box = boxes.get(shape.id) as PieceBox;
      holes.set(shape.id, standing(shape, box, x, slotSize, row.groundY));
    }
  }

  // Tray slots are nominal squares rather than per-piece boxes: which piece
  // waits in which slot is shuffled when the puzzle starts, so a slot has to
  // hold whatever turns up. Every piece fits inside one by construction.
  const traySlots = trayRows.flatMap((row) =>
    spreadX(row.count, slotSize, canvas.width, arrangement.trayMargin).map((x) => ({
      x,
      y: row.top,
    })),
  );

  return {
    id,
    stage,
    pieces,
    canvas,
    slotSize,
    boxes,
    trayTop: arrangement.trayTop,
    horizon: arrangement.horizon,
    bands: arrangement.bands,
    holes,
    traySlots,
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
 * board scales together: a busier stage gets smaller pieces, and its margins,
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
   * Sky kept above the scene, as a fraction of the canvas height. A floor
   * rather than a share: an uncrowded board has height to spare and spends it
   * on sky anyway, and this is what a crowded one may not take.
   */
  skyShare: 0.15,
  /**
   * The most sky worth having, as a fraction of the canvas height. Past this a
   * taller sky is just emptiness, so the height goes under the tray line
   * instead - which is what keeps the tray a comfortable strip rather than a
   * sliver when the pieces are small.
   */
  skyMax: 0.42,
  /** The tray's nominal share of the canvas height, used to judge its shape. */
  trayShare: 0.32,
  /** Where the grass takes over, as a share of the ground below the horizon. */
  grassShare: 0.45,
  /** The largest a slot may be, as a fraction of the canvas's shorter side. */
  maxSlot: 0.3,
  /**
   * How much smaller than the biggest a composition may be and still be
   * preferred for its shape. Piece size comes first; among the splits that are
   * near enough the same size, the one that suits the canvas wins.
   */
  sizeTolerance: 0.94,
  /**
   * The smallest a slot may be, as a fraction of the canvas width. A piece
   * narrower than this is a fiddly target for a small hand, so a cast that
   * cannot be composed above it is refused rather than laid out unplayably.
   */
  minSlot: 0.105,
} as const;

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

/** One candidate: how the cast is split, and how big that lets a slot be. */
interface Plan {
  readonly sceneCounts: readonly number[];
  readonly trayCounts: readonly number[];
  /** Per scene row, the worst reach above and below its ground line, at slot size 1. */
  readonly rises: readonly number[];
  readonly drops: readonly number[];
  readonly slotSize: number;
}

/** The widest slot `count` of them fit across the canvas side by side. */
function widthLimit(width: number, count: number): number {
  const { sideMargin, columnGap } = COMPOSITION;
  return width / (count + (count - 1) * columnGap + 2 * sideMargin);
}

function planFor(
  view: View,
  pieces: readonly PieceShape[],
  sceneRowCount: number,
  trayRowCount: number,
): Plan {
  const sceneCounts = splitRows(pieces.length, sceneRowCount);
  const trayCounts = splitRows(pieces.length, trayRowCount);

  const rises: number[] = [];
  const drops: number[] = [];
  let taken = 0;
  for (const count of sceneCounts) {
    const reaches = pieces.slice(taken, taken + count).map(reach);
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
  const trayHeight = trayRowCount + (trayRowCount + 1) * COMPOSITION.trayPad;

  const { width, height } = view.canvas;
  const slotSize = Math.floor(
    Math.min(
      (height * (1 - COMPOSITION.skyShare)) / (sceneHeight + trayHeight),
      widthLimit(width, Math.max(...sceneCounts)),
      widthLimit(width, Math.max(...trayCounts)),
      COMPOSITION.maxSlot * Math.min(width, height),
    ),
  );
  return { sceneCounts, trayCounts, rises, drops, slotSize };
}

/**
 * Lay a plan out on the canvas. The tray is packed up from the bottom edge, the
 * ground bands are stacked above it, and the height left over is shared out
 * between the sky and the gaps between rows - which is what stops a two-row
 * scene from bunching up against the tray with an empty sky above it.
 */
function compose(view: View, plan: Plan): Arrangement {
  const { canvas } = view;
  const { slotSize } = plan;
  const scaled = (share: number): number => share * slotSize;

  /** How deep each row of ground has to be for the pieces dealt into it. */
  const depths = plan.rises.map((rise, index) => (rise + (plan.drops[index] as number)) * slotSize);
  const rowGap = scaled(COMPOSITION.rowGap);
  const trayRowCount = plan.trayCounts.length;

  const trayNeed = trayRowCount * slotSize + (trayRowCount + 1) * scaled(COMPOSITION.trayPad);
  const sceneNeed =
    depths.reduce((sum, depth) => sum + depth, 0) +
    (depths.length - 1) * rowGap +
    scaled(COMPOSITION.footRoom);
  const skyNeed = COMPOSITION.skyShare * canvas.height;

  // Whatever the canvas has over what the composition needs is shared out one
  // way per gap between rows and one for the sky, so a single row stands near
  // the bottom of the scene and more rows spread themselves up it. The sky
  // stops taking its share at `skyMax`; the rest falls to the tray.
  const spare = Math.max(0, canvas.height - trayNeed - sceneNeed - skyNeed) / depths.length;
  const sky = Math.min(skyNeed + spare, COMPOSITION.skyMax * canvas.height);
  const trayDepth = canvas.height - sky - sceneNeed - (depths.length - 1) * spare;
  const trayTop = Math.round(canvas.height - trayDepth);
  const trayPad = (trayDepth - trayRowCount * slotSize) / (trayRowCount + 1);
  const trayRows = plan.trayCounts.map((count, index) => ({
    top: Math.round(trayTop + trayPad + index * (slotSize + trayPad)),
    count,
  }));

  const sceneRows: SceneRow[] = [];
  let top = sky;
  for (const [index, depth] of depths.entries()) {
    sceneRows.push({
      groundY: Math.round(top + (plan.rises[index] as number) * slotSize),
      count: plan.sceneCounts[index] as number,
    });
    top += depth + rowGap + spare;
  }

  // The horizon is a constant of the orientation until a crowded board pushes
  // the first row up to meet it. An animal may stand against the sky; none may
  // stand on it.
  const horizon = Math.max(
    0,
    Math.round(
      Math.min(
        view.horizonShare * canvas.height,
        (sceneRows[0] as SceneRow).groundY - scaled(COMPOSITION.horizonClearance),
      ),
    ),
  );
  const margin = Math.round(scaled(COMPOSITION.sideMargin));

  return {
    canvas,
    slotSize,
    trayTop,
    horizon,
    bands: [
      { top: horizon, fill: "#8ed76f" },
      {
        top: Math.round(horizon + COMPOSITION.grassShare * (trayTop - horizon)),
        fill: "url(#grass)",
      },
    ],
    sceneRows,
    sceneMargin: margin,
    trayRows,
    trayMargin: margin,
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

/**
 * Compose an arrangement for this cast. Every way of splitting it into rows of
 * ground and rows of tray is costed, and the pieces are made as big as the
 * canvas allows; where two splits come out much the same size, the one whose
 * shape suits the canvas wins. Which split that is is therefore worked out
 * rather than declared - a wide canvas spends its width on one long row, an
 * upright one stacks shallower rows and gives the tray the height it saves.
 */
function arrange(view: View, pieces: readonly PieceShape[]): Arrangement {
  const count = pieces.length;
  if (count < 1) throw new Error(`A ${view.id} layout needs at least one piece.`);

  const { width, height } = view.canvas;
  const traySpan = COMPOSITION.trayShare * height;
  const wantedSceneRows = idealRows(count, height * (1 - COMPOSITION.skyShare) - traySpan, width);
  const wantedTrayRows = idealRows(count, traySpan, width);

  const plans: Plan[] = [];
  for (let sceneRows = 1; sceneRows <= count; sceneRows++) {
    for (let trayRows = 1; trayRows <= count; trayRows++) {
      plans.push(planFor(view, pieces, sceneRows, trayRows));
    }
  }

  const smallest = COMPOSITION.minSlot * width;
  const viable = plans.filter((plan) => plan.slotSize >= smallest);
  if (viable.length === 0) {
    throw new Error(
      `${count} pieces do not fit the ${view.id} canvas without dropping below ` +
        `${Math.round(smallest)} units each, which is too small for a toddler to grab.`,
    );
  }

  const biggest = Math.max(...viable.map((plan) => plan.slotSize));
  const misshapen = (plan: Plan): number =>
    Math.abs(plan.sceneCounts.length - wantedSceneRows) +
    Math.abs(plan.trayCounts.length - wantedTrayRows);
  const best = viable
    .filter((plan) => plan.slotSize >= biggest * COMPOSITION.sizeTolerance)
    // Plans are in row order, so a tie keeps the one with fewest rows.
    .reduce((chosen, plan) =>
      misshapen(plan) < misshapen(chosen) ||
      (misshapen(plan) === misshapen(chosen) && plan.slotSize > chosen.slotSize)
        ? plan
        : chosen,
    );
  return compose(view, best);
}

/**
 * Compose one layout for one orientation around a given cast, however many
 * pieces that cast holds. Layouts are built when a puzzle starts rather than up
 * front because the cast is random and the ground lines follow it: each shape's
 * anchor sits at a different height inside its box.
 */
export function buildLayout(
  id: Layout["id"],
  stage: number,
  pieces: readonly PieceShape[],
): Layout {
  return fromArrangement(id, stage, pieces, arrange(VIEWS[id], pieces));
}

/**
 * The same, for a numbered stage of the three-stage game, where the cast has to
 * be the size that stage deals - a stage showing the wrong number of pieces is
 * a bug in the deal, not a layout to be composed around. The composition itself
 * does not care: `buildLayout` takes any count.
 */
export function buildStageLayout(
  id: Layout["id"],
  stage: number,
  pieces: readonly PieceShape[],
): Layout {
  const size = stageSize(stage);
  if (pieces.length !== size) {
    throw new Error(`Stage ${stage} deals ${size} pieces, but was given ${pieces.length}.`);
  }
  return buildLayout(id, stage, pieces);
}

/** Stages are numbered from 1; the stage after the last one is the first again. */
export function nextStage(stage: number): number {
  return (stage % STAGE_COUNT) + 1;
}

/** Portrait reflow kicks in once the viewport is taller than it is wide. */
export function chooseLayout(viewport: Size, stage: number, pieces: readonly PieceShape[]): Layout {
  return buildStageLayout(
    viewport.height > viewport.width ? "portrait" : "landscape",
    stage,
    pieces,
  );
}
