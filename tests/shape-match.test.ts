import { describe, expect, it } from "vitest";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor } from "../src/assets";
import { seededRandom } from "../src/geometry";
import { boxOf, buildLevelLayout, holeOf, type Layout } from "../src/layout";
import { LEVELS, type LevelSpec } from "../src/levels";
import { shapeMatch } from "../src/kinds/shape-match";
import { pieceId, type PieceShape } from "../src/piece";
import type { Puzzle } from "../src/puzzle";

/** The levels shape-match plays. */
const ANIMAL_LEVELS = LEVELS.filter((level) => level.kind === shapeMatch.id);

/**
 * The shape-match level that deals this many pieces. Several checks below
 * assemble a cast by hand rather than dealing one, so they need a level of a
 * particular size to hang it on. Retuning the table can take that size away -
 * which is fine, but it has to say so here rather than handing on `undefined`
 * and failing somewhere else entirely.
 */
function animalLevelOf(pieces: number): LevelSpec {
  const level = ANIMAL_LEVELS.find((one) => one.pieces === pieces);
  if (!level) {
    throw new Error(
      `No shape-match level deals ${pieces} pieces. These tests need one; ` +
        `pick a count LEVELS still has, or add a level that deals ${pieces}.`,
    );
  }
  return level;
}

/** A level of three pieces, for the casts assembled here rather than dealt. */
const THREE_PIECE_LEVEL = animalLevelOf(3);

const ORIENTATIONS = ["landscape", "portrait"] as const;

/**
 * Shapes standing in for the animals. Each outline is fake but unique - names
 * alone would not be, since "rabbit" and "turtle" are the same length - which is
 * what lets the backdrop test check that a hole is cut from the very path its
 * own piece is drawn from, rather than from some other piece's.
 */
const SHAPES: readonly PieceShape[] = ANIMAL_IDS.map((id, index) => ({
  id: pieceId(id),
  outline: `M0 0 h${index + 1} v10 z`,
  artwork: "",
  box: ANIMAL_BOX,
  anchor: animalAnchor(id),
  label: id,
}));

/**
 * The deal is random, so every check below runs against a rotation of the list
 * that puts each shape in each place at least once.
 */
function castsFor(level: LevelSpec): PieceShape[][] {
  return SHAPES.map((_, offset) =>
    Array.from({ length: level.pieces }, (_, index) => SHAPES[(offset + index) % SHAPES.length]!),
  );
}

/** A puzzle standing on a given cast, as if the kind had dealt exactly that. */
function puzzleOf(level: LevelSpec, cast: readonly PieceShape[]): Puzzle {
  return { kind: shapeMatch.id, level, pieces: cast, targets: cast, placed: new Set() };
}

/**
 * Pieces that are not square, in both directions. Every animal is authored
 * square, so without these the rules below could go on measuring a drop against
 * one square piece size and nobody would notice.
 */
const PLANK: PieceShape = {
  id: pieceId("test:plank"),
  outline: "M0 0 h300 v100 z",
  artwork: "",
  box: { width: 300, height: 100 },
  anchor: { x: 150, y: 100 },
  label: "plank",
};

const POLE: PieceShape = {
  id: pieceId("test:pole"),
  outline: "M0 0 h100 v300 z",
  artwork: "",
  box: { width: 100, height: 300 },
  anchor: { x: 50, y: 300 },
  label: "pole",
};

const MIXED: readonly PieceShape[] = [PLANK, POLE, SHAPES[0]!];

/** Every level, both orientations, across a representative spread of casts. */
const CASES: { puzzle: Puzzle; layout: Layout }[] = [];
for (const level of ANIMAL_LEVELS) {
  for (const id of ORIENTATIONS) {
    for (const cast of castsFor(level)) {
      CASES.push({ puzzle: puzzleOf(level, cast), layout: buildLevelLayout(id, level, cast) });
    }
  }
}
// The same rules, against a cast that is not square: every rule below holds for
// a piece of any proportions or it does not hold at all.
for (const id of ORIENTATIONS) {
  CASES.push({
    puzzle: puzzleOf(THREE_PIECE_LEVEL, MIXED),
    layout: buildLevelLayout(id, THREE_PIECE_LEVEL, MIXED),
  });
}

