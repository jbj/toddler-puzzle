import { describe, expect, it } from "vitest";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor } from "../src/assets";
import { seededRandom } from "../src/geometry";
import { STAGE_COUNT, buildStageLayout, holeOf, stageSize, type Layout } from "../src/layout";
import { shapeMatch } from "../src/kinds/shape-match";
import { pieceId, type PieceShape } from "../src/piece";
import type { Puzzle } from "../src/puzzle";

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
function castsFor(stage: number): PieceShape[][] {
  const size = stageSize(stage);
  return SHAPES.map((_, offset) =>
    Array.from({ length: size }, (_, index) => SHAPES[(offset + index) % SHAPES.length]!),
  );
}

/** A puzzle standing on a given cast, as if the kind had dealt exactly that. */
function puzzleOf(stage: number, cast: readonly PieceShape[]): Puzzle {
  return { kind: shapeMatch.id, stage, pieces: cast, placed: new Set() };
}

/** Every stage, both orientations, across a representative spread of casts. */
const CASES: { puzzle: Puzzle; layout: Layout }[] = [];
for (let stage = 1; stage <= STAGE_COUNT; stage++) {
  for (const id of ORIENTATIONS) {
    for (const cast of castsFor(stage)) {
      CASES.push({ puzzle: puzzleOf(stage, cast), layout: buildStageLayout(id, stage, cast) });
    }
  }
}

describe("shape-match deal", () => {
  it("deals the stage's pieces, none of them placed yet", () => {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      const puzzle = shapeMatch.deal({ stage, shapes: SHAPES }, seededRandom(stage + 1));
      expect(puzzle.kind).toBe(shapeMatch.id);
      expect(puzzle.stage).toBe(stage);
      expect(puzzle.pieces).toHaveLength(stageSize(stage));
      expect(new Set(puzzle.pieces.map((shape) => shape.id)).size).toBe(puzzle.pieces.length);
      for (const shape of puzzle.pieces) expect(SHAPES).toContain(shape);
      expect(puzzle.placed.size).toBe(0);
    }
  });

  it("repeats exactly for the same seed, so a run can be replayed", () => {
    const deal = (seed: number): string =>
      shapeMatch
        .deal({ stage: 2, shapes: SHAPES }, seededRandom(seed))
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
        // Well short of the snap radius, but nowhere near exact.
        const sloppy = { x: hole.x + layout.snapRadius * 0.6, y: hole.y };
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
      const fresh = puzzleOf(puzzle.stage, puzzle.pieces);
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
      const filled = puzzleOf(puzzle.stage, puzzle.pieces);
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
