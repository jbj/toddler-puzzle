/**
 * The curve, and who plays it.
 *
 * The level table is data, so what is worth checking is that it is *coherent
 * data*: thirty levels in six chapters, a ramp that climbs, and numbers that
 * agree with each other - a jigsaw's grid with its piece count, a sliced
 * level's slices with its animals. A table that drifts out of step with itself
 * would put a board on screen that no kind can play.
 *
 * The registry is checked for the one thing that is easy to get wrong: a level
 * naming a kind nobody has built must still be playable, and must still be the
 * level it was - its number, its chapter, its forgiveness.
 */
import { describe, expect, it, vi } from "vitest";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor, animalThemes } from "../src/assets";
import { seededRandom } from "../src/geometry";
import { MAX_STAND_IN_PIECES, isKindRegistered, resolveLevel } from "../src/kinds/registry";
import { shapeMatch } from "../src/kinds/shape-match";
import { buildLevelLayout } from "../src/layout";
import {
  CHAPTERS,
  LEVELS,
  LEVEL_COUNT,
  MAX_SNAP_FORGIVENESS,
  MIN_SNAP_FORGIVENESS,
  castOf,
  chapterNumber,
  dealPieces,
  isVouchedLevel,
  levelSpec,
  nextLevel,
  type LevelSpec,
  type PuzzleKindId,
} from "../src/levels";
import { pieceId, type PieceShape } from "../src/piece";
import { THEMES, type ThemeId } from "../src/themes";

const SHAPES: readonly PieceShape[] = ANIMAL_IDS.map((id) => ({
  id: pieceId(id),
  outline: "",
  artwork: "",
  box: ANIMAL_BOX,
  anchor: animalAnchor(id),
  label: id,
  themes: animalThemes(id),
}));

/** A piece of no particular shape, in whichever themes the test needs. */
const shapeIn = (id: string, ...themes: ThemeId[]): PieceShape => ({
  id: pieceId(id),
  outline: "",
  artwork: "",
  box: ANIMAL_BOX,
  anchor: { x: 120, y: 200 },
  label: id,
  ...(themes.length > 0 ? { themes } : {}),
});

/** The levels of one chapter, in play order. */
const inChapter = (chapter: (typeof CHAPTERS)[number]): readonly LevelSpec[] =>
  LEVELS.filter((level) => level.chapter === chapter);

