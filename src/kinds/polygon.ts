/**
 * Polygon scenes: a house, a boat, a rocket, built out of plain coloured
 * shapes dropped into the shadows of a finished picture.
 *
 * The bridge between the two kinds either side of it. In shape-match one piece
 * *is* one whole animal; in a sliced level several pieces are fragments of one.
 * Here several pieces make one picture and each of them is still a whole thing
 * a child can name - a square, a triangle, a circle - so the shape names come
 * along without anybody making a lesson of them.
 *
 * The mechanics follow the sliced kind, because the problem is the same one:
 *
 *  - a level deals one *scene* (`scenes.ts`), which is the single target, and
 *    the scene's parts are the pieces;
 *  - every part is drawn in the scene's own box at the scene's scale, so the
 *    parts assemble by construction rather than by arithmetic;
 *  - the backdrop holds one shadow per *place* in the picture, cut from that
 *    part's own outline, and each shadow disappears as it is filled.
 *
 * What is new is the one thing the issue is about. **Two identical shapes are
 * interchangeable.** A house has two square walls; a train has three wheels; a
 * flower has four petals. A child who drops a petal on the wrong petal-shaped
 * shadow has done something visibly right, and this game never answers that
 * with "no". So a piece is accepted by any *free* place whose shape matches it,
 * and the puzzle remembers which one it chose:
 *
 *  - `placeOf` maps every piece to the place it is aimed at, and is always a
 *    bijection. Taking somebody else's place hands them yours, which keeps it
 *    one, so the picture always has exactly one shape headed for each shadow;
 *  - the host tells a kind about a drop twice - `accepts`, then `settle` - and
 *    it is `settle` that writes the swap down, because `target` is asked
 *    afterwards, again on every re-render, and again after the tablet is
 *    turned, long after the finger has gone.
 *
 * Two parts count as identical when their form and size match, and `scenes.ts`
 * guarantees that two such parts are painted identically as well - otherwise
 * swapping them would change the picture. See
 * [decision 20260729T090200](../../docs/decisions/20260729T090200-two-shapes-the-same-are-the-same-piece.md).
 */
import { distance, shuffle, type Point, type Size } from "../geometry";
import { boxOf, gripCentre, holeOf, onTarget, type Layout } from "../layout";
import type { PieceId } from "../piece";
import type { Deal, Puzzle, PuzzleKind } from "../puzzle";
import { renderScenery } from "../scenery";
import {
  SCENES,
  boundsOf,
  outlineOf,
  sceneById,
  sceneShapes,
  signatureOf,
  type Scene,
} from "../scenes";

const ID = "polygon" as const;

/** What a row could have named, for a message that has to say so. */
const catalogue = (): string => SCENES.map((scene) => scene.id).join(", ");

/** A shadow in the picture: where it is, how big, and what fits it. */
interface Place {
  /** Top-left of the shadow, in scene-box units. */
  readonly origin: Point;
  readonly size: Size;
  /** What a piece has to be to fill it (`scenes.ts` mints these). */
  readonly signature: string;
}

/**
 * A dealt polygon level. `homeOf` is where each piece was drawn, which never
 * changes; `placeOf` is where it is going, which does.
 */
interface PolygonPuzzle extends Puzzle {
  readonly scene: Scene;
  readonly places: readonly Place[];
  readonly homeOf: ReadonlyMap<PieceId, number>;
  readonly placeOf: Map<PieceId, number>;
}

const asPolygon = (puzzle: Puzzle): PolygonPuzzle => puzzle as PolygonPuzzle;

/** The picture every piece of this puzzle is part of. */
function pictureOf(puzzle: PolygonPuzzle): PieceId {
  const picture = puzzle.targets[0];
  if (!picture) throw new Error("A polygon puzzle stands one picture; this one has none.");
  return picture.id;
}

function placeAt(puzzle: PolygonPuzzle, index: number): Place {
  const place = puzzle.places[index];
  if (!place) throw new Error(`Place ${index} is not in this ${puzzle.scene.id} scene.`);
  return place;
}

/** Where a piece was drawn. A piece with no home is not from this scene. */
function homeIndex(puzzle: PolygonPuzzle, piece: PieceId): number {
  const index = puzzle.homeOf.get(piece);
  if (index === undefined) throw new Error(`Piece "${piece}" is not part of this scene.`);
  return index;
}