describe("shape-match deal", () => {
  it("deals the level's pieces, none of them placed yet", () => {
    for (const level of ANIMAL_LEVELS) {
      const puzzle = shapeMatch.deal({ level, shapes: SHAPES }, seededRandom(level.level + 1));
      expect(puzzle.kind).toBe(shapeMatch.id);
      expect(puzzle.level).toBe(level);
      expect(puzzle.pieces).toHaveLength(level.pieces);
      expect(new Set(puzzle.pieces.map((shape) => shape.id)).size).toBe(puzzle.pieces.length);
      for (const shape of puzzle.pieces) expect(SHAPES).toContain(shape);
      expect(puzzle.placed.size).toBe(0);
    }
  });

  it("repeats exactly for the same seed, so a run can be replayed", () => {
    const deal = (seed: number): string =>
      shapeMatch
        .deal({ level: THREE_PIECE_LEVEL, shapes: SHAPES }, seededRandom(seed))
        .pieces.map((shape) => shape.id)
        .join();
    expect(deal(7)).toBe(deal(7));
    expect(deal(7)).not.toBe(deal(8));
  });
});

describe("shape-match rules", () => {
  it("settles a piece exactly on its own hole", () => {
    for (const { puzzle, layout } of CASES) {
      for (const shape of puzzle.pieces) {
        expect(shapeMatch.target(puzzle, layout, shape.id)).toEqual(holeOf(layout, shape.id));
      }
    }
  });

  it("accepts a sloppy drop near a piece's own hole", () => {
    for (const { puzzle, layout } of CASES) {
      for (const shape of puzzle.pieces) {
        const hole = holeOf(layout, shape.id);
        // Well short of this piece's own snap radius, but nowhere near exact.
        const reach = boxOf(layout, shape.id).snapRadius * 0.6;
        const sloppy = { x: hole.x + reach, y: hole.y };
        expect(shapeMatch.accepts(puzzle, layout, shape.id, sloppy)).toBe(true);
      }
    }
  });

  it("never lets a piece into somebody else's hole", () => {
    for (const { puzzle, layout } of CASES) {
      for (const shape of puzzle.pieces) {
        for (const other of puzzle.pieces) {
          if (other.id === shape.id) continue;
          expect(shapeMatch.accepts(puzzle, layout, shape.id, holeOf(layout, other.id))).toBe(
            false,
          );
        }
      }
    }
  });

  it("sends a drop left out in the tray back home", () => {
    for (const { puzzle, layout } of CASES) {
      for (const shape of puzzle.pieces) {
        for (const slot of layout.traySlots) {
          expect(shapeMatch.accepts(puzzle, layout, shape.id, slot)).toBe(false);
        }
      }
    }
  });

  it("is complete only once every piece is standing in its hole", () => {
    for (const { puzzle, layout } of CASES) {
      const fresh = puzzleOf(puzzle.level, puzzle.pieces);
      for (const shape of fresh.pieces) {
        expect(shapeMatch.isComplete(fresh)).toBe(false);
        fresh.placed.add(shape.id);
      }
      expect(shapeMatch.isComplete(fresh)).toBe(true);
      // Sanity: a completed level still points every piece at its own hole.
      expect(fresh.pieces.map((shape) => shapeMatch.target(fresh, layout, shape.id))).toEqual(
        fresh.pieces.map((shape) => holeOf(layout, shape.id)),
      );
    }
  });
});

