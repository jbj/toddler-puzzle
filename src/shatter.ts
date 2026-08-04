/**
 * Before changing this file, read docs/cutting.md.
 *
 * Shattering a picture: cutting it into irregular convex shards.
 *
 * The other way of cutting a scene up. A jigsaw cuts rows and columns, so every
 * piece is the same rectangle and the only thing telling two of them apart is
 * the picture inside. A shatter cuts the box into many-sided pieces, no two the
 * same, which is why it is the *easier* of the two despite looking harder: a
 * child matches a shard by its outline, which is the skill the shape-match
 * chapters spent twenty levels building.
 *
 * Three rules run through the file, and the first two are the jigsaw cutter's
 * (`jigsaw.ts`) kept word for word.
 *
 * **Every cut is made once.** A cut is one `Cut` object handed to both the
 * pieces it divides - forwards to one, reversed to the other - so two
 * neighbours share their boundary to the last bit rather than to within a
 * rounding error. When a later cut lands in the middle of an existing one, that
 * cut is split *in both of its owners*, around the very same point: the mesh
 * conforms, so there is no gap between a piece and the neighbour it was cut
 * away from, and none of the picture is drawn twice. See
 * docs/decisions/Every cut is made once.md.
 *
 * **Cutting is clipping.** A piece is the scene's own markup inside a
 * `<g clip-path>` made from its outline; nothing intersects artwork with
 * anything (`picture-pieces.ts`).
 *
 * **No shard a small hand cannot hold.** Splitting a convex polygon with a
 * straight line gives two convex polygons, so every piece is convex by
 * construction rather than nearly so. What convexity does not give is size, and
 * a partition drawn at random will happily produce a splinter, so each split is
 * measured before it is made: the two halves have to hold their share of the
 * picture's area, neither may be thinner than `MIN_FATNESS` - the radius of the
 * largest disc inside the piece, over the square root of its area, which is the
 * "minimum inscribed radius" of the issue in a form that does not care how big
 * the picture is - and neither may sprawl further than `MAX_SPREAD`. A
 * candidate that fails is not cut; the search tries another angle. See
 * docs/decisions/Cut a picture into shards that are things to hold.md.
 */
import type { Point, Rect, Size } from "./geometry";
import { pictureFrameId, picturePieces, type CutCell, type PicturePieces } from "./picture-pieces";
import type { Picture } from "./pictures";

/**
 * A cut, from one point to another, drawn once and shared. The two pieces on
 * either side of it hold this same object: one walks it forwards, the other
 * backwards, and neither has a copy of its own to drift.
 */
export interface Cut {
  readonly from: Point;
  readonly to: Point;
}

/** A cut as one piece walks it: the shared cut, and which way round. */
export interface Side {
  readonly cut: Cut;
  readonly forward: boolean;
}

/** One shard of the picture, before it is anything a puzzle can hold. */
export interface Shard {
  /** Its boundary, in order, each side a cut shared with a neighbour or the border. */
  readonly sides: readonly Side[];
  /** The same boundary as the points it turns at, starting at the first side. */
  readonly points: readonly Point[];
  /** What it covers, in square picture-box units. */
  readonly area: number;
  /** The radius of the largest disc that fits inside it. */
  readonly inradius: number;
  /** Everything the piece draws, in picture-box units. */
  readonly ink: Rect;
}

/**
 * The smallest a shard may be, as a share of an even one - the picture's area
 * divided by the number of pieces.
 *
 * Not a lot below 1: the tray packs every piece into a cell as big as the
 * biggest one draws, so the biggest shard sets the whole board's scale and the
 * smallest is what a small hand has to find. Holding them close together is
 * what lets an eight-piece board draw every piece well clear of the layout's
 * floor, exactly as holding a jigsaw to one tab per axis does.
 */
export const MIN_AREA_SHARE = 0.7;

/** The largest, on the same measure and for the same reason. */
export const MAX_AREA_SHARE = 1.35;