/** Where a piece is headed now. */
function placeIndex(puzzle: PolygonPuzzle, piece: PieceId): number {
  const index = puzzle.placeOf.get(piece);
  if (index === undefined) throw new Error(`Piece "${piece}" is not part of this scene.`);
  return index;
}

/** Which piece is aimed at a place. There is always exactly one. */
function pieceFor(puzzle: PolygonPuzzle, index: number): PieceId {
  for (const [piece, place] of puzzle.placeOf) {
    if (place === index) return piece;
  }
  throw new Error(`No piece is aimed at place ${index} of the ${puzzle.scene.id} scene.`);
}

/** Is a place already filled? Only a settled piece counts. */
const isFilled = (puzzle: PolygonPuzzle, index: number): boolean =>
  puzzle.placed.has(pieceFor(puzzle, index));

/**
 * Hand `piece` the place at `index`, and hand whoever was aimed there the place
 * `piece` is giving up. Both are pieces of one picture and the two places want
 * the same shape, so the swap is invisible - which is the point.
 */
function take(puzzle: PolygonPuzzle, piece: PieceId, index: number): void {
  const from = placeIndex(puzzle, piece);
  if (from === index) return;
  const other = pieceFor(puzzle, index);
  puzzle.placeOf.set(other, from);
  puzzle.placeOf.set(piece, index);
}

/**
 * Where this piece's box would sit if it took `index`: the picture's own
 * corner, shifted by however far that place is from the place the piece was
 * drawn in. What `target` answers for the place a piece is aimed at now, and
 * what the rule is asked about for a place it might be.
 */
function homeFor(puzzle: PolygonPuzzle, layout: Layout, piece: PieceId, index: number): Point {
  const { scale } = boxOf(layout, piece);
  const origin = holeOf(layout, pictureOf(puzzle));
  const from = placeAt(puzzle, homeIndex(puzzle, piece)).origin;
  const to = placeAt(puzzle, index).origin;
  return {
    x: origin.x + (to.x - from.x) * scale,
    y: origin.y + (to.y - from.y) * scale,
  };
}

/**
 * Which place this drop chose: the nearest free one that wants this shape and
 * that the drop is on target for, or null for a drop that counts as nothing.
 *
 * The rule is the host's (`onTarget`), asked once per candidate place, so a
 * thin triangle is judged by the same thickened box everything else is. Nearest
 * is the tie-break between two places the drop is on target for, which two
 * congruent shadows close together can be. `accepts` and `settle` both ask
 * this, so what is accepted and what is recorded cannot come apart.
 */
function chosen(puzzle: PolygonPuzzle, layout: Layout, piece: PieceId, at: Point): number | null {
  const dropped = gripCentre(layout, piece, at);
  const wanted = placeAt(puzzle, homeIndex(puzzle, piece)).signature;

  let best: number | null = null;
  let nearest = Infinity;
  for (let index = 0; index < puzzle.places.length; index++) {
    if (placeAt(puzzle, index).signature !== wanted) continue;
    if (isFilled(puzzle, index)) continue;
    const home = homeFor(puzzle, layout, piece, index);
    if (!onTarget(layout, piece, at, home)) continue;
    const away = distance(dropped, gripCentre(layout, piece, home));
    if (away < nearest) {
      best = index;
      nearest = away;
    }
  }
  return best;
}

/**
 * One shadow. Its `data-piece` is whichever piece is aimed at it *now*, so the
 * markup follows the swaps; the host re-renders the backdrop after every
 * placement, which is what keeps that true.
 */
function hole(puzzle: PolygonPuzzle, layout: Layout, index: number): string {
  const picture = pictureOf(puzzle);
  const { scale } = boxOf(layout, picture);
  const origin = holeOf(layout, picture);
  const part = puzzle.scene.parts[index];
  if (!part) throw new Error(`Place ${index} is not in this ${puzzle.scene.id} scene.`);
  // The part's outline is already in scene-box units, and the hole origin is
  // where that box stands, so the picture's own transform places it exactly.
  const outline = outlineOf(part);
  return `
    <g class="hole" data-piece="${pieceFor(puzzle, index)}"
       transform="translate(${origin.x} ${origin.y}) scale(${scale})"
       style="opacity: ${isFilled(puzzle, index) ? 0 : 1}">
      <path d="${outline}" fill="#1f3b34" opacity="0.24" />
      <path d="${outline}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="5" />
    </g>
  `;
}

