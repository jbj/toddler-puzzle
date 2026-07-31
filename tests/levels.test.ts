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
import { describe, expect, it } from "vitest";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor, animalThemes } from "../src/assets";
import { seededRandom } from "../src/geometry";
import { KIND_IDS, isKindRegistered, kindFor, loadAllKinds } from "../src/kinds/registry";
import { buildLevelLayout } from "../src/layout";
import {
  CHAPTERS,
  LEVELS,
  LEVEL_COUNT,
  MAX_SNAP_FORGIVENESS,
  MIN_SNAP_FORGIVENESS,
  PUZZLE_KINDS,
  castOf,
  chapterNumber,
  dealPieces,
  endsChapter,
  isLastPlayable,
  isPlayable,
  isVouchedLevel,
  levelSpec,
  nextLevel,
  playableFrom,
  playableLevels,
  type EnabledKinds,
  type LevelSpec,
  type PuzzleKindId,
} from "../src/levels";
import { pieceId, type PieceShape } from "../src/piece";
import { kindsAhead } from "../src/warm";
import { SCENE_SIZES } from "../src/scenes";
import { THEMES, type ThemeId } from "../src/themes";

// Four of the six kinds are chunks of their own, fetched during play so that
// first paint does not wait for artwork twenty levels away. A test is not
// playing, so it asks for all of them up front and then treats the registry the
// way the running game does once its warm has finished.
await loadAllKinds();

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
    // A sliced level fills one animal with several slices, a polygon level
    // builds one picture out of several shapes, and a jigsaw or shatter level
    // fills one frame with the pieces it was cut into; for everything else two
    // numbers that disagree would be a typo.
    const many = new Set(["sliced", "polygon", "jigsaw", "shatter"]);
    for (const level of LEVELS) {
      if (many.has(level.kind)) continue;
      expect(level.targets, `level ${level.level}`).toBe(level.pieces);
    }
  });

  it("stands exactly one picture in a polygon level", () => {
    // The kind builds one scene, and a row asking for two would throw rather
    // than deal something half-right.
    for (const level of LEVELS.filter((one) => one.kind === "polygon")) {
      expect(level.targets, `level ${level.level}`).toBe(1);
      expect(SCENE_SIZES, `level ${level.level}`).toContain(level.pieces);
    }
  });

  it("stands exactly one picture in a jigsaw level, cut at the grid it names", () => {
    // A jigsaw is one picture however many pieces it is in, and the grid is
    // how it is cut. A row asking for two pictures, or naming no scene, would
    // throw when it was dealt rather than deal something half-right.
    for (const level of LEVELS.filter((one) => one.kind === "jigsaw")) {
      expect(level.targets, `level ${level.level}`).toBe(1);
      expect(level.options?.scene, `level ${level.level}`).toBeTruthy();
      const grid = level.options?.grid;
      expect(grid, `level ${level.level}`).toBeTruthy();
      expect(Math.min(grid!.columns, grid!.rows), `level ${level.level}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("stands exactly one picture in a shatter level, and enough shards to be one", () => {
    // A shatter is one picture in several irregular shards, and unlike a jigsaw
    // there is no grid to name: how many pieces is the whole instruction.
    for (const level of LEVELS.filter((one) => one.kind === "shatter")) {
      expect(level.targets, `level ${level.level}`).toBe(1);
      expect(level.options?.scene, `level ${level.level}`).toBeTruthy();
      expect(level.options?.grid, `level ${level.level}`).toBeUndefined();
      expect(level.pieces, `level ${level.level}`).toBeGreaterThanOrEqual(2);
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
  /** Every level that names a theme, as it is played today. */
  const themedLevels = LEVELS.filter((spec) => spec.theme !== undefined);

  /**
   * The animals a level actually puts on the board, asked of the kind that
   * plays it rather than read off the table. `pieces` is not the answer for
   * every kind: a sliced level deals two animals and eight pieces, and it is
   * the two that have to come out of the theme - the other six are quarters of
   * them, and belong to no theme at all.
   */
  const animalsFor = (spec: LevelSpec, run: number): readonly PieceShape[] => {
    return kindFor(spec).deal({ level: spec, shapes: SHAPES }, seededRandom(run)).targets;
  };

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
        animalsFor(spec, 0).length,
      );
    }
  });

  it("deals a themed level from that theme and nothing else", () => {
    for (const spec of themedLevels) {
      for (let run = 0; run < 20; run++) {
        for (const shape of animalsFor(spec, run)) {
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
        for (const shape of animalsFor(spec, run)) seen.add(shape.id);
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
        for (const shape of dealPieces(level, SHAPES, seededRandom(run))) seen.add(shape.id);
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

/**
 * The kinds a grown-up has left on, written as the ones to switch *off* because
 * that is how the panel is used: everything is on until somebody takes one out.
 */
const without = (...off: readonly PuzzleKindId[]): EnabledKinds =>
  Object.fromEntries(PUZZLE_KINDS.map((kind) => [kind, !off.includes(kind)])) as EnabledKinds;

describe("a kind switched off", () => {
  it("names every kind of the table exactly once, in play order", () => {
    // The panel walks this list to build its switches, so a kind missing from
    // it is a kind nobody can turn off, and one that is not in the table is a
    // switch that does nothing.
    expect([...new Set(PUZZLE_KINDS)]).toEqual([...PUZZLE_KINDS]);
    expect(new Set(PUZZLE_KINDS)).toEqual(new Set(LEVELS.map((level) => level.kind)));
    expect(new Set(PUZZLE_KINDS)).toEqual(new Set(KIND_IDS));
    expect(PUZZLE_KINDS.map((kind) => LEVELS.find((level) => level.kind === kind)?.level)).toEqual(
      [...PUZZLE_KINDS.map((kind) => LEVELS.find((level) => level.kind === kind)?.level)].sort(
        (a, b) => (a ?? 0) - (b ?? 0),
      ),
    );
  });

  it("leaves the whole thirty alone when nothing is switched off", () => {
    expect(playableLevels()).toEqual(LEVELS);
    expect(playableLevels(without())).toEqual(LEVELS);
  });

  it("drops its levels and keeps the rest in order", () => {
    const kinds = without("play");
    expect(playableLevels(kinds).map((level) => level.level)).toEqual(
      LEVELS.filter((level) => level.kind !== "play").map((level) => level.level),
    );
    expect(isPlayable(1, kinds)).toBe(false);
    expect(isPlayable(2, kinds)).toBe(true);
  });

  it("is stepped over on the way to the next level", () => {
    // Levels 1, 3 and 5 are the cause-and-effect ones, so a child whose
    // grown-up switched those off plays 2, 4, 6 and on.
    const kinds = without("play");
    expect(nextLevel(1, kinds)).toBe(2);
    expect(nextLevel(2, kinds)).toBe(4);
    expect(nextLevel(4, kinds)).toBe(6);
  });

  it("wraps to the first level still in play, not to level 1", () => {
    const kinds = without("play", "shape-match");
    expect(nextLevel(LEVEL_COUNT, kinds)).toBe(11);
    expect(playableFrom(1, kinds)).toBe(11);
  });

  it("resumes forward off a level that has just been taken out", () => {
    const kinds = without("jigsaw");
    // A child who stopped on level 21 resumes on the first level of what is
    // left rather than on a jigsaw their grown-up has switched off.
    expect(playableFrom(21, kinds)).toBe(26);
    expect(playableFrom(20, kinds)).toBe(20);
  });

  it("moves the end of the game to the end of what is played", () => {
    expect(isLastPlayable(LEVEL_COUNT)).toBe(true);
    const kinds = without("jigsaw");
    expect(isLastPlayable(LEVEL_COUNT, kinds)).toBe(false);
    // 30 and 29 are jigsaws, so the last thing played is level 28.
    expect(isLastPlayable(28, kinds)).toBe(true);
  });

  it("still ends every chapter that is played", () => {
    const kinds = without("play");
    // Level 5 is gone, so the first chapter ends on level 4 and the party
    // moves with it rather than being lost. Level 3 is gone too, and is not
    // where a chapter ends.
    expect(endsChapter(4, kinds)).toBe(true);
    expect(endsChapter(2, kinds)).toBe(false);
    expect(endsChapter(3, kinds)).toBe(false);
    expect(endsChapter(10, kinds)).toBe(true);
    // A level whose kind is off is answered by what comes after it, which is
    // what a grown-up who jumped the child straight onto one should get.
    expect(endsChapter(5, kinds)).toBe(true);
    // And the last level still in play ends the game.
    expect(endsChapter(LEVEL_COUNT, kinds)).toBe(true);
  });

  it("never leaves the game with nothing to play", () => {
    // The panel refuses to turn the last kind off, and this is the second
    // answer to the same question: a record that says everything is off - from
    // an older build, or another tab - is read as everything on.
    const nothing = without(...PUZZLE_KINDS);
    expect(playableLevels(nothing)).toEqual(LEVELS);
    expect(nextLevel(30, nothing)).toBe(1);
    expect(playableFrom(7, nothing)).toBe(7);
    expect(isLastPlayable(LEVEL_COUNT, nothing)).toBe(true);
  });
});

describe("the kind registry", () => {
  it("has a kind registered for every level of the thirty", () => {
    for (const level of LEVELS) {
      expect(isKindRegistered(level.kind), `level ${level.level}`).toBe(true);
      expect(kindFor(level).id, `level ${level.level}`).toBe(level.kind);
    }
  });

  it("refuses a level naming a kind nobody wrote", () => {
    const nonsense = { ...levelSpec(1), kind: "kaleidoscope" as LevelSpec["kind"] };
    expect(() => kindFor(nonsense)).toThrow(/no kind is registered/i);
  });

  it("deals and lays out every level of the thirty", () => {
    // The whole ramp has to be playable: no level in the table may be one
    // nothing can put on screen.
    for (const level of LEVELS) {
      const kind = kindFor(level);
      const puzzle = kind.deal({ level, shapes: SHAPES }, seededRandom(level.level));
      expect(puzzle.pieces).toHaveLength(level.pieces);
      for (const id of ["landscape", "portrait"] as const) {
        // `buildLevelLayout` rather than `buildLayout`: it refuses a level the
        // table does not vouch for.
        const layout = buildLevelLayout(id, level, puzzle.pieces, puzzle.targets);
        expect(layout.holes.size).toBe(level.targets);
      }
    }
  });

  it("vouches for the table's levels, and for nothing invented", () => {
    // A `LevelSpec` is a plain record, so the only thing separating a level of
    // the thirty from one written out by hand is that the table vouches for it.
    for (const level of LEVELS) expect(isVouchedLevel(level)).toBe(true);
    expect(isVouchedLevel({ ...levelSpec(1), snapForgiveness: 9 })).toBe(false);
  });
});

describe("what is fetched ahead of the child", () => {
  /**
   * Four of the six kinds are chunks of their own, and none of them is loaded
   * on demand: `warm.ts` walks the table from the level being played and pulls
   * each one in while the child is busy, so a level seam is a resolved promise
   * rather than a fetch. What matters is the *order* - a kind five levels away
   * must not be queued behind one twenty levels away - and that nothing is
   * left out, because a kind the warm never names is a kind a child waits for.
   */
  it("names every kind, from wherever the child is", () => {
    for (const level of LEVELS) {
      expect(new Set(kindsAhead(level.level)), `from level ${level.level}`).toEqual(
        new Set(LEVELS.map((each) => each.kind)),
      );
    }
  });

  it("asks for what is coming before what has been", () => {
    // From level 16 the child is in the shapes chapter, so `polygon` is the one
    // they are playing, `jigsaw` and `shatter` are ahead of them, and the two
    // kinds of the first chapters - already in the bundle - come last.
    expect(kindsAhead(16)).toEqual([
      "polygon",
      "jigsaw",
      "shatter",
      "sliced",
      "play",
      "shape-match",
    ]);
  });

  it("wraps round, so a level a grown-up went back to is covered too", () => {
    // The last level is a jigsaw, so that comes first; the rest is the table
    // read from the top, which is where a child who loops back is going.
    expect(kindsAhead(LEVEL_COUNT)).toEqual([
      "jigsaw",
      "play",
      "shape-match",
      "sliced",
      "polygon",
      "shatter",
    ]);
  });
});
