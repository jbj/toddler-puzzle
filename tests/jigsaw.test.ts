/**
 * Cutting a picture up, and the levels made of the pieces.
 *
 * Two halves, and they are different sorts of thing:
 *
 *  - the **cut** is pure geometry, and what is checked is the promise the
 *    cutter exists to keep: two neighbours share their edge *exactly*, because
 *    it is the same curve given to both of them, one of them backwards. That is
 *    measured point by point rather than to within a tolerance, because "within
 *    a tolerance" is what a jigsaw whose tabs nearly fit looks like. The tiling
 *    follows from it and is measured too - the pieces' areas add up to the box,
 *    so there is no stripe of the picture that no piece draws and none that two
 *    draw;
 *  - the **kind** is rules, and what is checked is the promise the chapter is
 *    built on: every piece of one picture aims at that picture's one hole, from
 *    the same box at the same scale, so a finished jigsaw is the picture.
 *
 * Sizes are checked here as well, because a jigsaw is the one kind that can
 * make its own pieces too small: the tray packs by what a piece draws, so a
 * piece with tabs all round drags the board's scale down and a piece with none
 * at all is the smallest thing on it. `tests/puzzle.test.ts` holds the floors
 * the layout has to clear; what is here is the rule that keeps the pieces of a
 * size with each other in the first place.
 *
 * Whether a cut-up picture actually reads as a picture is not checked here.
 * Only `npm run shot` can see that, which is why the shot run plays a jigsaw.
 */
import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/geometry";
import { jigsaw } from "../src/kinds/jigsaw";
import { boxOf, buildLevelLayout, holeOf } from "../src/layout";
import { LEVELS, type LevelSpec } from "../src/levels";
import { assertUniquePieceIds } from "../src/piece";
import { PICTURE_BOX, loadPictures, pictureFor } from "../src/pictures";
import type { Puzzle } from "../src/puzzle";
import {
  TAB_SHARE,
  edgePath,
  frameId,
  jigsawCut,
  jigsawShapes,
  reverseEdge,
  type Edge,
  type Grid,
  type JigsawCell,
} from "../src/jigsaw";

const JIGSAW_LEVELS = LEVELS.filter((level) => level.kind === "jigsaw");

/** Every grid the level table cuts a picture at, and one it does not. */
const GRIDS: readonly Grid[] = [
  { columns: 2, rows: 2 },
  { columns: 3, rows: 2 },
  { columns: 3, rows: 3 },
  { columns: 4, rows: 3 },
];

const cellOf = (
  cells: readonly JigsawCell[],
  grid: Grid,
  row: number,
  column: number,
): JigsawCell => cells[row * grid.columns + column]!;

/** Every point an edge is made of, in the order it is walked. */
const pointsOf = (edge: Edge): { x: number; y: number }[] => [
  edge.from,
  ...edge.segments.flatMap(({ c1, c2, to }) => [c1, c2, to]),
];

const endOf = (edge: Edge): { x: number; y: number } => pointsOf(edge).at(-1)!;

/** A cubic, flattened. Fine enough that the sampled area is the real one. */
function flatten(edge: Edge, per = 48): { x: number; y: number }[] {
  const out = [edge.from];
  let from = edge.from;
  for (const { c1, c2, to } of edge.segments) {
    for (let step = 1; step <= per; step++) {
      const t = step / per;
      const u = 1 - t;
      out.push({
        x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
        y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
      });
    }
    from = to;
  }
  return out;
}

