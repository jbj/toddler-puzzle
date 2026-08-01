/**
 * Where the celebrations fall, and that there is one everywhere there needs to
 * be.
 *
 * Almost all of a celebration is a thing on a screen answering a finger, and
 * none of that can be seen from here: the suite runs in node, with no DOM to
 * draw into. What it *is* checked against is the screenshot run, which plays the
 * balloons and the finale for real (`scripts/shot.mjs`).
 *
 * So what is worth asserting here is the wiring nobody would notice was wrong
 * until a child had played twenty-five levels to find out: that every chapter
 * ends with something, that the finale belongs to the end of the game and to
 * nothing else, and that `endsChapter` agrees with the table it is read from.
 */
import { describe, expect, it } from "vitest";
import {
  CELEBRATIONS,
  CELEBRATION_SPAN_MS,
  type CelebrationId,
  FINALE,
  arcsPainted,
  celebrationFor,
  createCelebration,
} from "../src/celebration";
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
    for (const id of Object.keys(CELEBRATIONS)) {
      expect(chapters.has(id)).toBe(true);
    }
  });

  /**
   * A celebration is never made of what the finished board is made of, and the
   * parade is made of animals - so it may not end a chapter that finishes on a
   * board of animals, which is where it used to be. Nothing else here would
   * notice: the wiring would be perfectly correct and the screen would be two
   * sets of the same animals. See
   * [decision 20260801T160000](../docs/decisions/20260801T160000-a-celebration-is-not-made-of-the-board.md).
   */
  it("never walks a parade of animals over a board of animals", () => {
    const paradeIn = new Set<CelebrationId>(["parade", FINALE]);
    const animalKinds = new Set<PuzzleKindId>(["play", "shape-match", "sliced"]);
    for (const chapter of CHAPTERS) {
      if (!paradeIn.has(celebrationFor(chapter))) continue;
      const last = LEVELS.filter((level) => level.chapter === chapter).at(-1);
      expect(last, chapter).toBeDefined();
      expect(animalKinds.has(last?.kind as PuzzleKindId), `${chapter} ends on ${last?.kind}`).toBe(
        false,
      );
    }
  });
});

describe("when a celebration is due", () => {
  it("falls on the last level of each chapter and nowhere else", () => {
    const ends = LEVELS.filter((level) => endsChapter(level.level)).map((level) => level.level);
    expect(ends).toEqual([5, 10, 15, 20, 25, 30]);
  });

  it("agrees with the chapter numbering it is read from", () => {
    for (const level of LEVELS) {
      const expected =
        level.level === LEVEL_COUNT ||
        chapterNumber(levelSpec(level.level + 1)) !== chapterNumber(level);
      expect(endsChapter(level.level)).toBe(expected);
    }
  });

  it("gives the game exactly five chapter moments and one ending", () => {
    const ends = LEVELS.filter((level) => endsChapter(level.level));
    expect(ends).toHaveLength(6);
    expect(ends.filter((level) => celebrationFor(level.chapter) === FINALE)).toHaveLength(1);
  });

  it("says nothing about a level the table does not have", () => {
    expect(endsChapter(LEVEL_COUNT + 1)).toBe(false);
    expect(endsChapter(0)).toBe(false);
  });
});

describe("a raised celebration", () => {
  const ids = Object.values(CELEBRATIONS);

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
