/**
 * Where the celebrations fall, and that there is one everywhere there needs to
 * be.
 *
 * Almost all of a celebration is a thing on a screen answering a finger, and
 * none of that can be seen from here: the suite runs in node, with no DOM to
 * draw into. What it *is* checked against is the screenshot run, which plays an
 * interlude, the balloons and the finale for real (`scripts/shot.mjs`).
 *
 * So what is worth asserting here is the wiring nobody would notice was wrong
 * until a child had played twenty-five levels to find out: that every level
 * ends with something, that no two levels running end with the same interlude,
 * that the finale belongs to the end of the game and to nothing else, and that
 * `endsChapter` agrees with the table it is read from.
 */
import { describe, expect, it } from "vitest";
import {
  CELEBRATION_SPAN_MS,
  CHAPTER_CELEBRATIONS,
  type CelebrationId,
  FINALE,
  INTERLUDES,
  arcsPainted,
  celebrationFor,
  createCelebration,
  interludeFor,
} from "../src/celebration";
import { WAY_OUT_MS } from "../src/celebrate";
import {
  CHAPTERS,
  LEVELS,
  LEVEL_COUNT,
  type PuzzleKindId,
  chapterNumber,
  endsChapter,
  levelSpec,
} from "../src/levels";

describe("which chapter ends with what", () => {
  it("gives every chapter a celebration", () => {
    for (const chapter of CHAPTERS) {
      expect(celebrationFor(chapter)).toBeTruthy();
    }
  });

  it("never gives two chapters the same one", () => {
    const named = CHAPTERS.map((chapter) => celebrationFor(chapter));
    expect(new Set(named).size).toBe(named.length);
  });

  it("keeps the finale for the end of the game", () => {
    CHAPTERS.forEach((chapter, index) => {
      const isLastChapter = index === CHAPTERS.length - 1;
      expect(celebrationFor(chapter) === FINALE).toBe(isLastChapter);
    });
  });

  it("names nothing that has no chapter to belong to", () => {
    const chapters = new Set<string>(CHAPTERS);
    for (const id of Object.keys(CHAPTER_CELEBRATIONS)) {
      expect(chapters.has(id)).toBe(true);
    }
  });

  /**
   * A celebration is never made of what the finished board is made of, and the
   * parade is made of animals - so it may not end a chapter that finishes on a
   * board of animals, which is where it used to be. Nothing else here would
   * notice: the wiring would be perfectly correct and the screen would be two
   * sets of the same animals. See
   * docs/decisions/A celebration is not made of the board.md.
   */
  it("never walks a parade of animals over a board of animals", () => {
    const paradeIn = new Set<CelebrationId>(["parade", FINALE]);
    const animalKinds = new Set<PuzzleKindId>(["shape-match", "sliced"]);
    for (const chapter of CHAPTERS) {
      if (!paradeIn.has(celebrationFor(chapter))) continue;
      const last = LEVELS.filter((level) => level.chapter === chapter).at(-1);
      expect(last, chapter).toBeDefined();
      if (!last) continue;
      expect(animalKinds.has(last.kind), `${chapter} ends on ${last.kind}`).toBe(false);
    }
  });
});

describe("when a celebration is due", () => {
  it("falls on the last level of each chapter and nowhere else", () => {
    const ends = LEVELS.filter((level) => endsChapter(level.level)).map((level) => level.level);
    expect(ends).toEqual([6, 12, 18, 24, 30]);
  });

  it("agrees with the chapter numbering it is read from", () => {
    for (const level of LEVELS) {
      const expected =
        level.level === LEVEL_COUNT ||
        chapterNumber(levelSpec(level.level + 1)) !== chapterNumber(level);
      expect(endsChapter(level.level)).toBe(expected);
    }
  });

  it("gives the game exactly four chapter moments and one ending", () => {
    const ends = LEVELS.filter((level) => endsChapter(level.level));
    expect(ends).toHaveLength(5);
    expect(ends.filter((level) => celebrationFor(level.chapter) === FINALE)).toHaveLength(1);
  });

  it("says nothing about a level the table does not have", () => {
    expect(endsChapter(LEVEL_COUNT + 1)).toBe(false);
    expect(endsChapter(0)).toBe(false);
  });
});

