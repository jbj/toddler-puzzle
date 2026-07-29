/**
 * Jigsaws: a hand-drawn picture cut into interlocking pieces, and put back
 * together in the frame it came out of.
 *
 * The chapter after the shape pictures, and the third kind to fill one target
 * with several pieces. What it borrows from the two before it:
 *
 *  - a level deals one *picture* (`pictures.ts`), which is the single target,
 *    and the cutter's pieces are the pieces (`jigsaw.ts`);
 *  - every piece carries the whole picture box and the picture's anchor, so
 *    they assemble by construction: each settles onto the same origin, and the
 *    pieces meet where the cut divided them rather than where arithmetic put
 *    them;
 *  - a piece is only ever accepted by its own place, so there is no way to be
 *    wrong.
 *
 * What is its own is the guide. **The picture stays under the empty frame**,
 * faintly, with the cut lines drawn over it, and a child assembles a picture
 * they can already see rather than filling in a blank rectangle. A jigsaw with
 * nothing underneath is a memory game; at two years old the game is to see
 * where a piece goes, and the guide is what makes that possible. It fades only
 * once the last piece is home, exactly as a sliced animal's hole does.
 *
 * The other difference from slices is where a piece may be dropped. A slice is
 * accepted anywhere on its animal, because a quarter of a duck has no home of
 * its own worth insisting on. A piece of a picture does have one - it is the
 * bit with the tractor in it - so a piece is measured against *its own cell*,
 * at the game's ordinary two thirds of the piece being dropped. On a 2x2 board
 * that circle is most of the picture; on a 4x3 it is most of a cell in every
 * direction. Generous, and still a placement.
 */
import { boxCenter, distance, shuffle, type Point } from "../geometry";
import { boxOf, holeOf, inkSnapRadius, type Layout } from "../layout";
import type { Grid } from "../jigsaw";
import { jigsawShapes } from "../jigsaw";
import type { LevelSpec } from "../levels";
import type { PieceId, PieceShape } from "../piece";
import { pictureFor, type Picture } from "../pictures";
import type { Deal, Puzzle, PuzzleKind } from "../puzzle";
import { renderScenery } from "../scenery";

const ID = "jigsaw" as const;

/** A dealt jigsaw: the picture it cut up, and the frame the pieces fill. */
interface JigsawPuzzle extends Puzzle {
  readonly picture: Picture;
  readonly grid: Grid;
  readonly frame: PieceShape;
}

const asJigsaw = (puzzle: Puzzle): JigsawPuzzle => puzzle as JigsawPuzzle;

/**
 * The grid this level cuts at. The table is the only thing that decides how
 * hard a level is, so a jigsaw level with no grid, or with one that does not
 * account for its pieces, is a mistake in the table rather than something to
 * guess a way around.
 */
function gridOf(level: LevelSpec): Grid {
  const grid = level.options?.grid;
  if (!grid) {
    throw new Error(`Level ${level.level} is a jigsaw but names no grid to cut its picture at.`);
  }
  if (grid.columns * grid.rows !== level.pieces) {
    throw new Error(
      `Level ${level.level} cuts a picture into ${grid.columns}x${grid.rows} but deals ` +
        `${level.pieces} pieces; a jigsaw's grid is its piece count.`,
    );
  }
  return grid;
}

/** The scene this level cuts up. */
function pictureOf(level: LevelSpec): Picture {
  const scene = level.options?.scene;
  if (scene === undefined) {
    throw new Error(`Level ${level.level} is a jigsaw but names no scene to cut up.`);
  }
  return pictureFor(scene);
}

/**
 * The frame, with the picture showing faintly through it and every cut drawn
 * on. Three layers, and each is doing a job:
 *
 *  - the picture itself, dimmed, so the child can see what they are making;
 *  - one outline per piece, so they can see where each piece goes - the *same*
 *    path the piece is clipped out of, so a piece covers its own line exactly;
 *  - the border, so the picture reads as a thing to fill even before any of it
 *    is filled.
 *
 * Dimmed rather than hidden while it is being filled, and gone once it is full:
 * a rim peeking out from under a finished picture is untidy, but the guide
 * under a half-built one is the whole point.
 */
function frame(puzzle: JigsawPuzzle, layout: Layout, filled: boolean): string {
  const { frame: picture } = puzzle;
  const { scale } = boxOf(layout, picture.id);
  const origin = holeOf(layout, picture.id);
  const cells = puzzle.pieces
    .map(
      (piece) =>
        `<path class="cell" data-piece="${piece.id}" d="${piece.outline}"
           fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="5" />`,
    )
    .join("");
  return `
    <g class="hole" data-piece="${picture.id}"
       transform="translate(${origin.x} ${origin.y}) scale(${scale})"
       style="opacity: ${filled ? 0 : 1}">
      <path d="${picture.outline}" fill="#1f3b34" opacity="0.3" />
      <g opacity="0.34">${picture.artwork}</g>
      ${cells}
      <path d="${picture.outline}" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="8" />
    </g>
  `;
}

/** Where a piece's drawing sits, given the top-left of its box. */
function inkCentre(layout: Layout, piece: PieceId, at: Point): Point {
  const { ink } = boxOf(layout, piece);
  return boxCenter({ x: at.x + ink.x, y: at.y + ink.y }, ink);
}

export const jigsaw: PuzzleKind = {
  id: ID,

  deal({ level }: Deal, random: () => number): Puzzle {
    // A jigsaw builds one picture. A row saying otherwise would put holes on
    // the board for pieces that all belong in the same one.
    if (level.targets !== 1) {
      throw new Error(
        `Level ${level.level} asks for ${level.targets} jigsaw pictures; a jigsaw level ` +
          `fills one, so its row must say 1 target and however many pieces it cuts into.`,
      );
    }
    const picture = pictureOf(level);
    const grid = gridOf(level);
    const { frame: whole, pieces } = jigsawShapes(picture, grid, random);

    const puzzle: JigsawPuzzle = {
      kind: ID,
      level,
      // Shuffled, so the tray is not the picture laid out in reading order,
      // which would make the puzzle a copying exercise.
      pieces: shuffle(pieces, random),
      targets: [whole],
      placed: new Set<PieceId>(),
      picture,
      grid,
      frame: whole,
    };
    return puzzle;
  },

  /** The landscape, with the picture waiting to be rebuilt in it. */
  backdrop(puzzle: Puzzle, layout: Layout): string {
    const jig = asJigsaw(puzzle);
    return `${renderScenery(layout)}<g class="holes">${frame(jig, layout, isBuilt(puzzle))}</g>`;
  },

  /**
   * Every piece settles onto the picture's own origin. That is the whole trick
   * and it is worth saying plainly: a piece is drawn where it belongs inside a
   * box the size of the whole picture, so putting the box where the picture
   * goes puts the piece where it goes.
   */
  target(puzzle: Puzzle, layout: Layout): Point {
    return holeOf(layout, asJigsaw(puzzle).frame.id);
  },

  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean {
    const home = holeOf(layout, asJigsaw(puzzle).frame.id);
    // Both measured from what the piece *draws*: its box is the whole picture,
    // and two thirds of that would take a corner piece dropped on the far side.
    return (
      distance(inkCentre(layout, piece, at), inkCentre(layout, piece, home)) <=
      inkSnapRadius(layout, piece)
    );
  },

  isComplete(puzzle: Puzzle): boolean {
    return isBuilt(puzzle);
  },
};

/** Is every piece of the picture home? */
function isBuilt(puzzle: Puzzle): boolean {
  return puzzle.pieces.every((piece) => puzzle.placed.has(piece.id));
}
