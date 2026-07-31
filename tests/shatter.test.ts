/**
 * Breaking a picture into shards, and the levels made of them.
 *
 * Two halves, as with the jigsaw, and they are different sorts of thing:
 *
 *  - the **cut** is pure geometry, and what is checked is the four promises the
 *    partition exists to keep. Two neighbours share their boundary *exactly*,
 *    because it is the same `Cut` object given to both of them, one of them
 *    backwards; the shards tile the picture, with no gap and no overlap; every
 *    shard is convex, so none of them has a notch a child cannot read; and none
 *    of them is a splinter - a floor under the area, a floor under the radius
 *    of the disc inside it, and a ceiling over how far it sprawls. All of it
 *    swept over many seeds and every piece count the game could ask for,
 *    because a partition is dealt fresh and "it held for one seed" is worth
 *    nothing;
 *  - the **kind** is rules, and they are the jigsaw's: every shard of one
 *    picture aims at that picture's one hole, from the same box at the same
 *    scale, so a finished shatter is the picture.
 *
 * Whether the shards actually read as things to pick up is not checked here.
 * Only `npm run shot` can see that, which is why the shot run plays a shatter.
 */
import { describe, expect, it } from "vitest";
import { seededRandom, type Point } from "../src/geometry";
import { shatter } from "../src/kinds/shatter";
import { boxOf, buildLevelLayout, holeOf } from "../src/layout";
import { LEVELS, type LevelSpec } from "../src/levels";
import { assertUniquePieceIds } from "../src/piece";
import { PICTURE_BOX, loadPictures, pictureFor } from "../src/pictures";
import type { Puzzle } from "../src/puzzle";
import {
  MAX_AREA_SHARE,
  MAX_SPREAD,
  MIN_AREA_SHARE,
  MIN_FATNESS,
  areaOf,
  frameId,
  inradiusOf,
  minInradius,
  shardPath,
  shatterCut,
  shatterShapes,
  type Cut,
  type Shard,
} from "../src/shatter";

const SHATTER_LEVELS = LEVELS.filter((level) => level.kind === "shatter");

/** Every piece count the table could ask a picture to be broken into. */
const COUNTS = [2, 3, 4, 5, 6, 7, 8, 10, 12] as const;

/** How many deals each count is swept over. A shatter is dealt fresh. */
const SEEDS = 25;

const WHOLE = PICTURE_BOX.width * PICTURE_BOX.height;

/**
 * Which way a corner turns, positive one way and negative the other, as a share
 * of the two sides meeting at it. Divided through so a hair of a corner counts
 * for as much as a long one: a shard carries a corner with no turn in it
 * wherever a neighbour's cut landed part-way along one of its sides, and a
 * straight-on corner has to read as straight however long the sides are.
 */
function turnAt(a: Point, b: Point, c: Point): number {
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const sides = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
  return sides === 0 ? 0 : cross / sides;
}

/** The lengths of a shard's sides, shortest first: its shape, without its place. */
const signatureOf = (shard: Shard): number[] =>
  shard.points
    .map((point, index) => {
      const next = shard.points[(index + 1) % shard.points.length] as Point;
      return Math.hypot(next.x - point.x, next.y - point.y);
    })
    .sort((a, b) => a - b);

/** Does this cut run along the picture's own border? */
const onBorder = ({ from, to }: Cut): boolean =>
  (from.x === to.x && (from.x === 0 || from.x === PICTURE_BOX.width)) ||
  (from.y === to.y && (from.y === 0 || from.y === PICTURE_BOX.height));

/** Every deal the sweeps run over: each count, over a spread of seeds. */
const DEALS: readonly { count: number; seed: number; shards: readonly Shard[] }[] = COUNTS.flatMap(
  (count) =>
    Array.from({ length: SEEDS }, (_, seed) => ({
      count,
      seed,
      shards: shatterCut(PICTURE_BOX, count, seededRandom(seed)),
    })),
);