/** The area a piece covers, by the shoelace formula on its flattened outline. */
function areaOf(cell: JigsawCell): number {
  const ring = cell.edges.flatMap((edge) => flatten(edge));
  let twice = 0;
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index]!;
    const b = ring[(index + 1) % ring.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

describe("the cut", () => {
  it("makes one piece per grid square, in reading order", () => {
    for (const grid of GRIDS) {
      const cells = jigsawCut(PICTURE_BOX, grid, seededRandom(3));
      expect(cells, `${grid.columns}x${grid.rows}`).toHaveLength(grid.columns * grid.rows);
      cells.forEach((cell, index) => {
        expect(cell.row).toBe(Math.floor(index / grid.columns));
        expect(cell.column).toBe(index % grid.columns);
        expect(cell.rect.width).toBeCloseTo(PICTURE_BOX.width / grid.columns, 9);
        expect(cell.rect.height).toBeCloseTo(PICTURE_BOX.height / grid.rows, 9);
      });
    }
  });

  it("closes every piece, each cut starting exactly where the last one ended", () => {
    // Exactly, not nearly: a piece whose outline does not close is a clip path
    // the browser closes for it, with a straight line across the drawing.
    for (const grid of GRIDS) {
      for (const cell of jigsawCut(PICTURE_BOX, grid, seededRandom(7))) {
        expect(cell.edges).toHaveLength(4);
        cell.edges.forEach((edge, index) => {
          const next = cell.edges[(index + 1) % cell.edges.length]!;
          expect(endOf(edge), `${cell.row}-${cell.column} edge ${index}`).toEqual(next.from);
        });
      }
    }
  });

  it("gives two neighbours the same curve, one of them backwards", () => {
    // The guarantee the cutter exists for. Not "the tabs line up to five
    // decimal places" but "there is only one curve": the piece below draws the
    // very points the piece above drew, in the other order. Nothing rounds,
    // nothing drifts, and no grid size can make it drift.
    for (const grid of GRIDS) {
      const cells = jigsawCut(PICTURE_BOX, grid, seededRandom(11));
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          const cell = cellOf(cells, grid, row, column);
          const [top, right, bottom, left] = cell.edges as [Edge, Edge, Edge, Edge];
          if (row + 1 < grid.rows) {
            const below = cellOf(cells, grid, row + 1, column);
            expect(reverseEdge(bottom), `${row}-${column} to the one below`).toEqual(
              below.edges[0],
            );
          }
          if (column + 1 < grid.columns) {
            const beside = cellOf(cells, grid, row, column + 1);
            expect(reverseEdge(right), `${row}-${column} to the one beside`).toEqual(
              beside.edges[3],
            );
          }
          // And the two the piece itself walks backwards are honest reversals.
          expect(reverseEdge(reverseEdge(top))).toEqual(top);
          expect(reverseEdge(reverseEdge(left))).toEqual(left);
        }
      }
    }
  });

  it("covers the picture exactly, with nothing left over and nothing twice", () => {
    // Areas summing to the box is the whole of it once the neighbours are
    // known to share their edges: a gap would be a stripe of the picture no
    // piece draws, an overlap a stripe two pieces both draw, and either would
    // show up here as an area that is not the box's.
    for (const grid of GRIDS) {
      for (let seed = 0; seed < 5; seed++) {
        const cells = jigsawCut(PICTURE_BOX, grid, seededRandom(seed));
        const total = cells.reduce((sum, cell) => sum + areaOf(cell), 0);
        const whole = PICTURE_BOX.width * PICTURE_BOX.height;
        expect(total / whole, `${grid.columns}x${grid.rows} seed ${seed}`).toBeCloseTo(1, 6);
      }
    }
  });

  it("keeps the picture's own border straight", () => {
    // Which is what gives an edge piece one flat side and a corner piece two.
    for (const grid of GRIDS) {
      const cells = jigsawCut(PICTURE_BOX, grid, seededRandom(5));
      for (const cell of cells) {
        const [top, right, bottom, left] = cell.edges as [Edge, Edge, Edge, Edge];
        const flat = (edge: Edge, axis: "x" | "y", at: number): void => {
          for (const point of pointsOf(edge)) expect(point[axis]).toBeCloseTo(at, 9);
        };
        if (cell.row === 0) flat(top, "y", 0);
        if (cell.row === grid.rows - 1) flat(bottom, "y", PICTURE_BOX.height);
        if (cell.column === 0) flat(left, "x", 0);
        if (cell.column === grid.columns - 1) flat(right, "x", PICTURE_BOX.width);
      }
    }
  });

  it("stays inside the picture, tabs and all", () => {
    for (const grid of GRIDS) {
      for (const cell of jigsawCut(PICTURE_BOX, grid, seededRandom(13))) {
        expect(cell.ink.x).toBeGreaterThanOrEqual(-1e-9);
        expect(cell.ink.y).toBeGreaterThanOrEqual(-1e-9);
        expect(cell.ink.x + cell.ink.width).toBeLessThanOrEqual(PICTURE_BOX.width + 1e-9);
        expect(cell.ink.y + cell.ink.height).toBeLessThanOrEqual(PICTURE_BOX.height + 1e-9);
      }
    }
  });

  it("shrinks the tab with the piece", () => {
    // A fixed tab on a 4x3 board would be a knob a third of the piece it
    // sticks out of. The tab is a share of the cell, so it is measured here
    // against the cell rather than against the picture.
    for (const grid of GRIDS) {
      const cellWidth = PICTURE_BOX.width / grid.columns;
      const cellHeight = PICTURE_BOX.height / grid.rows;
      const tab = TAB_SHARE * Math.min(cellWidth, cellHeight);
      for (const cell of jigsawCut(PICTURE_BOX, grid, seededRandom(17))) {
        const out = {
          left: cell.rect.x - cell.ink.x,
          top: cell.rect.y - cell.ink.y,
          right: cell.ink.x + cell.ink.width - (cell.rect.x + cell.rect.width),
          bottom: cell.ink.y + cell.ink.height - (cell.rect.y + cell.rect.height),
        };
        for (const [side, distance] of Object.entries(out)) {
          expect(distance, `${grid.columns}x${grid.rows} ${side}`).toBeGreaterThanOrEqual(-1e-9);
          expect(distance, `${grid.columns}x${grid.rows} ${side}`).toBeLessThanOrEqual(tab + 1e-9);
        }
      }
    }
  });

  it("gives every piece one tab on each axis at most, and never none at all", () => {
    // The size rule. The biggest piece is what the tray packs by and the
    // smallest is what a hand has to find, so the two are held within one tab
    // of each other: a piece with four tabs would shrink the board, and a
    // piece with none would be the one too small to grab. Every deal, not the
    // lucky ones.
    for (const grid of GRIDS) {
      const cellWidth = PICTURE_BOX.width / grid.columns;
      const cellHeight = PICTURE_BOX.height / grid.rows;
      const tab = TAB_SHARE * Math.min(cellWidth, cellHeight);
      for (let seed = 0; seed < 30; seed++) {
        for (const cell of jigsawCut(PICTURE_BOX, grid, seededRandom(seed))) {
          const wide = cell.ink.width - cellWidth;
          const tall = cell.ink.height - cellHeight;
          const where = `${grid.columns}x${grid.rows} seed ${seed} piece ${cell.row}-${cell.column}`;
          expect(wide, where).toBeLessThanOrEqual(tab + 1e-9);
          expect(tall, where).toBeLessThanOrEqual(tab + 1e-9);
          expect(Math.max(wide, tall), where).toBeGreaterThan(tab / 2);
        }
      }
    }
  });

  it("cuts the same picture differently from one game to the next, and the same from a seed", () => {
    const grid = { columns: 3, rows: 3 };
    const cut = (seed: number): string =>
      jigsawCut(PICTURE_BOX, grid, seededRandom(seed))
        .map((cell) => edgePath(cell.edges))
        .join("|");
    expect(new Set(Array.from({ length: 20 }, (_, seed) => cut(seed))).size).toBeGreaterThan(1);
    expect(cut(6)).toBe(cut(6));
  });

  it("refuses a grid with no pieces in it", () => {
    expect(() => jigsawCut(PICTURE_BOX, { columns: 0, rows: 2 })).toThrow(/at least one/i);
  });
});

