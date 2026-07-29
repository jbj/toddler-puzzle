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
 * (`kinds/shape-match.ts`) was the first implementation; sliced animals,
 * polygon scenes, cause-and-effect play, jigsaws and shattered pictures are the
 * others, and none of them taught the host anything about itself.
 *
 * There are two ways to be a kind. Most of them are *dragged*: pieces wait in
 * the tray and the host's drag engine offers each drop to `accepts`. A kind
 * that implements `play` is *touched* instead - it draws its own things and
 * answers a finger directly, and the host builds no tray pieces for it and
 * never drags anything. Both end the same way, through `isComplete`.
 */
import type { Point } from "./geometry";
import type { Layout } from "./layout";
import type { LevelSpec, PuzzleKindId } from "./levels";
import type { PieceId, PieceShape } from "./piece";

/** What the host asks for when it wants a level dealt. */
export interface Deal {
  /**
   * The level as it will be played: the table's record. `level.pieces` is how
   * many to deal.
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
   * Every place this piece would be accepted *right now*, for a hint to point
   * at. Top-left of each, like `target`, and never empty for an unplaced piece.
   *
   * The mirror image of `settle`. A kind that has a choice of place must
   * implement this, because a hint that names one of several equally right
   * places teaches the child a rule the game does not have - and the child who
   * is being hinted at is in no position to discover that the rule was a lie.
   * Most kinds have no choice to offer, so the host falls back to `target`
   * alone and they need not implement it.
   */
  openTargets?(puzzle: Puzzle, layout: Layout, piece: PieceId): readonly Point[];

  /**
   * Does this drop count? `at` is the top-left of the piece's box where the
   * finger let go. Kinds decide their own forgiveness.
   */
  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean;

  /**
   * Where a kind with a *choice* of place records the one this drop chose.
   * Called by the host between an accepted drop and settling the piece, and
   * only then, so what `target` answers afterwards - here, on the next render,
   * and after a turn of the tablet - is the place the child actually aimed at.
   *
   * Most kinds have nothing to record: a piece has one hole and `target`
   * already knows it. A polygon scene does, because two identical shapes may
   * fill either of two identical shadows, and the drop point is the only thing
   * that says which (`kinds/polygon.ts`). A kind that implements this should
   * implement `openTargets` too: the same choice that has to be written down
   * has to be pointed at.
   */
  settle?(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): void;

  /**
   * Is the level finished? Not every kind is "all pieces placed": a
   * cause-and-effect level ends when enough things have been touched.
   */
  isComplete(puzzle: Puzzle): boolean;

  /**
   * Take over the board and play the level by touch rather than by drag.
   *
   * A kind that implements this is telling the host three things: build no
   * pieces for the tray, start no drag engine, and hand over a layer of its
   * own. Everything a child can touch is then the kind's - it draws it, it
   * answers it, and it says what it sounded like. The host's part is what it
   * always was: the sparkle, the level ending, and the big button afterwards.
   *
   * Called once per mounted board, so again after the tablet is turned; the
   * puzzle it is given is the same one, so how far the child got survives.
   * Whatever is returned is called before the next board goes up, which is
   * where a timer or an interval has to be let go of.
   */
  play?(puzzle: Puzzle, layout: Layout, host: ActivityHost): () => void;
}

/**
 * What the host lends a kind that plays by touch. Deliberately thin: the kind
 * owns the drawing and the rules, and this is the two things it cannot do for
 * itself - draw somewhere that is cleared up for it, and tell the host that the
 * puzzle moved on.
 */
export interface ActivityHost {
  /**
   * The layer to draw the touchable things into: empty when handed over, and
   * torn down with the board. It sits above the backdrop and below the effects,
   * so a burst drawn by the host still lands on top.
   */
  readonly layer: SVGGElement;
  /**
   * Something was touched and the puzzle moved on. The host sparkles there and
   * asks `isComplete` whether that was the last one. Sound is the kind's own,
   * because only the kind knows whether that was a pop or a quack.
   */
  touched(at: Point): void;
}