describe("the cut", () => {
  it("breaks the picture into as many shards as it was asked for", () => {
    for (const { count, seed, shards } of DEALS) {
      expect(shards, `${count} pieces, seed ${seed}`).toHaveLength(count);
    }
  });

  it("leaves every shard a closed polygon inside the picture", () => {
    for (const { count, seed, shards } of DEALS) {
      for (const shard of shards) {
        const where = `${count} pieces, seed ${seed}`;
        expect(shard.points.length, where).toBeGreaterThanOrEqual(3);
        expect(shard.sides.length, where).toBe(shard.points.length);
        for (const point of shard.points) {
          expect(point.x, where).toBeGreaterThanOrEqual(-1e-9);
          expect(point.y, where).toBeGreaterThanOrEqual(-1e-9);
          expect(point.x, where).toBeLessThanOrEqual(PICTURE_BOX.width + 1e-9);
          expect(point.y, where).toBeLessThanOrEqual(PICTURE_BOX.height + 1e-9);
        }
      }
    }
  });

  it("makes every shard convex, so none of them has a notch to read past", () => {
    // Not "nearly convex": a straight line through a convex polygon leaves two
    // convex polygons, so this is what the halving buys, and it is worth
    // measuring because it is the thing a Voronoi-ish scatter would not give.
    for (const { count, seed, shards } of DEALS) {
      for (const shard of shards) {
        const turns = shard.points.map((point, index) =>
          turnAt(
            point,
            shard.points[(index + 1) % shard.points.length] as Point,
            shard.points[(index + 2) % shard.points.length] as Point,
          ),
        );
        const way = Math.sign(
          turns.reduce((most, turn) => (Math.abs(turn) > Math.abs(most) ? turn : most), 0),
        );
        for (const turn of turns) {
          expect(turn * way, `${count} pieces, seed ${seed}`).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  });

  it("gives two neighbours the same cut, one of them backwards", () => {
    // The promise the cutter exists for, and the jigsaw's word for word. Not
    // "the two outlines agree to five decimal places" but "there is only one
    // line": the shard on the far side of a cut walks the very object its
    // neighbour walked, in the other order. Nothing rounds and nothing drifts.
    for (const { count, seed, shards } of DEALS) {
      const walks = new Map<Cut, { forward: number; backward: number }>();
      for (const shard of shards) {
        for (const { cut, forward } of shard.sides) {
          const walked = walks.get(cut) ?? { forward: 0, backward: 0 };
          if (forward) walked.forward++;
          else walked.backward++;
          walks.set(cut, walked);
        }
      }
      for (const [cut, walked] of walks) {
        const where = `${count} pieces, seed ${seed}`;
        if (onBorder(cut)) {
          // The picture's own border belongs to one shard and is never
          // reversed: the outside of the picture is nobody's neighbour.
          expect(walked, where).toEqual({ forward: 1, backward: 0 });
        } else {
          expect(walked, where).toEqual({ forward: 1, backward: 1 });
        }
      }
    }
  });

  it("covers the picture exactly, with nothing left over and nothing twice", () => {
    // Areas summing to the box is the whole of it once the neighbours are known
    // to share their cuts: a gap would be a patch of the picture no shard
    // draws, an overlap a patch two shards both draw.
    for (const { count, seed, shards } of DEALS) {
      const total = shards.reduce((sum, shard) => sum + shard.area, 0);
      expect(total / WHOLE, `${count} pieces, seed ${seed}`).toBeCloseTo(1, 9);
      for (const shard of shards) expect(areaOf(shard.points)).toBeCloseTo(shard.area, 9);
    }
  });

  it("leaves no shard too small, too thin or too sprawling to grab", () => {
    // The floors, swept. Each one catches something the others do not: area
    // alone lets through a long thin wedge, fatness alone lets through a plump
    // shard that lies across the whole picture, and spread alone lets through
    // a small one. Weakening any of them is weakening the level.
    const disc = (count: number): number => minInradius(PICTURE_BOX, count);
    for (const { count, seed, shards } of DEALS) {
      const even = WHOLE / count;
      for (const shard of shards) {
        const where = `${count} pieces, seed ${seed}`;
        expect(shard.area / even, where).toBeGreaterThanOrEqual(MIN_AREA_SHARE - 1e-9);
        expect(shard.area / even, where).toBeLessThanOrEqual(MAX_AREA_SHARE + 1e-9);
        expect(shard.inradius, where).toBeCloseTo(inradiusOf(shard.points), 6);
        expect(shard.inradius / Math.sqrt(shard.area), where).toBeGreaterThanOrEqual(
          MIN_FATNESS - 1e-9,
        );
        expect(shard.inradius, where).toBeGreaterThanOrEqual(disc(count) - 1e-9);
        expect(
          Math.max(shard.ink.width, shard.ink.height) / Math.sqrt(shard.area),
          where,
        ).toBeLessThanOrEqual(MAX_SPREAD + 1e-9);
      }
    }
  });

  it("holds the shards of one deal within half again of each other", () => {
    // What the floors are really for: the tray gives every piece a cell as big
    // as the biggest one draws, so a deal with one huge shard in it is a deal
    // whose smallest is too small to find. `tests/puzzle.test.ts` measures the
    // board that comes out; this is the rule underneath it.
    for (const { count, seed, shards } of DEALS) {
      const drawn = shards.map((shard) => Math.max(shard.ink.width, shard.ink.height));
      expect(Math.max(...drawn) / Math.min(...drawn), `${count} pieces, seed ${seed}`).toBeLessThan(
        2.2,
      );
    }
  });

  it("makes no two shards of a deal the same shape", () => {
    // The point of the kind: a child matches a shard to a hole by its outline,
    // which only works if the outlines differ. Two shards are compared by the
    // lengths of their sides and by their areas, both of which ignore where a
    // shard sits and which way round it is - so two that pass this really are
    // two different shapes rather than one shape in two places. Three shards
    // and up: a picture cut in two is two halves, and halves of a box are
    // alike however they are cut. The table never asks for two.
    for (const { count, seed, shards } of DEALS) {
      if (count < 3) continue;
      for (let one = 0; one < shards.length; one++) {
        for (let two = one + 1; two < shards.length; two++) {
          const here = signatureOf(shards[one] as Shard);
          const there = signatureOf(shards[two] as Shard);
          if (here.length !== there.length) continue;
          const areas = [(shards[one] as Shard).area, (shards[two] as Shard).area];
          const apart = Math.max(
            Math.abs(areas[0]! - areas[1]!) / Math.max(areas[0]!, areas[1]!),
            ...here.map(
              (side, index) => Math.abs(side - there[index]!) / Math.max(side, there[index]!),
            ),
          );
          expect(apart, `${count} pieces, seed ${seed}: shards ${one} and ${two}`).toBeGreaterThan(
            0.01,
          );
        }
      }
    }
  });

  it("breaks the same picture differently from one game to the next, and the same from a seed", () => {
    const cut = (seed: number): string =>
      shatterCut(PICTURE_BOX, 8, seededRandom(seed))
        .map((shard) => shardPath(shard.points))
        .join("|");
    expect(new Set(Array.from({ length: 20 }, (_, seed) => cut(seed))).size).toBe(20);
    // The same seed twice, and the same seed after another deal has been made
    // from a stream of its own: a shatter must not depend on what came before.
    expect(cut(6)).toBe(cut(6));
    const first = shatterCut(PICTURE_BOX, 6, seededRandom(3));
    shatterCut(PICTURE_BOX, 12, seededRandom(99));
    expect(shatterCut(PICTURE_BOX, 6, seededRandom(3))).toEqual(first);
  });

  it("hands a picture back whole when it is asked for one piece", () => {
    const [only] = shatterCut(PICTURE_BOX, 1, seededRandom(1));
    expect(only?.area).toBeCloseTo(WHOLE, 6);
    expect(only?.points).toHaveLength(4);
  });

  it("refuses a shatter with no pieces in it", () => {
    expect(() => shatterCut(PICTURE_BOX, 0)).toThrow(/at least one/i);
  });

  it("draws a closed path for a shard", () => {
    const path = shardPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 4, y: 8 },
    ]);
    expect(path).toBe("M0 0 L10 0 L4 8 Z");
  });
});