export const polygon: PuzzleKind = {
  id: ID,

  deal({ level }: Deal, random: () => number): Puzzle {
    // A polygon level builds one picture. The table saying otherwise is a
    // mistake in the table rather than something to make the best of.
    if (level.targets !== 1) {
      throw new Error(
        `Level ${level.level} asks for ${level.targets} polygon pictures; a polygon level ` +
          `builds one, so its row must say 1 target and however many pieces it takes.`,
      );
    }
    // Which picture is the table's business rather than the deal's: two levels
    // of the chapter are two different pictures because the rows say so, and a
    // reader can see that without playing them. Only the order the pieces
    // arrive in is dealt fresh.
    const named = level.options?.shapePicture;
    if (!named) {
      throw new Error(
        `Level ${level.level} names no shape picture; a polygon level stands the one its ` +
          `row names, so its options must say which of ${catalogue()}.`,
      );
    }
    const scene = sceneById(named);
    if (!scene) {
      throw new Error(
        `No shape picture is called "${named}" (level ${level.level}); ` +
          `the catalogue holds ${catalogue()}.`,
      );
    }
    if (scene.parts.length !== level.pieces) {
      throw new Error(
        `Level ${level.level} asks for ${level.pieces} pieces but "${scene.id}" is built ` +
          `from ${scene.parts.length}; a picture arrives whole or not at all.`,
      );
    }

    const { picture, parts } = sceneShapes(scene);
    const places = scene.parts.map((part) => ({
      origin: { x: part.at.x, y: part.at.y },
      size: { width: boundsOf(part).width, height: boundsOf(part).height },
      signature: signatureOf(part),
    }));
    const homeOf = new Map(parts.map((part, index) => [part.id, index]));

    const puzzle: PolygonPuzzle = {
      kind: ID,
      level,
      // Shuffled because a tray cell is cut for the piece that waits in it, so
      // the order they are dealt in is the order the child sees them in.
      pieces: shuffle(parts, random),
      targets: [picture],
      placed: new Set<PieceId>(),
      scene,
      places,
      homeOf,
      // Everything starts out aimed where it was drawn. Play moves it about.
      placeOf: new Map(homeOf),
    };
    return puzzle;
  },

  /** The landscape, with the picture's shadows waiting in it. */
  backdrop(puzzle: Puzzle, layout: Layout): string {
    const scene = asPolygon(puzzle);
    const holes = scene.places.map((_, index) => hole(scene, layout, index)).join("");
    return `${renderScenery(layout)}<g class="holes">${holes}</g>`;
  },

  /**
   * Where a piece settles: the picture's own corner, shifted by however far the
   * place it is aimed at is from the place it was drawn in. A piece that never
   * swapped is drawn exactly where the scene put it, and the shift is zero.
   */
  target(puzzle: Puzzle, layout: Layout, piece: PieceId): Point {
    const scene = asPolygon(puzzle);
    return homeFor(scene, layout, piece, placeIndex(scene, piece));
  },

  /**
   * Every free shadow that wants this piece's shape - which is exactly the set
   * `chosen` would pick from, so a hint cannot point somewhere a drop would be
   * refused, or fail to point somewhere it would be taken.
   *
   * Always includes the place the piece is aimed at now, because that place is
   * congruent with its home by construction and an unplaced piece never fills
   * anything. So this is a superset of `target`, and shrinks as its twins fill
   * up.
   */
  openTargets(puzzle: Puzzle, layout: Layout, piece: PieceId): readonly Point[] {
    const scene = asPolygon(puzzle);
    const wanted = placeAt(scene, homeIndex(scene, piece)).signature;
    const open: Point[] = [];
    for (let index = 0; index < scene.places.length; index++) {
      if (placeAt(scene, index).signature !== wanted) continue;
      if (isFilled(scene, index)) continue;
      open.push(homeFor(scene, layout, piece, index));
    }
    return open;
  },

  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean {
    return chosen(asPolygon(puzzle), layout, piece, at) !== null;
  },

  settle(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): void {
    const scene = asPolygon(puzzle);
    const index = chosen(scene, layout, piece, at);
    if (index !== null) take(scene, piece, index);
  },

  isComplete(puzzle: Puzzle): boolean {
    return puzzle.pieces.every((part) => puzzle.placed.has(part.id));
  },
};