/**
 * How fat a shard has to be: the radius of the biggest disc inside it, over the
 * square root of its area.
 *
 * A square scores 0.5, a circle 0.564, a rectangle three times as long as it is
 * wide 0.289. So this is "never much thinner than three to one", written in a
 * form that does not change when the picture or the piece count does. It is the
 * minimum inscribed radius the level needs, and it is the one that catches a
 * splinter: a shard can hold its share of the area and still be a sliver, and a
 * sliver is the thing a two-year-old cannot pick up.
 */
export const MIN_FATNESS = 0.3;

/**
 * How far a shard may sprawl: the longer side of the box it draws in, over the
 * square root of its area.
 *
 * A square scores 1, a square turned forty-five degrees 1.41, a rectangle twice
 * as long as it is wide 1.41. Fatness alone does not catch a shard that lies
 * across a corner of the picture: it can be plump and still draw in a box the
 * width of the whole scene, and the tray gives every piece a cell as big as the
 * biggest one draws. So this is the floor under the *smallest* piece as much as
 * the ceiling over the biggest - it holds the cast within half again of each
 * other, which is what keeps an eight-piece board clear of the layout's floor.
 */
export const MAX_SPREAD = 1.5;

/** How far a split may stray from an even one, so that no two shards match. */
const WOBBLE = 0.14;

/**
 * How many angles a cut is looked for at.
 *
 * Swept rather than drawn: the attempts are spread evenly around the half turn
 * from a random start, so a region always gets a candidate near every
 * orientation instead of leaving it to chance whether the one angle that suits
 * it comes up. Together with backtracking, that is what makes the floors hold
 * on every seed rather than on most of them.
 */
const ATTEMPTS = 32;

/**
 * How many of the cuts that cleared the floors a region tries before it gives
 * up and lets the region above it try another. Bounds the search; a region that
 * has failed this many good cuts is not one another cut will save.
 */
const BRANCHES = 4;

/**
 * How many whole plans are drawn before the cutter gives up. A plan can only
 * fail at the very last step, when a line planned on a plain polygon misses the
 * mesh's boundary, which takes a degenerate region to do.
 */
const DEALS = 8;

/** Anything closer together than this is the same point, in picture-box units. */
const EPS = 1e-6;

/**
 * The smallest disc every shard of a `count`-piece partition contains. Both
 * floors at once, and the number the art check sizes its window from: no piece
 * is smaller than `MIN_AREA_SHARE` of an even share, and none is thinner than
 * `MIN_FATNESS`, so none is without a disc this big in it.
 */
export function minInradius(box: Size, count: number): number {
  return MIN_FATNESS * Math.sqrt((MIN_AREA_SHARE * box.width * box.height) / count);
}

/** Where a piece's boundary starts and ends this side, walked its way round. */
const startOf = (side: Side): Point => (side.forward ? side.cut.from : side.cut.to);
const endOf = (side: Side): Point => (side.forward ? side.cut.to : side.cut.from);

/** The points a boundary turns at, in the order it is walked. */
const pointsOf = (sides: readonly Side[]): Point[] => sides.map(startOf);

/** The area a closed polygon covers, by the shoelace formula. */
export function areaOf(points: readonly Point[]): number {
  let twice = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index] as Point;
    const b = points[(index + 1) % points.length] as Point;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Path data for a closed polygon, rounded the same way for every piece. */
export function shardPath(points: readonly Point[]): string {
  const round = (value: number): number => Number(value.toFixed(3));
  const at = (point: Point): string => `${round(point.x)} ${round(point.y)}`;
  const [first, ...rest] = points;
  return `M${at(first as Point)} ${rest.map((point) => `L${at(point)}`).join(" ")} Z`;
}

/** The box a polygon draws inside. */
function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/** One edge as a half-plane: inside is where `normal · p >= offset`. */
interface HalfPlane {
  readonly normal: Point;
  readonly offset: number;
}

/** A polygon's edges as half-planes, each normal turned to face inwards. */
function halfPlanesOf(points: readonly Point[]): HalfPlane[] {
  const inside = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const planes: HalfPlane[] = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index] as Point;
    const b = points[(index + 1) % points.length] as Point;
    const along = { x: b.x - a.x, y: b.y - a.y };
    const length = Math.hypot(along.x, along.y);
    if (length < EPS) continue;
    let normal = { x: -along.y / length, y: along.x / length };
    let offset = normal.x * a.x + normal.y * a.y;
    if (normal.x * inside.x + normal.y * inside.y < offset) {
      normal = { x: -normal.x, y: -normal.y };
      offset = -offset;
    }
    planes.push({ normal, offset });
  }
  return planes;
}

