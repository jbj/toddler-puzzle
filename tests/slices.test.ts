/**
 * Slicing an animal, and the levels made of slices.
 *
 * Two halves, and they are different sorts of thing:
 *
 *  - the cells are pure geometry, and what is checked is that they *tile* the
 *    art box. A gap between two cells is a stripe of the animal that no slice
 *    draws; an overlap is a stripe two slices both draw. Either one is a seam
 *    the child can see, and neither shows up in a screenshot of a duck that is
 *    almost right, so it is checked by arithmetic against every committed
 *    recipe rather than by eye;
 *  - the kind is rules, and what is checked is the promise the chapter is built
 *    on: every slice of an animal aims at that animal's one hole, from the same
 *    box at the same scale, so a finished animal is the animal.
 *
 * Where the cuts actually go is not checked here. That is measured from pixels
 * by `npm run art:check`, which is the only thing that can see whether a cut
 * severed a leg.
 */
import { describe, expect, it } from "vitest";
import { ANIMAL_IDS, ART_BOX } from "../src/assets";
import { boxCenter, seededRandom } from "../src/geometry";
import { buildLevelLayout, holeOf, boxOf } from "../src/layout";
import { sliced } from "../src/kinds/sliced";
import { LEVELS, type LevelSpec } from "../src/levels";
import { inkOf, pieceId, assertUniquePieceIds, type PieceShape } from "../src/piece";
import { SLICE_COUNTS, cellArea, cellsFrom, sliceRecipe, sliceShapes } from "../src/slices";

/**
 * Stand-in animals rather than the real assets: parsing SVG needs a DOM, and
 * nothing here cares what an animal looks like - only that it has a box, an
 * anchor and an id the recipe table knows.
 */
const SHAPES: readonly PieceShape[] = ANIMAL_IDS.map((id) => ({
  id: pieceId(id),
  outline: `outline-of-${id}`,
  artwork: `artwork-of-${id}`,
  box: { width: ART_BOX, height: ART_BOX },
  anchor: { x: ART_BOX / 2, y: 200 },
  label: id,
  themes: ["farm", "jungle", "sea"] as const,
}));

const shapeOf = (id: string): PieceShape => SHAPES.find((shape) => shape.id === id)!;

/** Is a point inside a convex cell? Corners and edges count as inside. */
function isInside(cell: readonly { x: number; y: number }[], x: number, y: number): boolean {
  for (let index = 0; index < cell.length; index++) {
    const from = cell[index]!;
    const to = cell[(index + 1) % cell.length]!;
    const cross = (to.x - from.x) * (y - from.y) - (to.y - from.y) * (x - from.x);
    if (cross < -1e-6) return false;
  }
  return true;
}

