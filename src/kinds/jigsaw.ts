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
 * once the last piece is home, exactly as a sliced animal's hole does. The
 * guide is drawn by `picture-pieces.ts`, because a shattered picture wants the
 * same one.
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
import { pictureBackdrop, pictureGuide } from "../picture-pieces";
import type { LevelSpec } from "../levels";
import type { PieceId, PieceShape } from "../piece";
import { pictureFor, type Picture } from "../pictures";
import type { Deal, Puzzle, PuzzleKind } from "../puzzle";

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

/** The empty frame, with the picture and every cut showing faintly under it. */
function frame(puzzle: JigsawPuzzle, layout: Layout, filled: boolean): string {
  const { frame: picture } = puzzle;
  return pictureGuide(picture, puzzle.pieces, {
    origin: holeOf(layout, picture.id),
    scale: boxOf(layout, picture.id).scale,
    filled,
  });
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

  /** Flat colour, with the picture waiting to be rebuilt on it. */
  backdrop(puzzle: Puzzle, layout: Layout): string {
    const jig = asJigsaw(puzzle);
    return `${pictureBackdrop(layout)}<g class="holes">${frame(jig, layout, isBuilt(puzzle))}</g>`;
  },

  /**
   * Every piece settles onto the picture's own origin. That is the whole trick
   * and it is worth saying plainly: a piece is drawn where it belongs inside a
   * box the size of the whole picture, so putting the box where the picture
   * goes puts the piece where it goes.
   */
  target(puzzle: Puzzle, layout: Layout, _piece: PieceId): Point {
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
