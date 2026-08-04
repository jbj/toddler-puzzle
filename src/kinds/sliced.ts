/**
 * Before changing this file, read docs/cutting.md.
 *
 * Sliced animals: one animal arrives in two to four pieces, and the child puts
 * it back together in its own animal-shaped hole.
 *
 * The chapter after shape-match, and the first level of the game that asks for
 * a picture rather than a match. What changes is only that several pieces now
 * share a target:
 *
 *  - a level deals one or two animals - the *targets* - and cuts each into
 *    slices, which are the pieces;
 *  - the scene holds one hole per animal, cut from that animal's own
 *    silhouette and divided by the same cuts the slices were clipped with, and
 *    it stays visible under the slices as a guide to what is being built and to
 *    where each piece of it goes;
 *  - every slice of an animal is drawn in the animal's box at the animal's
 *    scale, and aims at that one hole. So the slices assemble by construction:
 *    each one settles onto the same origin, and the parts meet where the
 *    clipping cut them, not where arithmetic put them;
 *  - a slice is only ever accepted by its own animal, so there is still no way
 *    to be wrong;
 *  - and it is placed by the same rule as every other piece: its own box, where
 *    the finger let go, over the middle of its own place in the animal. The
 *    box is generous - a slice too thin to aim at is thickened before anything
 *    measures it - but a quarter of a duck now goes where that quarter goes.
 *
 * How the slices are cut is `slices.ts`, and where the cuts go is measured
 * offline; neither is this file's business.
 */
import { shuffle, type Point } from "../geometry";
import { holeOf, boxOf, onTarget, type Layout } from "../layout";
import { dealTargets } from "../levels";
import type { PieceId, PieceShape } from "../piece";
import type { Deal, Puzzle, PuzzleKind } from "../puzzle";
import { renderScenery } from "../scenery";
import { SLICE_COUNTS, SLICE_EDGE_WIDTH, sliceCuts, sliceShapes, type SliceCount } from "../slices";

const ID = "sliced" as const;

/**
 * A dealt sliced level, plus the two things the rules need that the host has no
 * word for: which animal each slice came off, and where that animal was cut.
 * Everything else - the hole, the scale, the origin - follows from the first.
 */
interface SlicedPuzzle extends Puzzle {
  readonly animalOf: ReadonlyMap<PieceId, PieceId>;
  readonly cutsOf: ReadonlyMap<PieceId, readonly string[]>;
}

const asSliced = (puzzle: Puzzle): SlicedPuzzle => puzzle as SlicedPuzzle;

/**
 * How many slices each animal is cut into. The level table says how many things
 * there are to fill and how many pieces fill them; the ratio is the answer, and
 * a table entry whose numbers do not divide is a mistake in the table rather
 * than something to round.
 */
function sliceCount({ level, targets, pieces }: Deal["level"]): SliceCount {
  const count = pieces / targets;
  if (!SLICE_COUNTS.includes(count as SliceCount)) {
    throw new Error(
      `Level ${level} asks for ${pieces} slices across ${targets} animals, which is ` +
        `${count} each; a sliced level cuts into ${SLICE_COUNTS.join(", ")}.`,
    );
  }
  return count as SliceCount;
}

/**
 * The hole one animal is assembled in. Drawn from the animal's own outline, the
 * very path each of its slices is clipped out of, so the finished animal covers
 * its hole exactly.
 *
 * The cuts are drawn on it, exactly as a jigsaw's frame shows the lines its
 * pieces will land on (`picture-pieces.ts`). They are the same paths the slices
 * were clipped with, clipped in turn to the silhouette so a cut stops where the
 * animal does, and drawn at the width a slice's own white edge is - so a slice
 * arriving home covers its guide line rather than sitting beside it. Without
 * them a two-year-old has to guess where the half of a cow they are holding
 * ends; with them the hole says where each piece goes, which is what every
 * other cut-up puzzle in the game already does.
 *
 * The lines are drawn opaque inside a faded group rather than each one faded,
 * because two neighbouring cells share their cut: two half-transparent strokes
 * along one line would come out darker than the rest and read as a cut that is
 * not there. Inside the group the second stroke of a shared cut lands on
 * pixels the first already painted white, so the group fades one line rather
 * than two - measured through `rsvg-convert`, where one, two and three
 * coincident strokes come out the same colour.
 *
 * Unlike a shape-match hole this one is dimmed rather than hidden when it is
 * filled: a rim peeking out from under a whole animal is untidy, but the
 * guide under a half-built one is the whole point, so it fades only once the
 * last slice is home.
 */
