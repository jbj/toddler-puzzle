/**
 * What a kind of puzzle is.
 *
 * `game.ts` is a host, not a rulebook: it owns dragging, settling, sound,
 * sparkles and the level lifecycle, and asks a `PuzzleKind` for everything that
 * differs between one sort of level and another - which pieces are dealt, what
 * sits behind them, whether a drop counts, and when the level is over.
 *
 * Which kind plays a given level comes from the level table (`levels.ts`) by
 * way of the registry (`kinds/registry.ts`). Shape-match
 * (`kinds/shape-match.ts`) is the first implementation and, until the others
 * are built, the stand-in for all of them. A jigsaw cutter, a tangram or a
 * cause-and-effect level can be another without the host learning anything
 * about them.
 */
import type { Point } from "./geometry";
import type { Layout } from "./layout";
import type { LevelSpec, PuzzleKindId } from "./levels";
import type { PieceId, PieceShape } from "./piece";

/** What the host asks for when it wants a level dealt. */
export interface Deal {
  /**
   * The level as it will be played - the table's record, or the stand-in the
   * registry substituted for it. `level.pieces` is how many to deal.
   */
  readonly level: LevelSpec;
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
  readonly kind: PuzzleKindId;
  /** The level this was dealt for, as played. */
  readonly level: LevelSpec;
  /** The pieces in play, in layout order. */
  readonly pieces: readonly PieceShape[];
  /**
   * What those pieces are aimed at: the shapes the layout stands in the scene,
   * one hole each, in layout order. Usually the pieces themselves - one animal,
   * one hole - but a sliced level aims several slices at one animal, so a kind
   * says which shapes the holes are cut from rather than the host assuming.
   */
  readonly targets: readonly PieceShape[];
  /**
   * Pieces the host has settled into place. The host records an accepted drop
   * here; what that means for the level is `isComplete`'s business.
   */
  readonly placed: Set<PieceId>;
}

export interface PuzzleKind {
  /** The id the level table names this kind by. */
  readonly id: PuzzleKindId;

  /** Deal a level: the pieces, and where each one belongs. */
  deal(deal: Deal, random: () => number): Puzzle;

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