describe("a picture as shards", () => {
  const pictures = loadPictures();

  it("mints a frame and one piece per shard, each with an id of its own", () => {
    for (const picture of pictures) {
      for (const count of [6, 8]) {
        const { frame, pieces } = shatterShapes(picture, count, seededRandom(2));
        expect(pieces).toHaveLength(count);
        expect(frame.id).toBe(frameId(picture));
        assertUniquePieceIds([frame, ...pieces], `${picture.id} in ${count}`);
      }
    }
  });

  it("draws every shard from the picture, through the outline it was cut with", () => {
    const picture = pictureFor("farmyard");
    const shards = shatterCut(picture.box, 6, seededRandom(9));
    const { frame, pieces } = shatterShapes(picture, 6, seededRandom(9));
    pieces.forEach((piece, index) => {
      const shard = shards[index] as Shard;
      // Cutting is clipping: the artwork is the scene's own markup, held in a
      // clip path made from the shard's outline. Nothing is redrawn per deal.
      expect(piece.artwork).toContain(picture.artwork);
      expect(piece.artwork).toContain("clip-path");
      expect(piece.artwork).toContain(`d="${piece.outline}"`);
      expect(piece.outline).toBe(shardPath(shard.points));
      // And every piece carries the whole picture and the picture's own anchor,
      // which is what makes the shards assemble by construction.
      expect(piece.box).toEqual(picture.box);
      expect(piece.anchor).toEqual(frame.anchor);
      expect(piece.inked).toEqual(shard.ink);
    });
  });
});

const dealt = (level: LevelSpec, seed = 1): Puzzle =>
  shatter.deal({ level, shapes: [] }, seededRandom(seed));