/**
 * The radius of the largest disc that fits inside a convex polygon.
 *
 * Exactly, rather than by sampling. The biggest disc is the one that touches
 * three of the edges at once - or two, when a corner is what pins it - so every
 * triple of edges is solved for the point equidistant from all three, and the
 * best of the ones that turn out to be inside the polygon wins. A polygon has a
 * handful of edges, so a handful cubed is nothing, and an answer that is exact
 * is worth having: this is the number that says whether a shard is a piece or a
 * splinter.
 */
export function inradiusOf(points: readonly Point[]): number {
  const planes = halfPlanesOf(points);
  if (planes.length < 3) return 0;
  const depth = (at: Point): number =>
    Math.min(...planes.map(({ normal, offset }) => normal.x * at.x + normal.y * at.y - offset));

  let best = 0;
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const centre = equidistant(
          planes[i] as HalfPlane,
          planes[j] as HalfPlane,
          planes[k] as HalfPlane,
        );
        if (!centre) continue;
        const radius = depth(centre);
        if (radius > best) best = radius;
      }
    }
  }
  return best;
}

/**
 * The point the same distance inside all three edges, or nothing when the three
 * of them have no such point - two parallel edges and a third, say.
 *
 * Three equations, `normal · p - r = offset`, solved for `p` and `r` together
 * by Cramer's rule.
 */
function equidistant(a: HalfPlane, b: HalfPlane, c: HalfPlane): Point | null {
  const rows = [a, b, c].map(({ normal, offset }) => [normal.x, normal.y, -1, offset] as const);
  const determinant = (columns: readonly [number, number, number]): number => {
    const at = (row: number, column: number): number =>
      (rows[row] as readonly number[])[columns[column] as number] as number;
    return (
      at(0, 0) * (at(1, 1) * at(2, 2) - at(1, 2) * at(2, 1)) -
      at(0, 1) * (at(1, 0) * at(2, 2) - at(1, 2) * at(2, 0)) +
      at(0, 2) * (at(1, 0) * at(2, 1) - at(1, 1) * at(2, 0))
    );
  };
  const whole = determinant([0, 1, 2]);
  if (Math.abs(whole) < 1e-12) return null;
  return { x: determinant([3, 1, 2]) / whole, y: determinant([0, 3, 2]) / whole };
}

/** A polygon with everything on the far side of a line taken off it. */
function clipTo(points: readonly Point[], { normal, offset }: HalfPlane): Point[] {
  const kept: Point[] = [];
  const level = (point: Point): number => normal.x * point.x + normal.y * point.y - offset;
  for (let index = 0; index < points.length; index++) {
    const from = points[index] as Point;
    const to = points[(index + 1) % points.length] as Point;
    const here = level(from);
    const there = level(to);
    if (here >= 0) kept.push(from);
    if ((here > 0 && there < 0) || (here < 0 && there > 0)) {
      const at = here / (here - there);
      kept.push({ x: from.x + (to.x - from.x) * at, y: from.y + (to.y - from.y) * at });
    }
  }
  return kept;
}

/** A region's cut, and how each of the halves it leaves is cut in turn. */
interface Plan {
  /** The line through this region, or `null` when the region is one piece. */
  readonly plane: HalfPlane | null;
  readonly inside: Plan | null;
  readonly outside: Plan | null;
}

/** One way of splitting a polygon: where the line is, and what it leaves. */
interface Split {
  readonly plane: HalfPlane;
  /** The part on the far side of the line, and the part on the near side. */
  readonly inside: readonly Point[];
  readonly outside: readonly Point[];
}

/**
 * A line at `angle` that cuts `fraction` of the polygon's area off it, found by
 * halving the interval: the area on one side of a line grows steadily as the
 * line moves across a convex polygon, so forty halvings land on the fraction
 * asked for to well inside a thousandth of a unit.
 */