/**
 * The levels that end no chapter end with an interlude instead, and the
 * interlude is the whole point of the pause: a child who is handed the next
 * board straight away never gets the breather that made the last one worth
 * finishing. There is no exception: every one of the thirty is worked for, so
 * every one of the thirty is celebrated. See
 * `docs/decisions/A celebration between every level.md`.
 */
describe("what an ordinary level ends with", () => {
  /** What the host will actually raise at the end of this level. */
  const endOf = (level: number): CelebrationId =>
    endsChapter(level) ? celebrationFor(levelSpec(level).chapter) : interludeFor(level);

  it("gives every one of the thirty something", () => {
    for (const level of LEVELS) {
      expect(endOf(level.level), `level ${level.level}`).toBeTruthy();
    }
  });

  it("still never ends two levels running the same way", () => {
    const raised = LEVELS.map((level) => endOf(level.level));
    for (let i = 1; i < raised.length; i++) {
      expect(raised[i], `celebration ${i + 1}`).not.toBe(raised[i - 1]);
    }
  });

  it("never gives two levels running the same one", () => {
    for (let level = 1; level < LEVEL_COUNT; level++) {
      expect(interludeFor(level), `level ${level}`).not.toBe(interludeFor(level + 1));
    }
  });

  it("picks the same one every time the same level is played", () => {
    for (const level of LEVELS) {
      const first = interludeFor(level.level);
      expect(interludeFor(level.level), `level ${level.level}`).toBe(first);
    }
  });

  it("uses all of them across a game", () => {
    const seen = new Set(LEVELS.map((level) => interludeFor(level.level)));
    expect(seen.size).toBe(INTERLUDES.length);
  });

  it("keeps a chapter's own celebration out of the rotation", () => {
    const chapters = new Set<CelebrationId>(CHAPTERS.map((chapter) => celebrationFor(chapter)));
    // Balloons are both, and deliberately: they are the gentlest thing the game
    // owns, so they end the first chapter as well as taking their turn as an
    // interlude. Nothing else is allowed to blur the two tiers.
    for (const id of INTERLUDES) {
      if (id === "balloons") continue;
      expect(chapters.has(id), id).toBe(false);
    }
  });
});

/**
 * The pause is the reason any of this exists, so it is worth a check of its
 * own: long enough that a one-year-old gets a breather, short enough that the
 * way onwards is never something to wait out.
 */
describe("the pause before the way onwards", () => {
  it("lasts about as long as a balloon takes to climb the board", () => {
    expect(WAY_OUT_MS).toBeGreaterThan(3000);
    expect(WAY_OUT_MS).toBeLessThan(6000);
  });

  it("is over long before the celebration itself winds down", () => {
    expect(WAY_OUT_MS).toBeLessThan(CELEBRATION_SPAN_MS / 2);
  });
});

describe("a raised celebration", () => {
  const ids: CelebrationId[] = [...Object.values(CHAPTER_CELEBRATIONS), ...INTERLUDES];

  it("carries the id it was asked for", () => {
    for (const id of ids) expect(createCelebration(id).id).toBe(id);
  });

  it("winds its arrivals down, except for the finale", () => {
    for (const id of ids) {
      expect(createCelebration(id).endless).toBe(id === FINALE);
    }
  });

  it("leaves long enough to be a moment rather than a flash", () => {
    // Whatever this is retuned to, it has to be several times the 700 ms of an
    // ordinary level's fanfare or it is not a bigger moment at all.
    expect(CELEBRATION_SPAN_MS).toBeGreaterThan(10_000);
  });
});

describe("a rainbow being painted", () => {
  it("starts with nothing and never overfills", () => {
    expect(arcsPainted(0)).toBe(0);
    expect(arcsPainted(-3)).toBe(0);
    expect(arcsPainted(1)).toBe(1);
    expect(arcsPainted(500)).toBe(arcsPainted(7));
  });

  it("climbs one arc per answer until it is whole", () => {
    for (let answered = 0; answered < 7; answered++) {
      expect(arcsPainted(answered + 1)).toBe(arcsPainted(answered) + 1);
    }
  });
});