describe("cells", () => {
  const everyRecipe = ANIMAL_IDS.flatMap((animal) =>
    SLICE_COUNTS.map((count) => ({ animal, count, recipe: sliceRecipe(animal, count) })),
  );

  it("has a recipe for every animal, in every number of slices", () => {
    expect(everyRecipe).toHaveLength(ANIMAL_IDS.length * SLICE_COUNTS.length);
    for (const { animal, count, recipe } of everyRecipe) {
      expect(recipe.cuts, `${animal} in ${count}`).toHaveLength(count - 1);
      expect(recipe.ink, `${animal} in ${count}`).toHaveLength(count);
    }
  });

  it("makes one cell per slice", () => {
    for (const { animal, count, recipe } of everyRecipe) {
      expect(cellsFrom(recipe.cuts).length, `${animal} in ${count}`).toBe(count);
    }
  });

  it("covers the art box exactly, with nothing left over and nothing twice", () => {
    // Areas summing to the box is the whole of it for convex cells: short would
    // be a gap, over would be an overlap, and both at once cannot happen
    // without one cell reaching outside the box, which a half-plane cut of the
    // box cannot do.
    for (const { animal, count, recipe } of everyRecipe) {
      const total = cellsFrom(recipe.cuts).reduce((sum, cell) => sum + cellArea(cell), 0);
      expect(total, `${animal} in ${count}`).toBeCloseTo(ART_BOX * ART_BOX, 3);
    }
  });

  it("puts every point of the art box in exactly one cell", () => {
    // The same promise again, from the other side, because an arithmetic
    // identity can be satisfied by two mistakes that cancel. A point on a cut
    // is allowed to belong to both cells it divides - that is a shared edge,
    // not an overlap - so the grid is deliberately off the round numbers the
    // cuts land on.
    for (const { animal, count, recipe } of everyRecipe) {
      const cells = cellsFrom(recipe.cuts);
      for (let x = 3.7; x < ART_BOX; x += 17) {
        for (let y = 5.3; y < ART_BOX; y += 17) {
          const holding = cells.filter((cell) => isInside(cell, x, y));
          expect(holding.length, `${animal} in ${count} at ${x},${y}`).toBe(1);
        }
      }
    }
  });

  it("draws every slice somewhere inside the art box", () => {
    for (const { animal, count, recipe } of everyRecipe) {
      for (const ink of recipe.ink) {
        expect(ink.width, `${animal} in ${count}`).toBeGreaterThan(0);
        expect(ink.height, `${animal} in ${count}`).toBeGreaterThan(0);
        expect(ink.x).toBeGreaterThanOrEqual(0);
        expect(ink.y).toBeGreaterThanOrEqual(0);
        expect(ink.x + ink.width).toBeLessThanOrEqual(ART_BOX);
        expect(ink.y + ink.height).toBeLessThanOrEqual(ART_BOX);
      }
    }
  });
});

describe("slices of an animal", () => {
  it("keeps the animal's box, anchor and outline, whichever slice it is", () => {
    // This is the whole trick, and it is worth saying out loud: laid out, every
    // slice of an animal gets one scale and one origin, so they assemble into
    // the animal without anything having to work out where the parts go.
    for (const animal of SHAPES) {
      for (const count of SLICE_COUNTS) {
        for (const slice of sliceShapes(animal, count)) {
          expect(slice.box).toEqual(animal.box);
          expect(slice.anchor).toEqual(animal.anchor);
          expect(slice.outline).toBe(animal.outline);
        }
      }
    }
  });

  it("gives each slice its own drawing to be grabbed by", () => {
    for (const animal of SHAPES) {
      for (const count of SLICE_COUNTS) {
        const slices = sliceShapes(animal, count);
        expect(slices).toHaveLength(count);
        assertUniquePieceIds(slices, `${animal.id} in ${count}`);
        for (const slice of slices) {
          const ink = inkOf(slice);
          expect(ink).not.toEqual({ x: 0, y: 0, width: ART_BOX, height: ART_BOX });
          expect(ink.width).toBeGreaterThan(0);
        }
      }
    }
  });

  it("draws the animal's own artwork, through its own cell", () => {
    // Clipped, never cut: whatever a slice draws, it is the animal's artwork
    // that it draws, so the parts cannot fail to match along their edge.
    for (const slice of sliceShapes(shapeOf("duck"), 3)) {
      expect(slice.artwork).toContain("artwork-of-duck");
      expect(slice.artwork).toContain("clip-path");
    }
  });

  it("refuses a count nobody measured a recipe for", () => {
    expect(() => sliceShapes(shapeOf("duck"), 5 as 4)).toThrow(/no slice recipe/i);
  });
});