function splitAt(points: readonly Point[], angle: number, fraction: number): Split | null {
  const normal = { x: Math.cos(angle), y: Math.sin(angle) };
  const levels = points.map((point) => normal.x * point.x + normal.y * point.y);
  let low = Math.min(...levels);
  let high = Math.max(...levels);
  const wanted = areaOf(points) * fraction;
  let offset = (low + high) / 2;
  for (let step = 0; step < 40; step++) {
    offset = (low + high) / 2;
    // `inside` is the part with `normal · p <= offset`, which is what grows.
    if (
      areaOf(clipTo(points, { normal: { x: -normal.x, y: -normal.y }, offset: -offset })) < wanted
    )
      low = offset;
    else high = offset;
  }
  const plane = { normal, offset };
  const inside = clipTo(points, { normal: { x: -normal.x, y: -normal.y }, offset: -offset });
  const outside = clipTo(points, plane);
  if (inside.length < 3 || outside.length < 3) return null;
  return { plane, inside, outside };
}

/**
 * How comfortably this part clears the floors: the tightest of its four
 * margins, positive when it clears all of them and negative by however much its
 * worst one fails. Its share of the area between floor and ceiling, its fatness
 * above the floor, and its sprawl below the ceiling.
 *
 * Measured against the pieces the part will eventually be cut into, so the
 * check is the same one whether the part is a finished shard or a region still
 * to be divided - which is what stops a partition painting itself into a corner
 * by leaving a thin region for its last two pieces to come out of.
 */
function comfortOf(points: readonly Point[], pieces: number, even: number): number {
  const area = areaOf(points);
  const share = area / pieces / even;
  const side = Math.sqrt(area);
  const bounds = boundsOf(points);
  return Math.min(
    share - MIN_AREA_SHARE,
    MAX_AREA_SHARE - share,
    inradiusOf(points) / side - MIN_FATNESS,
    MAX_SPREAD - Math.max(bounds.width, bounds.height) / side,
  );
}

/**
 * Split a cut in two, in every piece that holds it.
 *
 * The point the two halves meet at is one object, shared by both halves and by
 * both of the pieces on either side of the cut, so a cut that has been divided
 * is still one cut drawn once. A piece holds a given cut at most once, and the
 * piece on the far side of it has to be updated as well as the two being made -
 * this is exactly the step that keeps the mesh from growing a T-junction, where
 * one piece has a corner in the middle of its neighbour's straight edge and the
 * two of them agree only to within a rounding error.
 */
function splitCut(pieces: readonly Side[][], cut: Cut, at: Point): void {
  const first: Cut = { from: cut.from, to: at };
  const second: Cut = { from: at, to: cut.to };
  for (const piece of pieces) {
    const index = piece.findIndex((side) => side.cut === cut);
    if (index < 0) continue;
    const forward = (piece[index] as Side).forward;
    piece.splice(
      index,
      1,
      ...(forward
        ? [
            { cut: first, forward: true },
            { cut: second, forward: true },
          ]
        : [
            { cut: second, forward: false },
            { cut: first, forward: false },
          ]),
    );
  }
}

/**
 * Cut one piece of the mesh in two along a line, and hand the new cut to both
 * halves. Returns the halves, the first being the one on the far side of the
 * line - the side `splitAt` measured its fraction from.
 */
