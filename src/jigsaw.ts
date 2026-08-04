/**
 * Before changing this file, read docs/cutting.md.
 *
 * Cutting a picture into interlocking jigsaw pieces.
 *
 * Two rules run through the whole file, and both are the same rule the animals
 * have always been drawn by: **one path, used twice**.
 *
 * **Every internal edge is generated once.** The cut between two neighbours is
 * a single curve, minted once and handed to both of them - forwards to the
 * piece on one side, reversed to the piece on the other. Reversing a cubic is
 * reordering its four points, not recomputing them, so the two pieces share
 * their edge to the last bit rather than to within a rounding error. Generating
 * each piece on its own and hoping the tabs line up is the mistake this file
 * exists to make impossible; see
 * docs/decisions/Every cut is made once.md.
 *
 * **A piece is the picture through a clip path.** Nothing here intersects the
 * artwork with anything: a piece is `<g clip-path>` around the scene's own
 * markup, exactly as a slice is an animal through its cell (`slices.ts`). So
 * one hand-drawn scene serves a 2x2 board and a 4x3 board without being
 * redrawn, and two neighbours cannot draw the same pixel differently. That half
 * is `picture-pieces.ts`, because it is the same for a picture cut into shards
 * (`shatter.ts`): the cutter decides where the lines go and nothing else.
 *
 * Everything else is care about size. The tab is a share of the *cell*, so a
 * 4x3 grid gets small tabs on small pieces rather than tabs bigger than the
 * pieces they stick out of; the outer border of the picture is straight, so
 * edge pieces have one flat side and corner pieces two; and each piece declares
 * the bounds it actually draws (`PieceShape.inked`), which is what the tray,
 * the grab box and the layout's own floors measure it by.
 */
import type { Point, Rect, Size } from "./geometry";
import { pictureFrameId, picturePieces, type PicturePieces } from "./picture-pieces";
import type { Picture } from "./pictures";

/** How a picture is cut up: whole columns and rows of the picture box. */
export interface Grid {
  readonly columns: number;
  readonly rows: number;
}

/**
 * How far a tab sticks out, as a share of the shorter side of a cell. A share
 * rather than a length: a 4x3 grid has cells half the size of a 2x2 grid's, and
 * a fixed tab would be a knob bigger than the piece carrying it.
 */
export const TAB_SHARE = 0.16;

/**
 * One cubic segment, as the three points that follow the one before it. An edge
 * is a run of these, which is all the path data a cut ever needs: a straight
 * border is a cubic with its controls on the line, so both sorts of edge
 * reverse by the same code.
 */