describe("a picture as shapes", () => {
  const pictures = loadPictures();

  it("mints a frame and one piece per cell, each with an id of its own", () => {
    for (const picture of pictures) {
      for (const grid of GRIDS) {
        const { frame, pieces } = jigsawShapes(picture, grid, seededRandom(2));
        expect(pieces).toHaveLength(grid.columns * grid.rows);
        expect(frame.id).toBe(frameId(picture));
        assertUniquePieceIds([frame, ...pieces], `${picture.id} ${grid.columns}x${grid.rows}`);
      }
    }
  });

  it("draws every piece from the picture, through the outline it was cut with", () => {
    const picture = pictureFor("farmyard");
    const grid = { columns: 3, rows: 2 };
    const cells = jigsawCut(picture.box, grid, seededRandom(9));
    const { frame, pieces } = jigsawShapes(picture, grid, seededRandom(9));
    pieces.forEach((piece, index) => {
      const cell = cells[index]!;
      // Cutting is clipping: the artwork is the scene's own markup, held in a
      // clip path made from the piece's outline. Nothing is redrawn per grid.
      expect(piece.artwork).toContain(picture.artwork);
      expect(piece.artwork).toContain("clip-path");
      expect(piece.artwork).toContain(`d="${piece.outline}"`);
      expect(piece.outline).toBe(edgePath(cell.edges));
      // And every piece carries the whole picture and the picture's own
      // anchor, which is what makes the pieces assemble by construction.
      expect(piece.box).toEqual(picture.box);
      expect(piece.anchor).toEqual(frame.anchor);
      expect(piece.inked).toEqual(cell.ink);
    });
  });
});

const levelWith = (grid: Grid): LevelSpec =>
  JIGSAW_LEVELS.find(
    (level) =>
      level.options?.grid?.columns === grid.columns && level.options.grid.rows === grid.rows,
  )!;

const dealt = (level: LevelSpec, seed = 1): Puzzle =>
  jigsaw.deal({ level, shapes: [] }, seededRandom(seed));