function cutPiece(pieces: Side[][], index: number, plane: HalfPlane): [Side[], Side[]] | null {
  const piece = pieces[index] as Side[];
  const { normal, offset } = plane;
  const level = (point: Point): number => normal.x * point.x + normal.y * point.y - offset;

  // Worked out before anything is changed, because a candidate that turns out
  // not to cross the boundary in exactly two places must leave the mesh alone.
  const corners: Point[] = [];
  const through: { readonly cut: Cut; readonly at: Point }[] = [];
  for (const side of piece) {
    const from = startOf(side);
    const to = endOf(side);
    const here = level(from);
    const there = level(to);
    if (Math.abs(here) <= EPS) {
      corners.push(from);
      continue;
    }
    if (Math.abs(there) <= EPS || here * there > 0) continue;
    const along = here / (here - there);
    const at = {
      x: from.x + (to.x - from.x) * along,
      y: from.y + (to.y - from.y) * along,
    };
    corners.push(at);
    through.push({ cut: side.cut, at });
  }
  if (corners.length !== 2) return null;

  for (const { cut, at } of through) splitCut(pieces, cut, at);

  const [one, other] = corners as [Point, Point];
  const from = piece.findIndex((side) => startOf(side) === one);
  const to = piece.findIndex((side) => startOf(side) === other);
  if (from < 0 || to < 0) return null;

  const cut: Cut = { from: one, to: other };
  const between = (start: number, end: number): Side[] => {
    const run: Side[] = [];
    for (let step = start; step !== end; step = (step + 1) % piece.length) {
      run.push(piece[step] as Side);
    }
    return run;
  };
  const halves: [Side[], Side[]] = [
    [...between(from, to), { cut, forward: false }],
    [...between(to, from), { cut, forward: true }],
  ];
  const middle = (sides: readonly Side[]): number => {
    const points = pointsOf(sides);
    return level({
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    });
  };
  // The far side first, whichever way round the boundary was walked.
  return middle(halves[0]) < 0 ? halves : [halves[1], halves[0]];
}

/**
 * Plan how a region holding `pieces` pieces is cut up: a line through it, and a
 * plan for each of the two halves. `null` when there is no way of cutting it
 * that leaves every shard something a small hand can hold.
 *
 * Halving, rather than scattering points and taking their Voronoi cells: the
 * box is cut in two, each half is cut in two, and so on until every region
 * holds one piece. Three things fall out of doing it that way, and they are the
 * three the level needs:
 *
 *  - **every piece is convex**, because a straight line through a convex
 *    polygon leaves two convex polygons. A shard with a deep notch in it is
 *    hard to recognise and hard to aim, and this makes one impossible rather
 *    than unlikely;
 *  - **the pieces are near enough the same size**, because each cut is aimed at
 *    the share of the area its side will eventually hold, found by halving the
 *    interval rather than hoped for;
 *  - **no two are the same shape**, because the angle of every cut is drawn
 *    fresh, and a shard is the handful of cuts that happened to surround it.
 *
 * Every cut is looked for at `ATTEMPTS` angles spread evenly around the half
 * turn, and one of the ones that cleared the floors is taken at random, rather
 * than the first or the roomiest. Taking the first would be as good a cut but a
 * worse partition - a region only ever cut the first way that worked ends up
 * cut the same way every time - and taking the roomiest would draw the picture
 * towards a grid, which is the one shape this kind exists not to be.
 *
 * A cut that clears the floors can still leave a region that cannot be cut
 * again without leaving a splinter, so the search backtracks: a region is only
 * planned once both of its halves have been planned all the way down to single
 * pieces. That is what turns the floors from a hope into a promise - a plan
 * that comes back has already been checked, shard by shard, to the last one.
 */
function planSplit(
  points: readonly Point[],
  pieces: number,
  even: number,
  random: () => number,
): Plan | null {
  if (pieces < 2) return { plane: null, inside: null, outside: null };
  // Half the pieces each way, and which half gets the odd one drawn at random,
  // so a five-piece picture is not always cut three and two the same way round.
  const share = random() < 0.5 ? Math.floor(pieces / 2) : Math.ceil(pieces / 2);
  const rest = pieces - share;
  // Aimed at what one half should hold outright - its pieces' worth of an even
  // share - rather than at its proportion of this region, so a region that came
  // out a little large or small does not pass that on.
  const wanted = (share * even) / areaOf(points);

  const good: Split[] = [];
  const first = random();
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const angle = (first + attempt / ATTEMPTS) * Math.PI;
    const wobble = 1 + (random() * 2 - 1) * WOBBLE;
    const split = splitAt(points, angle, Math.min(0.9, Math.max(0.1, wanted * wobble)));
    if (!split) continue;
    const comfort = Math.min(
      comfortOf(split.inside, share, even),
      comfortOf(split.outside, rest, even),
    );
    if (comfort > 0) good.push(split);
  }

  // The candidates in a random order, and the first of them whose halves can
  // both be planned in turn. `BRANCHES` bounds the work: a region that fails
  // this many good cuts is not one more cuts will save, and the region above it
  // is the one to try again.
  for (let taken = 0; taken < BRANCHES && good.length > 0; taken++) {
    const [split] = good.splice(Math.floor(random() * good.length), 1) as [Split];
    const inside = planSplit(split.inside, share, even, random);
    if (!inside) continue;
    const outside = planSplit(split.outside, rest, even, random);
    if (!outside) continue;
    return { plane: split.plane, inside, outside };
  }
  return null;
}