interface Segment {
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

/** A cut, from one grid corner to the next. */
export interface Edge {
  readonly from: Point;
  readonly segments: readonly Segment[];
}

/**
 * The same cut, walked the other way: the points reordered, never recomputed.
 * This is the whole meshing guarantee in four lines - the piece on each side of
 * a cut is given the *same* curve, so the tab of one is the socket of the other
 * by construction rather than by arithmetic that happens to agree.
 */
export function reverseEdge(edge: Edge): Edge {
  const points = [edge.from, ...edge.segments.flatMap(({ c1, c2, to }) => [c1, c2, to])];
  const back = [...points].reverse();
  const segments: Segment[] = [];
  for (let index = 1; index < back.length; index += 3) {
    segments.push({
      c1: back[index] as Point,
      c2: back[index + 1] as Point,
      to: back[index + 2] as Point,
    });
  }
  return { from: back[0] as Point, segments };
}

/** Path data for a closed loop of edges, each starting where the last ended. */
export function edgePath(edges: readonly Edge[]): string {
  const round = (value: number): number => Number(value.toFixed(3));
  const at = (point: Point): string => `${round(point.x)} ${round(point.y)}`;
  const first = edges[0] as Edge;
  const body = edges
    .flatMap((edge) => edge.segments.map(({ c1, c2, to }) => `C${at(c1)} ${at(c2)} ${at(to)}`))
    .join(" ");
  return `M${at(first.from)} ${body} Z`;
}

/** A straight run from one point to the next, as one cubic on the line. */
function straightEdge(from: Point, to: Point): Edge {
  const along = (fraction: number): Point => ({
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
  });
  return { from, segments: [{ c1: along(1 / 3), c2: along(2 / 3), to }] };
}

/**
 * The tab, in edge units: how far along the cut each control point sits, and
 * how far out. `along` runs 0 to 1 from one corner to the next and `out` is in
 * tab heights, so the same six numbers draw every cut at every grid size.
 *
 * The neck is narrower than the head - the control points at 0.30 and 0.70 pull
 * the top of the knob back past where its sides leave the line - which is what
 * makes a jigsaw piece hold its neighbour rather than merely touch it.
 */
const KNOB: readonly { readonly c1: Point; readonly c2: Point; readonly to: Point }[] = [
  { c1: { x: 0.12, y: 0 }, c2: { x: 0.23, y: 0 }, to: { x: 0.35, y: 0 } },
  { c1: { x: 0.5, y: 0 }, c2: { x: 0.3, y: 1 }, to: { x: 0.5, y: 1 } },
  { c1: { x: 0.7, y: 1 }, c2: { x: 0.5, y: 0 }, to: { x: 0.65, y: 0 } },
  { c1: { x: 0.77, y: 0 }, c2: { x: 0.88, y: 0 }, to: { x: 1, y: 0 } },
];

/**
 * A cut from `from` to `to` with a knob on it, `height` units out. `side` is
 * which way the knob points: +1 to the right of the direction of travel, -1 to
 * the left. Whichever it is, the piece on that side gains a socket and the
 * piece on the other gains the matching tab.
 */
function knobbedEdge(from: Point, to: Point, height: number, side: 1 | -1): Edge {
  const along = { x: to.x - from.x, y: to.y - from.y };
  const length = Math.hypot(along.x, along.y);
  const unit = { x: along.x / length, y: along.y / length };
  // Turned a quarter turn from the direction of travel. In a coordinate system
  // with y downwards that is to the right of it, which is what `side` names.
  const out = { x: -unit.y, y: unit.x };
  const point = (at: Point): Point => ({
    x: from.x + unit.x * at.x * length + out.x * at.y * height * side,
    y: from.y + unit.y * at.x * length + out.y * at.y * height * side,
  });
  return {
    from,
    segments: KNOB.map(({ c1, c2, to: end }) => ({
      c1: point(c1),
      c2: point(c2),
      to: point(end),
    })),
  };
}

/**
 * Which way each cut's knob points, chosen so that **no piece carries two tabs
 * on the same axis, and no piece carries none at all**.
 *
 * Walk the cuts down one column of pieces: each hands its tab either to the
 * piece above it or to the piece below it. If the ones near the top all hand
 * theirs upwards and the ones below all hand theirs downwards - one turning
 * point per column, drawn at random - then no piece is handed a tab on its top
 * *and* its bottom, and exactly one piece in the column, the one at the turning
 * point, is handed neither. The same sideways for the cuts along a row. The two
 * turning points are then chosen so that the piece a row leaves without a
 * sideways tab is never the piece its column leaves without an upright one.
 *
 * This is a size rule rather than a drawing one. The tray packs every piece
 * into a cell as big as the biggest piece draws, so one piece with tabs on all
 * four sides drags the whole board's scale down; and a piece with no tab at all
 * is the smallest thing on the board, which is the one a small hand has to find.
 * Holding every piece to exactly one tab per axis keeps the largest within a
 * tab of the smallest, and that is what lets the busiest board - twelve pieces
 * across a landscape screen - still draw every piece well clear of the layout's
 * floor. See `tests/jigsaw.test.ts`, which measures both.
 *
 * A grid only one piece wide or one piece tall cannot have it both ways: its
 * turning piece has no other axis to be given a tab on. No level asks for one.
 */
function turningPoints(
  columns: number,
  rows: number,
  random: () => number,
): { readonly forColumn: readonly number[]; readonly forRow: readonly number[] } {
  const from = <T>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)] as T;
  const upTo = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);
  const forColumn = upTo(columns).map(() => from(upTo(rows)));
  // If every column turned at the same row, that row would have nowhere to put
  // the piece it leaves without a sideways tab.
  if (columns > 1 && rows > 1 && forColumn.every((turn) => turn === forColumn[0])) {
    forColumn[0] = ((forColumn[0] as number) % rows) + 1;
  }
  const forRow = upTo(rows).map((row) => {
    const clear = upTo(columns).filter((turn) => forColumn[turn - 1] !== row);
    return from(clear.length > 0 ? clear : upTo(columns));
  });
  return { forColumn, forRow };
}

/** One piece of the picture, before it is anything a puzzle can hold. */
export interface JigsawCell {
  readonly row: number;
  readonly column: number;
  /** The rectangle of the picture this cell is cut from, tabs aside. */
  readonly rect: Rect;
  /** Its four cuts, clockwise from the top-left corner. */
  readonly edges: readonly Edge[];
  /** Everything the piece draws, tabs included, in picture-box units. */
  readonly ink: Rect;
}

/**
 * Cut a box into `grid` pieces.
 *
 * The order of business matters and is the point of the function: every
 * horizontal cut and every vertical cut is built first, into two tables, and
 * only then are the pieces assembled out of them. A piece's top edge *is* the
 * cut its neighbour above uses as its bottom edge, reversed. There is no second
 * copy to drift.
 */