describe("the sliced kind", () => {
  const slicedLevels = LEVELS.filter((level) => level.kind === "sliced");
  const dealOf = (level: LevelSpec, run: number) =>
    sliced.deal({ level, shapes: SHAPES }, seededRandom(run));

  it("plays levels of its own", () => {
    expect(slicedLevels.length).toBeGreaterThan(0);
  });

  it("deals one target per animal and one piece per slice", () => {
    for (const level of slicedLevels) {
      for (let run = 0; run < 8; run++) {
        const puzzle = dealOf(level, run);
        expect(puzzle.targets, `level ${level.level}`).toHaveLength(level.targets);
        expect(puzzle.pieces, `level ${level.level}`).toHaveLength(level.pieces);
        assertUniquePieceIds(puzzle.pieces, `level ${level.level}`);
      }
    }
  });

  it("cuts each animal into the same number of slices", () => {
    for (const level of slicedLevels) {
      const puzzle = dealOf(level, 1);
      for (const animal of puzzle.targets) {
        const mine = puzzle.pieces.filter((slice) => slice.id.startsWith(`slice:${animal.id}:`));
        expect(mine, `level ${level.level}`).toHaveLength(level.pieces / level.targets);
      }
    }
  });

  it("refuses a level whose slices do not divide into its animals", () => {
    const level = { ...LEVELS[10]!, targets: 3, pieces: 8 };
    expect(() => dealOf(level, 0)).toThrow(/sliced level cuts into/i);
  });

  it("aims every slice of an animal at that animal's one hole", () => {
    for (const level of slicedLevels) {
      const puzzle = dealOf(level, 3);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
      expect(layout.holes.size).toBe(level.targets);
      for (const animal of puzzle.targets) {
        const home = holeOf(layout, animal.id);
        for (const slice of puzzle.pieces) {
          if (!slice.id.startsWith(`slice:${animal.id}:`)) continue;
          expect(sliced.target(puzzle, layout, slice.id)).toEqual(home);
          expect(boxOf(layout, slice.id).scale).toBe(boxOf(layout, animal.id).scale);
        }
      }
    }
  });

  it("takes a slice dropped anywhere on its animal, and nowhere else", () => {
    const level = slicedLevels.find((one) => one.targets === 2)!;
    const puzzle = dealOf(level, 5);
    const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
    const [first, second] = puzzle.targets;

    for (const slice of puzzle.pieces) {
      const mine = slice.id.startsWith(`slice:${first!.id}:`) ? first! : second!;
      const theirs = mine === first! ? second! : first!;
      const { size, snapRadius } = boxOf(layout, slice.id);

      // Dead centre, and well off centre but still on the animal: a slice does
      // not have to find the quarter of the hole it came out of.
      expect(sliced.accepts(puzzle, layout, slice.id, holeOf(layout, mine.id))).toBe(true);
      const nudged = holeOf(layout, mine.id);
      expect(
        sliced.accepts(puzzle, layout, slice.id, {
          x: nudged.x + snapRadius * 0.6,
          y: nudged.y - snapRadius * 0.6,
        }),
      ).toBe(true);

      // The other animal's hole is never a home, however close the board puts
      // the two: a piece can only ever be right.
      const wrong = holeOf(layout, theirs.id);
      const apart = Math.hypot(
        boxCenter(wrong, size).x - boxCenter(holeOf(layout, mine.id), size).x,
        boxCenter(wrong, size).y - boxCenter(holeOf(layout, mine.id), size).y,
      );
      if (apart > snapRadius) expect(sliced.accepts(puzzle, layout, slice.id, wrong)).toBe(false);
    }
  });

  it("is over when the last slice is home, and not before", () => {
    const level = slicedLevels.find((one) => one.pieces === 4)!;
    const puzzle = dealOf(level, 7);
    for (const slice of puzzle.pieces) {
      expect(sliced.isComplete(puzzle)).toBe(false);
      puzzle.placed.add(slice.id);
    }
    expect(sliced.isComplete(puzzle)).toBe(true);
  });

  it("leaves the hole showing until its last slice arrives", () => {
    // The guide under a half-built animal is the point of the chapter: a child
    // who cannot read has to be able to see what is still missing.
    const level = slicedLevels.find((one) => one.targets === 1)!;
    const puzzle = dealOf(level, 9);
    const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
    const shown = () => (sliced.backdrop(puzzle, layout).includes("opacity: 1") ? 1 : 0);

    expect(shown()).toBe(1);
    for (const slice of puzzle.pieces.slice(0, -1)) puzzle.placed.add(slice.id);
    expect(shown()).toBe(1);
    puzzle.placed.add(puzzle.pieces.at(-1)!.id);
    expect(shown()).toBe(0);
  });
});