describe("the jigsaw kind", () => {
  it("plays every grid the table asks for", () => {
    const asked = new Set(
      JIGSAW_LEVELS.map((level) => `${level.options?.grid?.columns}x${level.options?.grid?.rows}`),
    );
    expect([...asked].sort()).toEqual(["2x2", "3x2", "3x3", "4x3"]);
  });

  it("deals one picture and one piece per cell", () => {
    for (const level of JIGSAW_LEVELS) {
      for (let seed = 0; seed < 6; seed++) {
        const puzzle = dealt(level, seed);
        expect(puzzle.targets, `level ${level.level}`).toHaveLength(1);
        expect(puzzle.pieces, `level ${level.level}`).toHaveLength(level.pieces);
        assertUniquePieceIds(puzzle.pieces, `level ${level.level}`);
      }
    }
  });

  it("deals the pieces out of order", () => {
    // The tray is not the picture laid out in reading order, which would make
    // the puzzle a copying exercise rather than a puzzle.
    const level = levelWith({ columns: 4, rows: 3 });
    const shuffled = Array.from({ length: 12 }, (_, seed) =>
      dealt(level, seed)
        .pieces.map((piece) => piece.id)
        .join(","),
    );
    expect(new Set(shuffled).size).toBeGreaterThan(1);
  });

  it("refuses a level that asks for more than one picture, or names none", () => {
    const level = levelWith({ columns: 2, rows: 2 });
    expect(() => dealt({ ...level, targets: 2 })).toThrow(/1 target/i);
    const { scene: _scene, ...noScene } = level.options ?? {};
    expect(() => dealt({ ...level, options: noScene })).toThrow(/no scene/i);
    const { grid: _grid, ...noGrid } = level.options ?? {};
    expect(() => dealt({ ...level, options: noGrid })).toThrow(/no grid/i);
    expect(() => dealt({ ...level, pieces: 5 })).toThrow(/grid is its piece count/i);
  });

  it("cuts one hole, and stands every piece in it at the picture's own scale", () => {
    for (const level of JIGSAW_LEVELS) {
      const puzzle = dealt(level, 4);
      for (const id of ["landscape", "portrait"] as const) {
        const layout = buildLevelLayout(id, level, puzzle.pieces, puzzle.targets);
        expect(layout.holes.size, `level ${level.level} ${id}`).toBe(1);
        const whole = boxOf(layout, puzzle.targets[0]!.id);
        const origin = holeOf(layout, puzzle.targets[0]!.id);
        for (const piece of puzzle.pieces) {
          expect(boxOf(layout, piece.id).scale, piece.id).toBe(whole.scale);
          expect(jigsaw.target(puzzle, layout, piece.id), piece.id).toEqual(origin);
        }
      }
    }
  });

  it("keeps the picture showing under the frame until the last piece is home", () => {
    // A blank frame is a memory game. The guide is what makes a jigsaw
    // something a two-year-old can see the answer to.
    const level = levelWith({ columns: 3, rows: 3 });
    const puzzle = dealt(level, 8);
    const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
    const guide = jigsaw.backdrop(puzzle, layout);
    expect(guide).toContain(pictureFor(level.options!.scene!).artwork);
    expect(guide).toContain("opacity: 1");
    for (const piece of puzzle.pieces) {
      expect(guide, piece.id).toContain(`class="cell" data-piece="${piece.id}"`);
    }
    const half = { ...puzzle, placed: new Set(puzzle.pieces.slice(1).map((piece) => piece.id)) };
    expect(jigsaw.isComplete(half)).toBe(false);
    expect(jigsaw.backdrop(half, layout)).toContain("opacity: 1");
    const built = { ...puzzle, placed: new Set(puzzle.pieces.map((piece) => piece.id)) };
    expect(jigsaw.isComplete(built)).toBe(true);
    expect(jigsaw.backdrop(built, layout)).toContain("opacity: 0");
  });

  it("takes a sloppy drop on a piece's own place, and refuses one a cell away", () => {
    for (const level of JIGSAW_LEVELS) {
      const puzzle = dealt(level, 12);
      for (const id of ["landscape", "portrait"] as const) {
        const layout = buildLevelLayout(id, level, puzzle.pieces, puzzle.targets);
        const home = holeOf(layout, puzzle.targets[0]!.id);
        const { scale } = boxOf(layout, puzzle.targets[0]!.id);
        const grid = level.options!.grid!;
        const cell = {
          width: (PICTURE_BOX.width / grid.columns) * scale,
          height: (PICTURE_BOX.height / grid.rows) * scale,
        };
        for (const piece of puzzle.pieces) {
          const { reach } = boxOf(layout, piece.id);
          expect(jigsaw.accepts(puzzle, layout, piece.id, home), piece.id).toBe(true);
          const near = { x: home.x + reach.width * 0.45, y: home.y - reach.height * 0.45 };
          expect(jigsaw.accepts(puzzle, layout, piece.id, near), piece.id).toBe(true);
          // A whole cell out is another piece's place, and is not taken.
          for (const away of [
            { x: home.x + cell.width, y: home.y },
            { x: home.x, y: home.y + cell.height },
          ]) {
            expect(jigsaw.accepts(puzzle, layout, piece.id, away), `${piece.id} ${id}`).toBe(false);
          }
        }
      }
    }
  });
});
