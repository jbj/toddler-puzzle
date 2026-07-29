/**
 * Shape-match: drop each piece onto the matching hole in the landscape.
 *
 * The original game, and the first implementation of `PuzzleKind`. Everything
 * animal- or hole-shaped lives here:
 *
 *  - a level deals a random cast, and the order they are dealt in decides which
 *    hole each one stands in;
 *  - the backdrop is the scenery with those holes cut into it;
 *  - a piece is only ever accepted by its own hole, so there is no way to put
 *    the wrong animal somewhere and be told off for it;
 *  - dropping near enough counts as in;
 *  - the level ends when every piece is standing in its hole.
 */
import { boxCenter, isWithinSnapRadius, type Point } from "../geometry";
import { holeOf, boxOf, type Layout } from "../layout";
import { dealPieces } from "../levels";
import type { PieceId, PieceShape } from "../piece";
import type { Deal, Puzzle, PuzzleKind } from "../puzzle";
import { renderScenery } from "../scenery";

const ID = "shape-match" as const;

/**
 * One hole cut into the scene. Drawn from the shape's own `outline`, the very
 * path the piece is drawn from, so a piece cannot drift out of alignment with
 * the hole it drops into.
 *
 * A filled hole is hidden rather than removed: the piece now covers it exactly,
 * and hiding it stops the rim peeking out from underneath.
 */
function hole(shape: PieceShape, layout: Layout, filled: boolean): string {
  // Authored units -> logical units, at this piece's own scale.
  const { scale } = boxOf(layout, shape.id);
  const origin = holeOf(layout, shape.id);
  return `
    <g class="hole" data-piece="${shape.id}"
       transform="translate(${origin.x} ${origin.y}) scale(${scale})"
       style="opacity: ${filled ? 0 : 1}">
      <path d="${shape.outline}" fill="#1f3b34" opacity="0.24" />
      <path d="${shape.outline}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="5" />
    </g>
  `;
}

export const shapeMatch: PuzzleKind = {
  id: ID,

  deal({ level, shapes }: Deal, random: () => number): Puzzle {
    const pieces = dealPieces(level, shapes, random);
    return {
      kind: ID,
      level,
      pieces,
      // One animal, one hole: every piece is its own target.
      targets: pieces,
      placed: new Set<PieceId>(),
    };
  },

  /** The landscape, with a hole cut for every piece of this level. */
  backdrop(puzzle: Puzzle, layout: Layout): string {
    const holes = puzzle.pieces
      .map((shape) => hole(shape, layout, puzzle.placed.has(shape.id)))
      .join("");
    return `${renderScenery(layout)}<g class="holes">${holes}</g>`;
  },

  target(_puzzle: Puzzle, layout: Layout, piece: PieceId): Point {
    return holeOf(layout, piece);
  },

  accepts(_puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean {
    // Both centres are measured with this piece's own bounds, so the snap point
    // stays inside the piece however wide or thin it happens to be.
    const { size, snapRadius } = boxOf(layout, piece);
    const center = boxCenter(holeOf(layout, piece), size);
    return isWithinSnapRadius(boxCenter(at, size), center, snapRadius);
  },

  isComplete(puzzle: Puzzle): boolean {
    return puzzle.pieces.every((shape) => puzzle.placed.has(shape.id));
  },
};
