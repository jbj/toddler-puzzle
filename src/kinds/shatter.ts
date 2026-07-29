/**
 * Shatter: a hand-drawn picture broken into irregular shards, and put back
 * together in the frame it came out of.
 *
 * The last kind, and the mastery chapter's own. Everything about how it is
 * played it shares with the jigsaw (`kinds/jigsaw.ts`): one picture is the
 * single target, every piece carries the whole picture box and the picture's
 * anchor so the shards assemble by construction, the picture stays showing
 * faintly under the empty frame with every cut drawn on it, and a piece is
 * accepted near its own place at the game's ordinary two thirds of the piece
 * being dropped.
 *
 * What is different is the cut, and it changes what the child is doing.
 * A jigsaw's pieces are all the same rectangle, so the only thing telling two
 * of them apart is the picture inside: the game is to read the content. A
 * shatter's pieces are all different shapes, so the game is to match an outline
 * to a hole - which is the skill the shape-match chapters spent twenty levels
 * building. That is why the harder-looking kind is the gentler one to end on,
 * and why the partition's guarantees are about *shape* rather than about
 * content: every shard convex, none of them a splinter, and no two alike
 * (`shatter.ts`).
 */
import { boxCenter, distance, shuffle, type Point } from "../geometry";
import { boxOf, holeOf, inkSnapRadius, type Layout } from "../layout";
import type { LevelSpec } from "../levels";
import type { PieceId, PieceShape } from "../piece";
import { pictureGuide } from "../picture-pieces";
import { pictureFor, type Picture } from "../pictures";
import type { Deal, Puzzle, PuzzleKind } from "../puzzle";
import { renderScenery } from "../scenery";
import { shatterShapes } from "../shatter";

const ID = "shatter" as const;

/** A dealt shatter: the picture it broke up, and the frame the shards fill. */
interface ShatterPuzzle extends Puzzle {
  readonly picture: Picture;
  readonly frame: PieceShape;
}

const asShatter = (puzzle: Puzzle): ShatterPuzzle => puzzle as ShatterPuzzle;

/** The scene this level shatters. */
function pictureOf(level: LevelSpec): Picture {
  const scene = level.options?.scene;
  if (scene === undefined) {
    throw new Error(`Level ${level.level} is a shatter but names no scene to break up.`);
  }
  return pictureFor(scene);
}

/** The empty frame, with the picture and every cut showing faintly under it. */
function frame(puzzle: ShatterPuzzle, layout: Layout, filled: boolean): string {
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

export const shatter: PuzzleKind = {
  id: ID,

  deal({ level }: Deal, random: () => number): Puzzle {
    // One picture, however many shards it is in. A row saying otherwise would
    // put holes on the board for pieces that all belong in the same one.
    if (level.targets !== 1) {
      throw new Error(
        `Level ${level.level} asks for ${level.targets} shattered pictures; a shatter level ` +
          `fills one, so its row must say 1 target and however many pieces it breaks into.`,
      );
    }
    if (level.pieces < 2) {
      throw new Error(
        `Level ${level.level} shatters a picture into ${level.pieces}; a picture in one ` +
          `piece is not a puzzle.`,
      );
    }
    const picture = pictureOf(level);
    const { frame: whole, pieces } = shatterShapes(picture, level.pieces, random);

    const puzzle: ShatterPuzzle = {
      kind: ID,
      // Shuffled, so the tray is not the picture in the order it was cut.
      pieces: shuffle(pieces, random),
      level,
      targets: [whole],
      placed: new Set<PieceId>(),
      picture,
      frame: whole,
    };
    return puzzle;
  },

  /** The landscape, with the picture waiting to be put back together in it. */
  backdrop(puzzle: Puzzle, layout: Layout): string {
    const broken = asShatter(puzzle);
    return `${renderScenery(layout)}<g class="holes">${frame(broken, layout, isWhole(puzzle))}</g>`;
  },

  /**
   * Every shard settles onto the picture's own origin: a piece is drawn where
   * it belongs inside a box the size of the whole picture, so putting the box
   * where the picture goes puts the piece where it goes.
   */
  target(puzzle: Puzzle, layout: Layout, _piece: PieceId): Point {
    return holeOf(layout, asShatter(puzzle).frame.id);
  },

  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean {
    const home = holeOf(layout, asShatter(puzzle).frame.id);
    // Both measured from what the piece *draws*: its box is the whole picture,
    // and two thirds of that would take a shard dropped on the far side.
    return (
      distance(inkCentre(layout, piece, at), inkCentre(layout, piece, home)) <=
      inkSnapRadius(layout, piece)
    );
  },

  isComplete(puzzle: Puzzle): boolean {
    return isWhole(puzzle);
  },
};

/** Is every shard of the picture home? */
function isWhole(puzzle: Puzzle): boolean {
  return puzzle.pieces.every((piece) => puzzle.placed.has(piece.id));
}