describe("the level table", () => {
  it("is thirty levels, numbered from one", () => {
    expect(LEVEL_COUNT).toBe(30);
    expect(LEVELS.map((level) => level.level)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
  });

  it("is six chapters of five, in play order", () => {
    expect(CHAPTERS).toHaveLength(6);
    for (const chapter of CHAPTERS) expect(inChapter(chapter)).toHaveLength(5);
    // A chapter's levels are consecutive: the chapter column never goes back.
    expect(LEVELS.map((level) => chapterNumber(level))).toEqual(
      LEVELS.map((level) => Math.ceil(level.level / 5)),
    );
  });

  it("looks a level up by number, and refuses one that does not exist", () => {
    for (const level of LEVELS) expect(levelSpec(level.level)).toBe(level);
    expect(() => levelSpec(0)).toThrow(/no level/i);
    expect(() => levelSpec(LEVEL_COUNT + 1)).toThrow(/no level/i);
  });

  it("loops back to the first level after the last", () => {
    expect(nextLevel(1)).toBe(2);
    expect(nextLevel(LEVEL_COUNT - 1)).toBe(LEVEL_COUNT);
    expect(nextLevel(LEVEL_COUNT)).toBe(1);
  });

  it("gives every level something to fill and something to fill it with", () => {
    for (const level of LEVELS) {
      expect(level.targets).toBeGreaterThanOrEqual(1);
      expect(level.pieces).toBeGreaterThanOrEqual(level.targets);
    }
  });

  it("keeps targets and pieces equal except where a target holds several", () => {
    // Only a sliced level fills one target with more than one piece; for
    // everything else two numbers that disagree would be a typo.
    for (const level of LEVELS) {
      if (level.kind === "sliced") continue;
      expect(level.targets, `level ${level.level}`).toBe(level.pieces);
    }
  });

  it("cuts a sliced level into two to four equal slices per animal", () => {
    for (const level of LEVELS.filter((one) => one.kind === "sliced")) {
      const slices = level.pieces / level.targets;
      expect(Number.isInteger(slices), `level ${level.level}`).toBe(true);
      expect(slices).toBeGreaterThanOrEqual(2);
      expect(slices).toBeLessThanOrEqual(4);
    }
  });

  it("keeps a declared grid in step with the piece count", () => {
    // The grid is redundant with `pieces`, which is exactly why it is checked:
    // a 3x3 grid on a six-piece level would cut a picture nobody could finish.
    for (const level of LEVELS) {
      const grid = level.options?.grid;
      if (!grid) continue;
      expect(grid.columns * grid.rows, `level ${level.level}`).toBe(level.pieces);
    }
  });

  it("never snaps less generously than the two-thirds floor", () => {
    for (const level of LEVELS) {
      expect(level.snapForgiveness).toBeGreaterThanOrEqual(MIN_SNAP_FORGIVENESS);
      expect(level.snapForgiveness).toBeLessThanOrEqual(MAX_SNAP_FORGIVENESS);
    }
  });

  it("eases the forgiveness off level by level, never back up", () => {
    for (const [index, level] of LEVELS.entries()) {
      if (index === 0) continue;
      const before = LEVELS[index - 1]!;
      expect(level.snapForgiveness, `level ${level.level}`).toBeLessThanOrEqual(
        before.snapForgiveness,
      );
    }
  });

  it("climbs: a chapter never gets smaller as it goes", () => {
    for (const chapter of CHAPTERS) {
      const counts = inChapter(chapter).map((level) => level.pieces);
      expect(counts, chapter).toEqual([...counts].sort((a, b) => a - b));
    }
  });

  it("climbs: the first chapter is tiny and the last is full", () => {
    for (const level of inChapter("first-touches")) expect(level.pieces).toBeLessThanOrEqual(3);
    for (const level of inChapter("mastery")) expect(level.pieces).toBeGreaterThanOrEqual(6);
  });

  it("gives each chapter the kinds its chapter is about", () => {
    const expected: Record<(typeof CHAPTERS)[number], readonly PuzzleKindId[]> = {
      "first-touches": ["play", "shape-match"],
      animals: ["shape-match"],
      "sliced-animals": ["sliced"],
      shapes: ["polygon"],
      pictures: ["jigsaw"],
      // Mastery is where the kinds already met are mixed up again.
      mastery: ["jigsaw", "shatter", "sliced", "polygon", "shape-match"],
    };
    for (const chapter of CHAPTERS) {
      for (const level of inChapter(chapter)) {
        expect(expected[chapter], `level ${level.level}`).toContain(level.kind);
      }
    }
  });
});

describe("dealPieces", () => {
  const idsOf = (cast: readonly PieceShape[]): string[] => cast.map((shape) => shape.id);

  /** The levels a cast of ten animals can actually fill. */
  const DEALABLE = LEVELS.filter((level) => level.pieces <= SHAPES.length);

  it("deals as many pieces as the level asks for", () => {
    for (const level of DEALABLE) {
      expect(dealPieces(level, SHAPES)).toHaveLength(level.pieces);
    }
  });

  it("only uses pieces that exist, with no repeats in a level", () => {
    for (const level of DEALABLE) {
      for (let run = 0; run < 20; run++) {
        const cast = dealPieces(level, SHAPES);
        expect(new Set(idsOf(cast)).size).toBe(cast.length);
        for (const shape of cast) expect(SHAPES).toContain(shape);
      }
    }
  });

  it("can deal any piece into a full board", () => {
    // There are more animals than the busiest board holds, so a single deal is
    // a sample rather than the whole list; over enough deals none may be shut
    // out.
    const busiest = DEALABLE.reduce((most, level) => (level.pieces > most.pieces ? level : most));
    const seen = new Set<string>();
    for (let run = 0; run < 200; run++) {
      for (const shape of dealPieces(busiest, SHAPES)) seen.add(shape.id);
    }
    expect(seen.size).toBe(SHAPES.length);
  });

  it("varies which pieces turn up in the smallest level", () => {
    const seen = new Set<string>();
    for (let run = 0; run < 200; run++) {
      for (const shape of dealPieces(levelSpec(1), SHAPES)) seen.add(shape.id);
    }
    expect(seen.size).toBe(SHAPES.length);
  });

  it("varies the order the pieces are laid out in", () => {
    const orders = new Set<string>();
    for (let run = 0; run < 200; run++) orders.add(idsOf(dealPieces(levelSpec(10), SHAPES)).join());
    expect(orders.size).toBeGreaterThan(1);
  });

  it("repeats exactly when given the same seed, so a level can be replayed", () => {
    const level = levelSpec(9);
    expect(dealPieces(level, SHAPES, seededRandom(7))).toEqual(
      dealPieces(level, SHAPES, seededRandom(7)),
    );
    expect(dealPieces(level, SHAPES, seededRandom(7))).not.toEqual(
      dealPieces(level, SHAPES, seededRandom(8)),
    );
  });

  it("rejects shapes whose piece ids are not unique", () => {
    const duplicateId = SHAPES[0]!.id;
    const duplicateIds = [SHAPES[0]!, { ...SHAPES[1]!, id: duplicateId }];
    expect(() => dealPieces(levelSpec(3), duplicateIds, seededRandom(7))).toThrow(
      new RegExp(`duplicate .*"${duplicateId}"`, "i"),
    );
  });

  it("rejects a level that wants more pieces than exist", () => {
    expect(() => dealPieces(levelSpec(10), SHAPES.slice(0, 2))).toThrow(/only 2 exist/i);
  });
});

describe("themed casts", () => {
  /** How many animals a level needs from its theme, as it is played today. */
  const themedLevels = LEVELS.map((level) => resolveLevel(level, SHAPES.length).spec).filter(
    (spec) => spec.theme !== undefined,
  );

  it("names a theme every animal can be grouped under", () => {
    for (const level of LEVELS) {
      if (level.theme) expect(THEMES, `level ${level.level}`).toContain(level.theme);
    }
    for (const id of ANIMAL_IDS) {
      expect(animalThemes(id).length, id).toBeGreaterThan(0);
      for (const theme of animalThemes(id)) expect(THEMES, id).toContain(theme);
    }
  });

  it("gives every themed level a cast of its own theme to fill it", () => {
    // The whole point of a theme is that the board is coherent. `dealPieces`
    // will top a short theme up from the rest of the cast rather than break,
    // but that is a safety net: no level of the thirty may actually need it.
    for (const spec of themedLevels) {
      const cast = castOf(spec.theme as ThemeId, SHAPES);
      expect(cast.length, `level ${spec.level} (${spec.theme})`).toBeGreaterThanOrEqual(
        spec.pieces,
      );
    }
  });

  it("deals a themed level from that theme and nothing else", () => {
    for (const spec of themedLevels) {
      for (let run = 0; run < 20; run++) {
        for (const shape of dealPieces(spec, SHAPES)) {
          expect(shape.themes, `level ${spec.level}`).toContain(spec.theme);
        }
      }
    }
  });

  it("can deal every animal of a theme, and never one from outside it", () => {
    // A theme with more animals than the board holds still has to reach all of
    // them over enough deals, or an animal drawn for a theme never turns up.
    for (const spec of themedLevels) {
      const cast = castOf(spec.theme as ThemeId, SHAPES);
      const seen = new Set<string>();
      for (let run = 0; run < 300; run++) {
        for (const shape of dealPieces(spec, SHAPES)) seen.add(shape.id);
      }
      expect(seen.size, `level ${spec.level} (${spec.theme})`).toBe(cast.length);
    }
  });

  it("deals from the whole cast when a level names no theme", () => {
    const open = LEVELS.filter((level) => level.theme === undefined && level.pieces === 3);
    expect(open.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const level of open) {
      for (let run = 0; run < 200; run++) {
        for (const shape of dealPieces(level, SHAPES)) seen.add(shape.id);
      }
    }
    expect(seen.size).toBe(SHAPES.length);
  });

  it("tops a short theme up from the rest of the cast rather than breaking", () => {
    // A half-drawn theme, or a kind asking for a busier board than the theme
    // has animals: the child gets a full, playable, mostly-themed board.
    const cast = [
      shapeIn("cow", "farm"),
      shapeIn("whale", "sea"),
      shapeIn("crab", "sea"),
      shapeIn("fish", "sea"),
    ];
    const level: LevelSpec = { ...levelSpec(6), theme: "farm", targets: 3, pieces: 3 };
    for (let run = 0; run < 50; run++) {
      const dealt = dealPieces(level, cast, seededRandom(run));
      expect(dealt).toHaveLength(3);
      expect(new Set(dealt.map((shape) => shape.id)).size).toBe(3);
      // The one animal the theme does have is always in.
      expect(dealt.map((shape) => shape.id)).toContain("cow");
    }
  });

  it("puts the animals that filled a short theme up anywhere in the order", () => {
    // Topping up must not always park the off-theme animals at the end of the
    // row, or the same hole would take an off-theme piece every time.
    const cast = [shapeIn("cow", "farm"), shapeIn("whale", "sea"), shapeIn("crab", "sea")];
    const level: LevelSpec = { ...levelSpec(6), theme: "farm", targets: 3, pieces: 3 };
    const positions = new Set<number>();
    for (let run = 0; run < 100; run++) {
      positions.add(dealPieces(level, cast, seededRandom(run)).findIndex((s) => s.id === "cow"));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("deals a full board from pieces that have no themes at all", () => {
    // A provider that does not group its pieces - a jigsaw cutter, say - is
    // not thereby unable to play a level the table gave a theme to.
    const cast = [shapeIn("a"), shapeIn("b"), shapeIn("c"), shapeIn("d")];
    const level: LevelSpec = { ...levelSpec(6), theme: "jungle", targets: 3, pieces: 3 };
    expect(dealPieces(level, cast, seededRandom(2))).toHaveLength(3);
  });

  it("still refuses a themed level with nowhere near enough pieces", () => {
    const cast = [shapeIn("cow", "farm"), shapeIn("pig", "farm")];
    expect(() => dealPieces(levelSpec(10), cast)).toThrow(/only 2 exist/i);
  });

  it("repeats a themed deal exactly when given the same seed", () => {
    const level = levelSpec(7);
    expect(dealPieces(level, SHAPES, seededRandom(4))).toEqual(
      dealPieces(level, SHAPES, seededRandom(4)),
    );
  });
});

describe("the kind registry", () => {
  it("knows shape-match and none of the kinds still to be built", () => {
    expect(isKindRegistered("shape-match")).toBe(true);
    for (const level of LEVELS) {
      const { kind, standIn } = resolveLevel(level, SHAPES.length);
      expect(standIn).toBe(!isKindRegistered(level.kind));
      // Until the other kinds exist there is one kind, so every level is
      // playable either way.
      expect(kind.id).toBe(standIn ? shapeMatch.id : level.kind);
    }
  });

  it("plays a level whose kind exists exactly as the table wrote it", () => {
    const own = LEVELS.filter((level) => isKindRegistered(level.kind));
    expect(own.length).toBeGreaterThan(0);
    for (const level of own) {
      const resolved = resolveLevel(level, SHAPES.length);
      expect(resolved.spec).toBe(level);
      expect(resolved.standIn).toBe(false);
    }
  });

  it("stands in for a missing kind without losing the level", () => {
    const missing = LEVELS.filter((level) => !isKindRegistered(level.kind));
    expect(missing.length).toBeGreaterThan(0);
    for (const level of missing) {
      const { spec, standIn } = resolveLevel(level, SHAPES.length);
      expect(standIn).toBe(true);
      expect(spec.kind).toBe(shapeMatch.id);
      // The level keeps its place in the game and how forgiving it is.
      expect(spec.level).toBe(level.level);
      expect(spec.chapter).toBe(level.chapter);
      expect(spec.snapForgiveness).toBe(level.snapForgiveness);
      // A stand-in is a shape-match board: one hole per piece, no grid to cut.
      expect(spec.targets).toBe(spec.pieces);
      expect(spec.options).toBeUndefined();
    }
  });

  it("keeps the stand-in climbing rather than following the missing kind", () => {
    // A stand-in board grows with the chapter it is in, so the ramp goes on
    // climbing instead of dropping back to two pieces at level 11 where the
    // sliced levels start.
    let previous = 0;
    for (const level of LEVELS.filter((one) => !isKindRegistered(one.kind))) {
      const { spec } = resolveLevel(level, SHAPES.length);
      expect(spec.pieces, `level ${level.level}`).toBeGreaterThanOrEqual(previous);
      expect(spec.pieces).toBeLessThanOrEqual(MAX_STAND_IN_PIECES);
      previous = spec.pieces;
    }
    expect(previous).toBe(MAX_STAND_IN_PIECES);
  });

  it("never asks for more pieces than there are shapes to deal", () => {
    for (const available of [1, 2, 3, 10]) {
      for (const level of LEVELS) {
        const { spec, standIn } = resolveLevel(level, available);
        if (!standIn) continue;
        expect(spec.pieces).toBeGreaterThanOrEqual(1);
        expect(spec.pieces).toBeLessThanOrEqual(available);
      }
    }
  });

  it("deals and lays out every level of the thirty, stand-in or not", () => {
    // The whole ramp has to be playable today, which is the point of the
    // stand-in: no level in the table may be one nothing can put on screen.
    for (const level of LEVELS) {
      const { kind, spec } = resolveLevel(level, SHAPES.length);
      const puzzle = kind.deal({ level: spec, shapes: SHAPES }, seededRandom(spec.level));
      expect(puzzle.pieces).toHaveLength(spec.pieces);
      for (const id of ["landscape", "portrait"] as const) {
        // `buildLevelLayout` rather than `buildLayout`: it refuses a level the
        // table does not vouch for, so this also proves a stand-in's spec is
        // still a level of the thirty rather than one invented in passing.
        const layout = buildLevelLayout(id, spec, puzzle.pieces);
        expect(layout.holes.size).toBe(spec.pieces);
      }
    }
  });

  it("vouches for a stand-in's level, and for nothing invented", () => {
    // A `LevelSpec` is a plain record, so the only thing separating a level of
    // the thirty from one written out by hand is that the table vouches for it.
    // A stand-in has to be on the right side of that line; an edited copy of a
    // real level has to be on the wrong one, however plausible it looks.
    for (const level of LEVELS) {
      expect(isVouchedLevel(level)).toBe(true);
      expect(isVouchedLevel(resolveLevel(level, SHAPES.length).spec)).toBe(true);
    }
    expect(isVouchedLevel({ ...levelSpec(1), snapForgiveness: 9 })).toBe(false);
  });

  it("retires a stand-in the moment the real kind is registered", async () => {
    // Registering is the whole handover: the table does not change, and the
    // level goes back to being played by its own kind. Done against a freshly
    // imported registry so the rest of the suite still sees the real one.
    vi.resetModules();
    // The table comes from the fresh graph too: it is the module that vouches
    // for a level, and the fresh one has never seen the levels imported above.
    const fresh = await import("../src/kinds/registry");
    const table = await import("../src/levels");
    const missing = table.LEVELS.find((level) => !fresh.isKindRegistered(level.kind));
    if (!missing) {
      // Not a failure: it means every kind in the table has been built, and
      // this test - along with the stand-in itself - can go.
      throw new Error("Every kind is registered; delete the stand-in and its tests.");
    }

    expect(fresh.resolveLevel(missing, SHAPES.length).standIn).toBe(true);
    const built = { ...shapeMatch, id: missing.kind };
    fresh.registerKind(built);

    const resolved = fresh.resolveLevel(missing, SHAPES.length);
    expect(resolved.standIn).toBe(false);
    expect(resolved.kind).toBe(built);
    expect(resolved.spec).toBe(missing);
  });
});