/**
 * Cut a mesh up along a plan, minting the shared cuts as it goes.
 *
 * The plan was drawn on plain polygons, where a region is its own copy of its
 * corners; the mesh is the one the pieces come out of, where a boundary between
 * two pieces is a single `Cut` they both hold. Replaying the plan on it puts
 * exactly the same lines through exactly the same regions, so what the search
 * measured is what the puzzle gets.
 */
function applyPlan(pieces: Side[][], index: number, plan: Plan): boolean {
  if (!plan.plane) return true;
  const halves = cutPiece(pieces, index, plan.plane);
  // A line that missed the boundary it was drawn across can only have been a
  // degenerate one, and the mesh is untouched. The deal is abandoned; the next
  // one draws different lines.
  if (!halves) return false;
  pieces.splice(index, 1, halves[0]);
  const far = pieces.push(halves[1]) - 1;
  return (
    applyPlan(pieces, index, plan.inside as Plan) && applyPlan(pieces, far, plan.outside as Plan)
  );
}

/** One whole deal: a plan for the box, replayed onto a mesh of shared cuts. */
function onePartition(box: Size, count: number, random: () => number): readonly Shard[] | null {
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: box.width, y: 0 },
    { x: box.width, y: box.height },
    { x: 0, y: box.height },
  ];
  const plan = planSplit(corners, count, (box.width * box.height) / count, random);
  if (!plan) return null;

  const pieces: Side[][] = [
    corners.map((from, index) => ({
      cut: { from, to: corners[(index + 1) % corners.length] as Point },
      forward: true,
    })),
  ];
  if (!applyPlan(pieces, 0, plan)) return null;

  return pieces.map((piece) => {
    const points = pointsOf(piece);
    return {
      sides: piece,
      points,
      area: areaOf(points),
      inradius: inradiusOf(points),
      ink: boundsOf(points),
    };
  });
}

/**
 * Shatter a box into `count` irregular convex shards, and mean it.
 *
 * A deal is a plan and its replay. The plan is searched for on plain polygons,
 * backtracking until every shard of it clears the floors, so a plan that comes
 * back is one that has already been measured to the last piece; the replay puts
 * those same lines through the mesh the pieces are actually cut from. A deal
 * fails only if the replay finds a line that misses, which takes a degenerate
 * region; another is dealt from the same stream of numbers.
 *
 * The same seed gives the same shatter: every number the cutter uses comes from
 * `random`, in the same order, re-deals and all.
 */
export function shatterCut(
  box: Size,
  count: number,
  random: () => number = Math.random,
): readonly Shard[] {
  if (count < 1) {
    throw new Error(`A shatter needs at least one piece; got ${count}.`);
  }
  for (let deal = 0; deal < DEALS; deal++) {
    const shards = onePartition(box, count, random);
    if (shards) return shards;
  }
  throw new Error(`Could not shatter a ${box.width}x${box.height} picture into ${count} pieces.`);
}

/** The id the frame of a shattered picture is known by. */
export const frameId = (picture: Picture): string => pictureFrameId(picture, "shatter");

/**
 * A shattered picture as a puzzle's worth of shapes: the whole picture as the
 * one thing to fill, and one clipped shard per piece.
 */
export function shatterShapes(
  picture: Picture,
  count: number,
  random: () => number = Math.random,
): PicturePieces {
  const shards = shatterCut(picture.box, count, random);
  const cells: CutCell[] = shards.map((shard, index) => ({
    name: `${count}:${index}`,
    outline: shardPath(shard.points),
    ink: shard.ink,
  }));
  return picturePieces(picture, "shatter", cells);
}
