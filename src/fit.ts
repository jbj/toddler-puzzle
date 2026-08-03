/**
 * How the board is divided between the tray and the play area, and how big
 * everything is drawn.
 *
 * This is the arithmetic behind a layout, with none of the layout in it. It
 * takes sizes and gives back sizes: no `PieceShape`, no `Layout`, no SVG, and no
 * constants of its own - every limit is passed in, so a test can dial one and
 * see what moves. `layout.ts` measures the cast, calls in here for the fit, and
 * then turns the answer into coordinates.
 *
 * Two things have to be decided together, which is why they are decided here
 * rather than in two places:
 *
 *  - **How the cast is split.** The targets into rows of ground, the pieces into
 *    shelves or columns of tray. Every split is costed and the biggest slot
 *    wins; among splits that come out much the same size, the one whose shape
 *    suits the canvas wins.
 *  - **Where the tray goes.** A band across the top, or columns down both sides
 *    with the scene between them.
 *
 * There are two kinds of play area and they are not the same problem:
 *
 *  - **Rows.** Several targets, each drawn in a square slot, which the fit is
 *    free to re-split into rows. Bigger slot, bigger board.
 *  - **A picture.** One rectangle of fixed aspect ratio that takes everything
 *    the tray leaves. The tray is planned first and the picture fitted into
 *    what is left, and a waiting piece may be drawn smaller than it lands - see
 *    `fitPicture`.
 *
 * All sizes are in slot units unless they say otherwise, which is what lets the
 * whole board scale together.
 */
import { fitScale, type Rect, type Size } from "./geometry";

/**
 * What a tray keeps clear around and between the pieces waiting in it, in slot
 * units. A record rather than four numbers read from one place, because a
 * picture board measures them against the pieces instead of against the slot.
 */
export interface TrayPad {
  /** Kept between a waiting piece and each end of the sand it stands on. */
  readonly margin: number;
  /** Kept between neighbouring pieces along a shelf. */
  readonly gap: number;
  /** Kept above, below and between the shelves of a band. */
  readonly pad: number;
  /** Kept between a column of a side tray and the scene beside it. */
  readonly inside: number;
}

/** One shelf of a tray at the top: which pieces stand in it, and what it costs. */
export interface Shelf {
  /** Indices into the cast, left to right. */
  readonly pieces: readonly number[];
  /** What it takes across the canvas, in slot units, margins and gaps counted. */
  readonly span: number;
  /** How tall it is: the tallest drawing standing in it, in slot units. */
  readonly height: number;
}

/** One column of a tray down the sides: pieces stacked beside the scene. */
export interface Column {
  /** Indices into the cast, top to bottom. */
  readonly pieces: readonly number[];
  /** The widest drawing standing in it, in slot units. */
  readonly width: number;
  /** What it takes down the canvas, in slot units, padding counted. */
  readonly depth: number;
}

/**
 * Where the pieces wait: a band of shelves across the top of the board, or one
 * column down each side with the scene between them.
 */
export type TrayPlan =
  | { readonly place: "top"; readonly shelves: readonly Shelf[] }
  | { readonly place: "sides"; readonly columns: readonly Column[] };

/**
 * How far a target reaches above and below its own anchor, at slot size 1. A
 * row is given room for the worst reach in each direction among the targets
 * dealt into it, which is what stands all of them on one line without any of
 * them poking into the row above or the tray below.
 */
export interface Reach {
  readonly rise: number;
  readonly drop: number;
}

/**
 * The limits a fit is judged against. Every one of them lives in `COMPOSITION`
 * in `layout.ts`; they are passed in so that nothing here has an opinion of its
 * own about how big a piece should be.
 */
export interface Limits {
  /** Kept between one row's ground band and the next, in slot units. */
  readonly rowGap: number;
  /** Kept below the lowest piece of the scene, in slot units. */
  readonly footRoom: number;
  /** Sky between the tray and the scene, as a fraction of the canvas height. */
  readonly skyShare: number;
  /** Room left at the bottom of a side tray for the buttons, in canvas units. */
  readonly controlRoom: number;
  /** The largest a piece may draw, as a fraction of the canvas's shorter side. */
  readonly maxSlot: number;
  /** The tray's nominal share of the canvas height, used to judge its shape. */
  readonly trayShare: number;
  /** How much smaller than the biggest a split may be and still be preferred. */
  readonly sizeTolerance: number;
  /** How much a side tray has to buy the play area before it is used. */
  readonly gutterGain: number;
  /** The smallest a slot may be, as a fraction of the nominal width. */
  readonly minSlot: number;
  /** The smallest a piece may draw, as a fraction of the nominal width. */
  readonly minPieceInk: number;
  /** The smallest a piece may be drawn while it waits, as a share of landing. */
  readonly minWaitingScale: number;
  /** What a picture keeps clear around itself, as a share of the short side. */
  readonly pictureMargin: number;
}