describe("the shatter kind", () => {
  it("plays the levels the table gives it", () => {
    expect(SHATTER_LEVELS.map((level) => level.level)).toEqual([26, 28]);
  });

  it("deals one picture and one piece per shard", () => {
    for (const level of SHATTER_LEVELS) {
      for (let seed = 0; seed < 8; seed++) {
        const puzzle = dealt(level, seed);
        expect(puzzle.targets, `level ${level.level}`).toHaveLength(1);
        expect(puzzle.pieces, `level ${level.level}`).toHaveLength(level.pieces);
        assertUniquePieceIds(puzzle.pieces, `level ${level.level}`);
      }
    }
  });

  it("deals the shards out of order", () => {
    // The tray is not the picture laid out in the order it was cut.
    const level = SHATTER_LEVELS[1] as LevelSpec;
    const shuffled = Array.from({ length: 12 }, (_, seed) =>
      dealt(level, seed)
        .pieces.map((piece) => piece.id)
        .join(","),
    );
    expect(new Set(shuffled).size).toBeGreaterThan(1);
  });

  it("refuses a level that asks for more than one picture, names none, or breaks none", () => {
    const level = SHATTER_LEVELS[0] as LevelSpec;
    expect(() => dealt({ ...level, targets: 2 })).toThrow(/1 target/i);
    const { scene: _scene, ...noScene } = level.options ?? {};
    expect(() => dealt({ ...level, options: noScene })).toThrow(/no scene/i);
    expect(() => dealt({ ...level, pieces: 1 })).toThrow(/not a puzzle/i);
  });

  it("cuts one hole, and stands every shard in it at the picture's own scale", () => {
    for (const level of SHATTER_LEVELS) {
      const puzzle = dealt(level, 4);
      for (const id of ["landscape", "portrait"] as const) {
        const layout = buildLevelLayout(id, level, puzzle.pieces, puzzle.targets);
        expect(layout.holes.size, `level ${level.level} ${id}`).toBe(1);
        const whole = boxOf(layout, puzzle.targets[0]!.id);
        const origin = holeOf(layout, puzzle.targets[0]!.id);
        for (const piece of puzzle.pieces) {
          expect(boxOf(layout, piece.id).scale, piece.id).toBe(whole.scale);
          expect(shatter.target(puzzle, layout, piece.id), piece.id).toEqual(origin);
        }
      }
    }
  });

  it("keeps the picture showing under the frame until the last shard is home", () => {
    // A blank frame is a memory game. The guide is what makes a broken picture
    // something a two-year-old can see the answer to, and the cut lines on it
    // are what let a shard be matched to its own place by shape.
    const level = SHATTER_LEVELS[0] as LevelSpec;
    const puzzle = dealt(level, 8);
    const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
    const guide = shatter.backdrop(puzzle, layout);
    expect(guide).toContain(pictureFor(level.options!.scene!).artwork);
    expect(guide).toContain("opacity: 1");
    for (const piece of puzzle.pieces) {
      expect(guide, piece.id).toContain(`class="cell" data-piece="${piece.id}"`);
    }
    const half = { ...puzzle, placed: new Set(puzzle.pieces.slice(1).map((piece) => piece.id)) };
    expect(shatter.isComplete(half)).toBe(false);
    expect(shatter.backdrop(half, layout)).toContain("opacity: 1");
    const built = { ...puzzle, placed: new Set(puzzle.pieces.map((piece) => piece.id)) };
    expect(shatter.isComplete(built)).toBe(true);
    expect(shatter.backdrop(built, layout)).toContain("opacity: 0");
  });

  it("takes a sloppy drop on a shard's own place, and refuses one across the picture", () => {
    for (const level of SHATTER_LEVELS) {
      const puzzle = dealt(level, 12);
      for (const id of ["landscape", "portrait"] as const) {
        const layout = buildLevelLayout(id, level, puzzle.pieces, puzzle.targets);
        const home = holeOf(layout, puzzle.targets[0]!.id);
        const { size } = boxOf(layout, puzzle.targets[0]!.id);
        for (const piece of puzzle.pieces) {
          const { reach } = boxOf(layout, piece.id);
          expect(shatter.accepts(puzzle, layout, piece.id, home), piece.id).toBe(true);
          const near = { x: home.x + reach.width * 0.45, y: home.y - reach.height * 0.45 };
          expect(shatter.accepts(puzzle, layout, piece.id, near), piece.id).toBe(true);
          // Half a picture out is somebody else's place, and is not taken.
          for (const away of [
            { x: home.x + size.width / 2, y: home.y },
            { x: home.x, y: home.y + size.height / 2 },
          ]) {
            expect(shatter.accepts(puzzle, layout, piece.id, away), `${piece.id} ${id}`).toBe(
              false,
            );
          }
        }
      }
    }
  });
});