describe("shape-match with pieces that are not square", () => {
  for (const id of ORIENTATIONS) {
    const layout = buildLevelLayout(id, THREE_PIECE_LEVEL, MIXED);
    const puzzle = puzzleOf(THREE_PIECE_LEVEL, MIXED);

    describe(`${id} layout`, () => {
      it("is just as forgiving sideways as it is up and down", () => {
        for (const shape of MIXED) {
          const hole = holeOf(layout, shape.id);
          const reach = boxOf(layout, shape.id).snapRadius * 0.6;
          for (const drop of [
            { x: hole.x + reach, y: hole.y },
            { x: hole.x - reach, y: hole.y },
            { x: hole.x, y: hole.y + reach },
            { x: hole.x, y: hole.y - reach },
          ]) {
            expect(shapeMatch.accepts(puzzle, layout, shape.id, drop)).toBe(true);
          }
        }
      });

      it("turns down a drop past the piece's own radius on either axis", () => {
        for (const shape of MIXED) {
          const hole = holeOf(layout, shape.id);
          const beyond = boxOf(layout, shape.id).snapRadius * 1.2;
          for (const drop of [
            { x: hole.x + beyond, y: hole.y },
            { x: hole.x, y: hole.y + beyond },
          ]) {
            expect(shapeMatch.accepts(puzzle, layout, shape.id, drop)).toBe(false);
          }
        }
      });

      it("does not stretch a wide piece's forgiveness over its short axis", () => {
        // A radius taken from the plank's width would reach three times further
        // than the plank is tall, so a drop a whole plank clear of the hole
        // would still snap in. Measured against its own height, it does not.
        const hole = holeOf(layout, PLANK.id);
        const { size } = boxOf(layout, PLANK.id);
        const drop = { x: hole.x, y: hole.y + size.width * 0.68 };
        expect(shapeMatch.accepts(puzzle, layout, PLANK.id, drop)).toBe(false);
      });
    });
  }
});

describe("shape-match backdrop", () => {
  /** Each hole's own markup, keyed by the piece it was cut for. */
  const holeBlocks = (markup: string): Map<string, string> =>
    new Map(
      [...markup.matchAll(/<g class="hole" data-piece="([^"]+)"[\s\S]*?<\/g>/g)].map((match) => [
        match[1] as string,
        match[0],
      ]),
    );

  it("cuts one hole per piece, from the piece's own outline", () => {
    for (const { puzzle, layout } of CASES) {
      const blocks = holeBlocks(shapeMatch.backdrop(puzzle, layout));
      expect([...blocks.keys()].sort()).toEqual(puzzle.pieces.map((shape) => shape.id).sort());
      for (const shape of puzzle.pieces) {
        // Checked against this piece's own hole, not the markup at large, so a
        // hole cut from the wrong outline or standing in the wrong place fails.
        const block = blocks.get(shape.id) as string;
        const hole = holeOf(layout, shape.id);
        const paths = [...block.matchAll(/ d="([^"]*)"/g)].map((match) => match[1]);
        // Every path in a hole is the piece's own outline: that is the
        // invariant that stops a piece drifting out of the hole it drops into.
        expect(paths.length).toBeGreaterThan(0);
        for (const path of paths) expect(path).toBe(shape.outline);
        expect(block).toContain(`translate(${hole.x} ${hole.y})`);
      }
    }
  });

  it("hides a hole once its piece covers it, and no other", () => {
    for (const { puzzle, layout } of CASES) {
      const filled = puzzleOf(puzzle.level, puzzle.pieces);
      const first = filled.pieces[0]!;
      filled.placed.add(first.id);
      const blocks = holeBlocks(shapeMatch.backdrop(filled, layout));
      expect(blocks.size).toBe(filled.pieces.length);
      for (const [id, block] of blocks) {
        expect(block).toContain(`opacity: ${id === first.id ? 0 : 1}`);
      }
    }
  });

  it("still draws the scenery behind the holes", () => {
    for (const { puzzle, layout } of CASES) {
      const markup = shapeMatch.backdrop(puzzle, layout);
      const scenery = markup.indexOf('fill="url(#sky)"');
      expect(scenery).toBeGreaterThan(-1);
      // Holes are cut into the scene, so they must come after it in document
      // order or the landscape would paint over them.
      expect(markup.indexOf('class="hole"')).toBeGreaterThan(scenery);
    }
  });
});