/** `count` pieces over `rows` rows, as evenly as possible, fullest row first. */
export function splitRows(count: number, rows: number): number[] {
  const base = Math.floor(count / rows);
  const spare = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < spare ? 1 : 0));
}

/**
 * How many rows suit a region: the split whose grid comes closest to the shape
 * of the region it fills, so a wide strip gets one long row and a tall one
 * stacks shallower rows. `span` is the region's nominal height.
 */
export function idealRows(count: number, span: number, width: number): number {
  return Math.min(count, Math.max(1, Math.round(Math.sqrt((count * span) / width))));
}

/** What a row of these drawings takes across the canvas, in slot units. */
export function spanOf(widths: readonly number[], pad: TrayPad): number {
  return (
    widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * pad.gap + 2 * pad.margin
  );
}

const orderedBy = (shares: readonly Size[], measure: (share: Size) => number): number[] =>
  shares
    .map((_, index) => index)
    .sort((a, b) => measure(shares[b] as Size) - measure(shares[a] as Size) || a - b);

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

/** The two packings of this cast into `rows` shelves that are worth costing. */
export function shelvings(shares: readonly Size[], rows: number, pad: TrayPad): Shelf[][] {
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
 * The cast stacked into two columns, tallest first into whichever is shallower.
 * Only two, one either side, because the point of the arrangement is that the
 * scene keeps the middle of the board.
 */
export function columnings(shares: readonly Size[], pad: TrayPad): Column[] {
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

/** Both columns get the width of the deeper drawing, so the scene stays centred. */
export const columnWidth = (columns: readonly Column[]): number =>
  Math.max(...columns.map((column) => column.width));

/**
 * How deep a band of shelves is at this tray slot size. The one place the
 * answer is worked out, so what a picture board plans around and what the
 * layout then draws cannot drift apart.
 */
export const shelvedDepth = (shelves: readonly Shelf[], slotSize: number, pad: TrayPad): number =>
  Math.round(
    (shelves.reduce((sum, shelf) => sum + shelf.height, 0) + (shelves.length + 1) * pad.pad) *
      slotSize,
  );

/** How far in from each side a side tray reaches, at this tray slot size. */
export const sideEdge = (columns: readonly Column[], slotSize: number, pad: TrayPad): number =>
  Math.round(pad.margin * slotSize) +
  columnWidth(columns) * slotSize +
  Math.round(pad.inside * slotSize);

/** How much of the canvas, on each side, a tray of this shape takes from the scene. */
export function trayTakes(
  tray: TrayPlan,
  slotSize: number,
  pad: TrayPad,
): { readonly top: number; readonly side: number } {
  return tray.place === "top"
    ? { top: shelvedDepth(tray.shelves, slotSize, pad), side: 0 }
    : { top: 0, side: sideEdge(tray.columns, slotSize, pad) };
}

/**
 * The room a tray of this shape leaves the scene, at this tray slot size, less
 * a margin kept clear on every side.
 */
export function sceneRoom(
  tray: TrayPlan,
  canvas: Size,
  slotSize: number,
  pad: TrayPad,
  margin: number,
): Rect {
  const taken = trayTakes(tray, slotSize, pad);
  return {
    x: taken.side + margin,
    y: taken.top + margin,
    width: canvas.width - 2 * (taken.side + margin),
    height: canvas.height - taken.top - 2 * margin,
  };
}

/** One candidate: how the cast is split, and how big that lets a slot be. */
export interface Plan {
  readonly sceneCounts: readonly number[];
  readonly tray: TrayPlan;
  /** Per scene row, the worst reach above and below its ground line, at slot 1. */
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

/** What one side of a side tray takes across the canvas, in slot units. */
const perSideWidth = (tray: TrayPlan): number =>
  tray.place === "sides" ? columnWidth(tray.columns) : 0;

/**
 * Cost one split of the cast: how the targets are shared out into rows of
 * ground, how the pieces are shared out into the tray, and how big a slot the
 * canvas can then afford.
 */
export function planFor(
  canvas: Size,
  reaches: readonly Reach[],
  drawnSides: readonly number[],
  sceneRowCount: number,
  tray: TrayPlan,
  pad: TrayPad,
  limits: Limits,
): Plan {
  const sceneCounts = splitRows(reaches.length, sceneRowCount);

  const rises: number[] = [];
  const drops: number[] = [];
  let taken = 0;
  for (const count of sceneCounts) {
    const inRow = reaches.slice(taken, taken + count);
    taken += count;
    rises.push(Math.max(...inRow.map((one) => one.rise)));
    drops.push(Math.max(...inRow.map((one) => one.drop)));
  }

  // Every height the composition needs is a multiple of the slot size, so the
  // tallest slot that still fits is a division rather than a search.
  const sceneHeight =
    rises.reduce((sum, rise, index) => sum + rise + (drops[index] as number), 0) +
    (sceneRowCount - 1) * limits.rowGap +
    limits.footRoom;

  // A band of shelves is height the scene does not get; columns down the sides
  // are width it does not get. Which of the two the canvas can better spare is
  // the whole reason both are costed.
  const trayHeight =
    tray.place === "top"
      ? tray.shelves.reduce((sum, shelf) => sum + shelf.height, 0) +
        (tray.shelves.length + 1) * pad.pad
      : 0;
  const sceneSpan =
    tray.place === "top"
      ? spanOf(
          Array.from({ length: Math.max(...sceneCounts) }, () => 1),
          pad,
        )
      : spanOf([perSideWidth(tray), 1, perSideWidth(tray)], pad);
  const trayWidthSpan =
    tray.place === "top" ? Math.max(...tray.shelves.map((shelf) => shelf.span)) : 0;
  const trayDepth =
    tray.place === "sides" ? Math.max(...tray.columns.map((column) => column.depth)) : 0;

  const { width, height } = canvas;
  const columnRoom = height - limits.controlRoom;
  const largest = Math.max(...drawnSides);
  const slotSize = Math.floor(
    Math.min(
      (height * (1 - limits.skyShare)) / (sceneHeight + trayHeight),
      width / Math.max(sceneSpan, trayWidthSpan),
      trayDepth > 0 ? columnRoom / trayDepth : Infinity,
      (limits.maxSlot * Math.min(width, height)) / largest,
    ),
  );
  return {
    sceneCounts,
    tray,
    rises,
    drops,
    slotSize,
    largest,
    smallest: Math.min(...drawnSides),
  };
}

/** What a board of rows asks of the fit: the cast, measured, and the room to draw in. */
export interface RowsDemand {
  readonly canvas: Size;
  /**
   * The width a *size* is measured against - the canvas width, but never more
   * than a reference-shaped board of this height would have had. `spanWidth` in
   * `layout.ts` works it out; the floors are fractions of it.
   */
  readonly span: number;
  /** How far each target reaches above and below its anchor, at slot size 1. */
  readonly reaches: readonly Reach[];
  /** What a hand reaches for, per piece, in slot units: what the tray packs. */
  readonly grips: readonly Size[];
  /** What each piece draws, in slot units: what the floors are about. */
  readonly drawn: readonly Size[];
  readonly pad: TrayPad;
}

/** What the board came out at: how it is split, and how big a slot that allows. */
export interface RowsFit {
  readonly tray: TrayPlan;
  readonly sceneCounts: readonly number[];
  readonly rises: readonly number[];
  readonly drops: readonly number[];
  readonly slotSize: number;
}

const trayRowsOf = (plan: Plan): number =>
  plan.tray.place === "top" ? plan.tray.shelves.length : plan.tray.columns.length;

const asFit = (plan: Plan): RowsFit => ({
  tray: plan.tray,
  sceneCounts: plan.sceneCounts,
  rises: plan.rises,
  drops: plan.drops,
  slotSize: plan.slotSize,
});

/**
 * Fit a board whose play area is several targets in rows.
 *
 * Every way of splitting the cast into rows of ground and rows of tray is
 * costed and the pieces are made as big as the canvas allows; where two splits
 * come out much the same size, the one whose shape suits the canvas wins. Which
 * split that is is therefore worked out rather than declared - a wide canvas
 * spends its width on one long row, an upright one stacks shallower rows and
 * gives the tray the height it saves.
 *
 * Throws rather than fitting a board a two-year-old could not play: a cast that
 * cannot be laid out above the floors is a bug in the level table, and a
 * silently unplayable board is worse than a loud refusal.
 */
export function fitRows(demand: RowsDemand, limits: Limits): RowsFit {
  const { canvas, span, reaches, grips, drawn, pad } = demand;
  const count = grips.length;
  if (count < 1) throw new Error("A layout needs at least one piece.");
  if (reaches.length < 1) throw new Error("A layout needs at least one target.");

  const drawnSides = drawn.map((share) => Math.max(share.width, share.height));
  const cost = (sceneRows: number, tray: TrayPlan): Plan =>
    planFor(canvas, reaches, drawnSides, sceneRows, tray, pad, limits);

  const plans: Plan[] = [];
  for (let sceneRows = 1; sceneRows <= reaches.length; sceneRows++) {
    for (let trayRows = 1; trayRows <= count; trayRows++) {
      for (const shelves of shelvings(grips, trayRows, pad)) {
        plans.push(cost(sceneRows, { place: "top", shelves }));
      }
    }
  }

  // Two floors, and for a cast that fills its boxes they are the same floor: a
  // slot too narrow to aim at, and a piece that draws too little of its slot to
  // pick up. A slice fails the second one long before the first. Both are sizes
  // rather than spreads, so both are measured against the nominal width.
  const smallest = limits.minSlot * span;
  const smallestInk = limits.minPieceInk * span;
  const grabbable = (plan: Plan): boolean =>
    plan.slotSize >= smallest && plan.slotSize * plan.smallest >= smallestInk;
  const viable = plans.filter(grabbable);
  if (viable.length === 0) {
    throw new Error(
      `${count} pieces do not fit a ${canvas.width}x${canvas.height} canvas without ` +
        `dropping below ${Math.round(smallest)} units each, which is too small for a ` +
        `toddler to grab.`,
    );
  }

  const traySpan = limits.trayShare * canvas.height;
  const wantedSceneRows = idealRows(
    reaches.length,
    canvas.height * (1 - limits.skyShare) - traySpan,
    canvas.width,
  );
  const wantedTrayRows = idealRows(count, traySpan, canvas.width);
  const biggest = Math.max(...viable.map((plan) => plan.slotSize));
  const misshapen = (plan: Plan): number =>
    Math.abs(plan.sceneCounts.length - wantedSceneRows) +
    Math.abs(trayRowsOf(plan) - wantedTrayRows);
  const best = viable
    .filter((plan) => plan.slotSize >= biggest * limits.sizeTolerance)
    // Plans are in row order, so a tie keeps the one with fewest rows.
    .reduce((chosen, plan) =>
      misshapen(plan) < misshapen(chosen) ||
      (misshapen(plan) === misshapen(chosen) && plan.slotSize > chosen.slotSize)
        ? plan
        : chosen,
    );

  // A tray down the sides is unusual enough to look like a mistake if it bought
  // nothing, so it has to buy something: it stands only where the scene is one
  // target - a picture, keeping the middle of the board - and only where it
  // makes that picture markedly bigger than a band across the top would.
  if (reaches.length === 1 && count > 1) {
    const sides = cost(1, { place: "sides", columns: columnings(grips, pad) });
    if (grabbable(sides) && sides.slotSize >= best.slotSize * limits.gutterGain) {
      return asFit(sides);
    }
  }
  return asFit(best);
}

/* ---------------------------------------------------------------------------
 * A picture board
 *
 * The kinds that cut one hand-drawn picture up and hand the child the pieces.
 * They are fitted the other way round from every other board: the tray is
 * planned first, from what a piece needs to be grabbable, and the picture then
 * takes *everything else*, aspect ratio allowing.
 *
 * The reason they cannot be fitted like anything else is arithmetic. A cut-up
 * picture's pieces tile it exactly, so a tray holding all of them at the size
 * they land at needs the picture's own area over again - which capped the
 * picture at about a tenth of the board. So a piece here waits smaller than it
 * lands, and no smaller than `Limits.minWaitingScale`. See
 * [decision 20260730T230000](../docs/decisions/20260730T230000-a-picture-takes-the-board.md).
 * ------------------------------------------------------------------------ */

/** The slot at which a shape drawn to fit a square exactly fills `room`. */
export const slotFilling = (box: Size, room: Size): number =>
  Math.max(box.width, box.height) * fitScale(room, box);

/**
 * The largest a tray of this shape can be drawn before it stops fitting. Both
 * measures - a shelf's span, a column's depth - already carry the padding they
 * were packed with, so this needs no `TrayPad` of its own.
 */
function trayCeiling(tray: TrayPlan, canvas: Size, limits: Limits): number {
  if (tray.place === "top") {
    return canvas.width / Math.max(...tray.shelves.map((shelf) => shelf.span));
  }
  // A side tray is capped by its own depth rather than by the canvas: its
  // columns stop short of `controlRoom` so a piece never waits under a button.
  const depth = Math.max(...tray.columns.map((column) => column.depth));
  return (canvas.height - limits.controlRoom) / depth;
}

/** One way to lay a picture board out: a tray, and the two sizes it settles. */
export interface PicturePlan {
  readonly tray: TrayPlan;
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
export function bestPicturePlan(
  tray: TrayPlan,
  canvas: Size,
  box: Size,
  pad: TrayPad,
  limits: Limits,
): PicturePlan {
  const margin = limits.pictureMargin * Math.min(canvas.width, canvas.height);
  let best: PicturePlan = { tray, sceneSlot: 0, traySlot: 0 };
  for (let traySlot = 1; traySlot <= Math.floor(trayCeiling(tray, canvas, limits)); traySlot++) {
    const room = sceneRoom(tray, canvas, traySlot, pad, margin);
    if (room.width <= 0 || room.height <= 0) break;
    const sceneSlot = Math.floor(
      Math.min(slotFilling(box, room), traySlot / limits.minWaitingScale),
    );
    if (sceneSlot > best.sceneSlot) {
      // A piece never waits larger than it lands: that would be a picture
      // shrinking as it is built, which is the opposite of the promise.
      best = { tray, sceneSlot, traySlot: Math.min(traySlot, sceneSlot) };
    }
  }
  return best;
}

/** What a picture board asks of the fit. */
export interface PictureDemand {
  readonly canvas: Size;
  readonly span: number;
  /** The picture's own box; its aspect ratio is what the room is judged by. */
  readonly box: Size;
  readonly grips: readonly Size[];
  readonly drawn: readonly Size[];
  readonly pad: TrayPad;
}

/**
 * Fit a board whose play area is one picture the board exists to show. Every
 * tray a cast of this size could be packed into is costed, and the one that
 * leaves the picture biggest wins; a tie goes to the tray whose pieces wait
 * largest.
 */
export function fitPicture(demand: PictureDemand, limits: Limits): PicturePlan {
  const { canvas, span, box, grips, drawn, pad } = demand;
  const count = grips.length;
  const trays: TrayPlan[] = [];
  for (let trayRows = 1; trayRows <= count; trayRows++) {
    for (const shelves of shelvings(grips, trayRows, pad)) {
      trays.push({ place: "top", shelves });
    }
  }
  if (count > 1) trays.push({ place: "sides", columns: columnings(grips, pad) });

  const smallestInk = limits.minPieceInk * span;
  const thinnest = Math.min(...drawn.map((ink) => Math.max(ink.width, ink.height)));
  // Measured on what the child sees of the piece as it waits, drawn small.
  const grabbable = (plan: PicturePlan): boolean =>
    plan.sceneSlot >= limits.minSlot * span && plan.traySlot * thinnest >= smallestInk;

  const viable = trays
    .map((tray) => bestPicturePlan(tray, canvas, box, pad, limits))
    .filter(grabbable);
  if (viable.length === 0) {
    throw new Error(
      `${count} pieces of a picture do not fit a ${canvas.width}x${canvas.height} canvas ` +
        `at a size a toddler could grab.`,
    );
  }

  return viable.reduce((chosen, plan) =>
    plan.sceneSlot > chosen.sceneSlot ||
    (plan.sceneSlot === chosen.sceneSlot && plan.traySlot > chosen.traySlot)
      ? plan
      : chosen,
  );
}
