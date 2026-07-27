/**
 * What a kind of puzzle is.
 *
 * `game.ts` is a host, not a rulebook: it owns dragging, settling, sound,
 * sparkles and the stage lifecycle, and asks a `PuzzleKind` for everything that
 * differs between one sort of level and another - which pieces are dealt, what
 * sits behind them, whether a drop counts, and when the level is over.
 *
 * Shape-match (`kinds/shape-match.ts`) is the first implementation. A jigsaw
 * cutter, a tangram or a cause-and-effect level can be another without the host
 * learning anything about them.
 */
import type { Point } from "./geometry";
import type { Layout } from "./layout";
import type { PieceId, PieceShape } from "./piece";

/** What the host asks for when it wants a level dealt. */
export interface LevelSpec {
  /** 1-based stage, which is what decides how many pieces are in play. */
  readonly stage: number;
  /** The shapes on offer. A kind may deal from these or cut its own. */
  readonly shapes: readonly PieceShape[];
}

/**
 * A dealt level: the pieces, and how far through it the child is. A kind is
 * free to extend this with state of its own - the host only ever passes a
 * puzzle back to the kind that dealt it.
 */
export interface Puzzle {
  /** The `id` of the kind that dealt this. */
  readonly kind: string;
  readonly stage: number;
  /** The pieces in play, in layout order. */
  readonly pieces: readonly PieceShape[];
  /**
   * Pieces the host has settled into place. The host records an accepted drop
   * here; what that means for the level is `isComplete`'s business.
   */
  readonly placed: Set<PieceId>;
}

export interface PuzzleKind {
  readonly id: string;

  /** Deal a level: the pieces, and where each one belongs. */
  deal(level: LevelSpec, random: () => number): Puzzle;

  /**
   * Markup for everything that sits behind the pieces - the scene and whatever
   * the pieces are aimed at. The host re-renders it whenever the puzzle moves
   * on, so a kind can show a target differently once it is filled.
   */
  backdrop(puzzle: Puzzle, layout: Layout): string;

  /** Top-left of the box an accepted piece settles into. */
  target(puzzle: Puzzle, layout: Layout, piece: PieceId): Point;

  /**
   * Does this drop count? `at` is the top-left of the piece's box where the
   * finger let go. Kinds decide their own forgiveness.
   */
  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean;

  /**
   * Is the level finished? Not every kind is "all pieces placed": a
   * cause-and-effect level ends when enough things have been touched.
   */
  isComplete(puzzle: Puzzle): boolean;
}