function hole(shape: PieceShape, cuts: readonly string[], layout: Layout, filled: boolean): string {
  // Authored units -> logical units, at this animal's own scale.
  const { scale } = boxOf(layout, shape.id);
  const origin = holeOf(layout, shape.id);
  const clip = `hole-body-${shape.id.replaceAll(":", "-")}`;
  const lines = cuts
    .map(
      (path) =>
        `<path class="cell" d="${path}" fill="none"
           stroke="#ffffff" stroke-width="${SLICE_EDGE_WIDTH}" />`,
    )
    .join("");
  return `
    <g class="hole" data-piece="${shape.id}"
       transform="translate(${origin.x} ${origin.y}) scale(${scale})"
       style="opacity: ${filled ? 0 : 1}">
      <defs><clipPath id="${clip}"><path d="${shape.outline}" /></clipPath></defs>
      <path d="${shape.outline}" fill="#1f3b34" opacity="0.24" />
      <g class="cuts" clip-path="url(#${clip})" opacity="0.4">${lines}</g>
      <path d="${shape.outline}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="5" />
    </g>
  `;
}

export const sliced: PuzzleKind = {
  id: ID,

  deal({ level, shapes }: Deal, random: () => number): Puzzle {
    const targets = dealTargets(level, shapes, random);
    const count = sliceCount(level);

    const animalOf = new Map<PieceId, PieceId>();
    const cutsOf = new Map<PieceId, readonly string[]>();
    const slices: PieceShape[] = [];
    for (const animal of targets) {
      cutsOf.set(animal.id, sliceCuts(animal, count));
      for (const slice of sliceShapes(animal, count)) {
        animalOf.set(slice.id, animal.id);
        slices.push(slice);
      }
    }

    const puzzle: SlicedPuzzle = {
      kind: ID,
      level,
      // Shuffled, so two animals' slices are dealt into the tray mixed up
      // rather than one animal's in a row - which is the difference between
      // "put this animal together" and "copy the row above".
      pieces: shuffle(slices, random),
      targets,
      placed: new Set<PieceId>(),
      animalOf,
      cutsOf,
    };
    return puzzle;
  },

  /** The landscape, with one hole per animal being assembled. */
  backdrop(puzzle: Puzzle, layout: Layout): string {
    const dealt = asSliced(puzzle);
    const holes = puzzle.targets
      .map((animal) =>
        hole(animal, cutsFor(dealt, animal.id), layout, isAnimalComplete(dealt, animal.id)),
      )
      .join("");
    return `${renderScenery(layout)}<g class="holes">${holes}</g>`;
  },

  target(puzzle: Puzzle, layout: Layout, piece: PieceId): Point {
    return holeOf(layout, animalFor(asSliced(puzzle), piece));
  },

  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean {
    // Measured against the slice's own place inside the animal. A slice carries
    // the whole animal's box, so dropping it on the animal's origin is dropping
    // it exactly where it belongs, and the rule asks the same of it as of any
    // other piece: cover the middle of your place and you are in.
    return onTarget(layout, piece, at, holeOf(layout, animalFor(asSliced(puzzle), piece)));
  },

  isComplete(puzzle: Puzzle): boolean {
    return puzzle.pieces.every((slice) => puzzle.placed.has(slice.id));
  },
};

/** Which animal a slice belongs to. A slice with no animal is a broken deal. */
function animalFor(puzzle: SlicedPuzzle, piece: PieceId): PieceId {
  const animal = puzzle.animalOf.get(piece);
  if (animal === undefined) throw new Error(`Piece "${piece}" is not a slice of this puzzle.`);
  return animal;
}

/** Where an animal was cut. An animal with no cuts is a broken deal. */
function cutsFor(puzzle: SlicedPuzzle, animal: PieceId): readonly string[] {
  const cuts = puzzle.cutsOf.get(animal);
  if (cuts === undefined) throw new Error(`Animal "${animal}" was not cut by this puzzle.`);
  return cuts;
}

/** Is every slice of this animal home? */
function isAnimalComplete(puzzle: SlicedPuzzle, animal: PieceId): boolean {
  return puzzle.pieces
    .filter((slice) => puzzle.animalOf.get(slice.id) === animal)
    .every((slice) => puzzle.placed.has(slice.id));
}