export function jigsawCut(
  box: Size,
  grid: Grid,
  random: () => number = Math.random,
): readonly JigsawCell[] {
  const { columns, rows } = grid;
  if (columns < 1 || rows < 1) {
    throw new Error(`A jigsaw needs at least one column and one row; got ${columns}x${rows}.`);
  }
  const cellWidth = box.width / columns;
  const cellHeight = box.height / rows;
  const tab = TAB_SHARE * Math.min(cellWidth, cellHeight);
  const corner = (column: number, row: number): Point => ({
    x: column * cellWidth,
    y: row * cellHeight,
  });
  // The cuts, each made once. `across[row][column]` runs left to right along
  // the top of cell (row, column); `down[row][column]` runs top to bottom along
  // its left-hand side. The picture's own border is straight, which is what
  // gives an edge piece one flat side and a corner piece two.
  const turns = turningPoints(columns, rows, random);
  const across: Edge[][] = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const from = corner(column, row);
      const to = corner(column + 1, row);
      return row === 0 || row === rows
        ? straightEdge(from, to)
        : knobbedEdge(from, to, tab, row < (turns.forColumn[column] as number) ? 1 : -1);
    }),
  );
  const down: Edge[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => {
      const from = corner(column, row);
      const to = corner(column, row + 1);
      return column === 0 || column === columns
        ? straightEdge(from, to)
        : knobbedEdge(from, to, tab, column < (turns.forRow[row] as number) ? -1 : 1);
    }),
  );

  const edgeAt = (table: readonly Edge[][], row: number, column: number): Edge => {
    const edge = table[row]?.[column];
    if (!edge) throw new Error(`No cut at row ${row}, column ${column} of a ${columns}x${rows}.`);
    return edge;
  };

  const cells: JigsawCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // Clockwise from the top-left corner, which is where the top cut starts.
      // Two of the four are walked backwards: the same curve as the neighbour
      // on that side draws, in the direction this piece goes round.
      const edges = [
        edgeAt(across, row, column),
        edgeAt(down, row, column + 1),
        reverseEdge(edgeAt(across, row + 1, column)),
        reverseEdge(edgeAt(down, row, column)),
      ];
      const rect = {
        x: column * cellWidth,
        y: row * cellHeight,
        width: cellWidth,
        height: cellHeight,
      };
      cells.push({ row, column, rect, edges, ink: inkOfCell(rect, edges, tab) });
    }
  }
  return cells;
}

/**
 * What a piece actually draws: its rectangle, grown by a tab on each side a tab
 * sticks out of. Measured from the cuts rather than assumed, because a corner
 * piece has two straight sides and a middle piece may have knobs pointing any
 * way at all - and a piece measured as though it had four would be packed into
 * a tray cell bigger than the piece, and grabbed by a box past its own edge.
 *
 * A knob leaves the cell exactly when the curve goes outside the rectangle, and
 * it goes exactly one tab out when it does, so this is which side rather than
 * how far.
 */
function inkOfCell(rect: Rect, edges: readonly Edge[], tab: number): Rect {
  const bounds = {
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  };
  const nudge = tab * 1e-6;
  for (const edge of edges) {
    for (const point of [edge.from, ...edge.segments.map(({ to }) => to)]) {
      if (point.x < rect.x - nudge) bounds.left = rect.x - tab;
      if (point.x > rect.x + rect.width + nudge) bounds.right = rect.x + rect.width + tab;
      if (point.y < rect.y - nudge) bounds.top = rect.y - tab;
      if (point.y > rect.y + rect.height + nudge) bounds.bottom = rect.y + rect.height + tab;
    }
  }
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

/** A picture cut up: the whole thing to build it in, and the pieces to build. */
export type JigsawShapes = PicturePieces;

/** The id the frame of a jigsawed picture is known by. */
export const frameId = (picture: Picture): string => pictureFrameId(picture, "jigsaw");

/**
 * A picture as a puzzle's worth of shapes.
 *
 * The cutter's part is the cells; what a cell becomes is `picture-pieces.ts`,
 * which the shatter chapter shares - a piece is the scene's own artwork through
 * its own outline, whichever way the outline was arrived at.
 */
export function jigsawShapes(
  picture: Picture,
  grid: Grid,
  random: () => number = Math.random,
): JigsawShapes {
  const cells = jigsawCut(picture.box, grid, random);
  return picturePieces(
    picture,
    "jigsaw",
    cells.map((cell) => ({
      name: `${grid.columns}x${grid.rows}:${cell.row}-${cell.column}`,
      outline: edgePath(cell.edges),
      ink: cell.ink,
    })),
  );
}
