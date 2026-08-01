/**
 * The cause-and-effect levels: the three activities a one-year-old can play
 * before they can drag anything.
 *
 * What is checked here is the promises the levels are built on, because every
 * one of them is a property of the rules rather than of the drawing:
 *
 *  - **there is no way to be wrong.** Nothing is picked up, so nothing can be
 *    dropped anywhere; the kind accepts no drop at all, whatever it is offered.
 *  - **there is no way to get stuck.** Every activity puts at least as many
 *    things on screen as it asks the child to touch, and for everything but
 *    peekaboo strictly more, so ignoring one thing can never end the game.
 *  - **and there is always a way out.** A level that has been touched enough is
 *    over, and so is one that has been up for ten seconds, whatever was touched.
 *
 * What is *not* checked here is what the levels look like or feel like, because
 * none of that survives leaving the browser: whether a bubble is big enough to
 * hit, whether a touch registers, and whether a level can be finished by
 * touching alone are all played for real by `npm run shot`.
 */
import { describe, expect, it, vi } from "vitest";
import { seededRandom } from "../src/geometry";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor, animalInk } from "../src/assets";
import { ACTIVITY_PATIENCE_MS, goalFor, play, thingsFor } from "../src/kinds/play";
import { buildLevelLayout } from "../src/layout";
import { ACTIVITIES, LEVELS, type LevelSpec } from "../src/levels";
import { pieceId, type PieceShape } from "../src/piece";
import type { Puzzle } from "../src/puzzle";

const SHAPES: readonly PieceShape[] = ANIMAL_IDS.map((id) => ({
  id: pieceId(id),
  outline: "",
  artwork: "",
  box: ANIMAL_BOX,
  inked: animalInk(id),
  anchor: animalAnchor(id),
  label: id,
}));

const PLAY_LEVELS = LEVELS.filter((level) => level.kind === "play");

/** The activity levels, dealt. The cast is random, so every deal is a fresh one. */
const dealt = (level: LevelSpec, seed = level.level): Puzzle =>
  play.deal({ level, shapes: SHAPES }, seededRandom(seed));

/** What a level counts as touched, which is where progress lives on an activity. */
const touched = (puzzle: Puzzle): Set<string> =>
  (puzzle as Puzzle & { readonly touched: Set<string> }).touched;

const goalOf = (puzzle: Puzzle): number => (puzzle as Puzzle & { readonly goal: number }).goal;

/**
 * Run something with the clock stopped. `isComplete` reads the wall clock, so a
 * test that asserts a level is *not* over yet has to own the time it takes -
 * and one that waited ten real seconds for the other half is a test nobody
 * runs. Vitest's fake timers move `Date.now` with them, which is what both need.
 */
function atAStandstill(run: (tick: (ms: number) => void) => void): void {
  vi.useFakeTimers();
  try {
    run((ms) => vi.advanceTimersByTime(ms));
  } finally {
    vi.useRealTimers();
  }
}

describe("the level table's activities", () => {
  it("gives the first chapter something to touch as well as something to drag", () => {
    // The point of the chapter is that a child who cannot drag yet still wins
    // something. One touch level would not be that; the alternation is.
    const chapter = LEVELS.filter((level) => level.chapter === "first-touches");
    expect(chapter[0]?.kind).toBe("play");
    expect(chapter.filter((level) => level.kind === "play")).toHaveLength(3);
    expect(chapter.filter((level) => level.kind !== "play").length).toBeGreaterThan(0);
  });

  it("names an activity on every play level, and never one twice", () => {
    // A level that fell back to a default would be a level nobody chose.
    const named = PLAY_LEVELS.map((level) => level.options?.activity);
    for (const [index, activity] of named.entries()) {
      expect(activity, `level ${PLAY_LEVELS[index]?.level}`).toBeDefined();
      expect(ACTIVITIES).toContain(activity);
    }
    expect(new Set(named).size).toBe(named.length);
  });

  it("plays every activity there is", () => {
    const named = new Set(PLAY_LEVELS.map((level) => level.options?.activity));
    for (const activity of ACTIVITIES) expect(named).toContain(activity);
  });
});

describe("dealing an activity", () => {
  it("deals the activity the level asked for", () => {
    for (const level of PLAY_LEVELS) {
      const puzzle = dealt(level);
      expect((puzzle as Puzzle & { activity: string }).activity).toBe(level.options?.activity);
      expect(puzzle.kind).toBe("play");
    }
  });

  it("deals a cast the layout can be composed around", () => {
    // An activity level does not put its animals in a tray - bubbles never
    // draws one at all - but the layout is composed around a cast whatever the
    // kind does with it, and the ramp reads the table's piece count.
    for (const level of PLAY_LEVELS) {
      const puzzle = dealt(level);
      expect(puzzle.pieces).toHaveLength(level.pieces);
      expect(new Set(puzzle.pieces.map((shape) => shape.id)).size).toBe(level.pieces);
      for (const id of ["landscape", "portrait"] as const) {
        expect(() => buildLevelLayout(id, level, puzzle.pieces, puzzle.targets)).not.toThrow();
      }
    }
  });

  it("starts every deal with nothing touched", () => {
    for (const level of PLAY_LEVELS) {
      const puzzle = dealt(level);
      expect(touched(puzzle).size).toBe(0);
      expect(play.isComplete(puzzle)).toBe(false);
    }
  });

  it("deals a different board from a different seed", () => {
    // Every puzzle is dealt fresh, activities included: the animal behind the
    // bush is not the same animal every time.
    const level = PLAY_LEVELS.find((spec) => spec.options?.activity === "peekaboo");
    expect(level).toBeDefined();
    const casts = [1, 2, 3, 4, 5, 6].map((seed) =>
      dealt(level as LevelSpec, seed)
        .pieces.map((shape) => shape.id)
        .join(","),
    );
    expect(new Set(casts).size).toBeGreaterThan(1);
  });
});

describe("no way to get stuck", () => {
  it("never asks for more touches than it puts things on screen", () => {
    for (const activity of ACTIVITIES) {
      for (let cast = 1; cast <= SHAPES.length; cast++) {
        expect(goalFor(activity, cast), `${activity} with ${cast}`).toBeLessThanOrEqual(
          thingsFor(activity, cast),
        );
        expect(goalFor(activity, cast)).toBeGreaterThan(0);
      }
    }
  });

  it("leaves something spare on everything but peekaboo", () => {
    // Uncovering every animal *is* peekaboo, so its goal is all of them. The
    // others must be finishable by a child who never touches one of the things,
    // because a child who has decided a particular cloud is not for them is
    // not going to change their mind.
    for (const activity of ACTIVITIES) {
      if (activity === "peekaboo") continue;
      for (let cast = 1; cast <= SHAPES.length; cast++) {
        expect(goalFor(activity, cast), `${activity} with ${cast}`).toBeLessThan(
          thingsFor(activity, cast),
        );
      }
    }
  });

  it("asks for a goal the levels on the table can actually reach", () => {
    for (const level of PLAY_LEVELS) {
      const puzzle = dealt(level);
      const activity = level.options?.activity;
      expect(activity).toBeDefined();
      expect(goalOf(puzzle)).toBe(goalFor(activity as (typeof ACTIVITIES)[number], level.pieces));
      expect(goalOf(puzzle)).toBeLessThanOrEqual(
        thingsFor(activity as (typeof ACTIVITIES)[number], level.pieces),
      );
    }
  });

  it("finishes on touches alone, and never before the goal", () => {
    atAStandstill(() => {
      for (const level of PLAY_LEVELS) {
        const puzzle = dealt(level);
        const goal = goalOf(puzzle);
        for (let n = 0; n < goal; n++) {
          expect(play.isComplete(puzzle), `level ${level.level} after ${n}`).toBe(false);
          touched(puzzle).add(`thing-${n}`);
        }
        expect(play.isComplete(puzzle)).toBe(true);
        // Nothing here is ever untouched again, so the level cannot come undone.
        touched(puzzle).add("thing-again");
        expect(play.isComplete(puzzle)).toBe(true);
      }
    });
  });

  it("asks for no more than a handful of touches on any level there is", () => {
    // The goal is what a child has to reach before the way onwards is offered,
    // and a one-year-old is not counting up to it. Half a screenful of bubbles
    // is a moment; a whole screenful is a chore with a reward at the end.
    for (const level of PLAY_LEVELS) {
      expect(goalOf(dealt(level)), `level ${level.level}`).toBeLessThanOrEqual(3);
    }
  });

  it("counts the same thing touched twice only once", () => {
    const level = PLAY_LEVELS[0] as LevelSpec;
    const puzzle = dealt(level);
    for (let n = 0; n < 20; n++) touched(puzzle).add("the same bush");
    expect(touched(puzzle).size).toBe(1);
  });
});

describe("there is always a way out", () => {
  it("opens the way onwards after ten seconds, with nothing touched at all", () => {
    // The clock is a second way out and never a way on: the level is over in
    // the sense that raises the button, and nothing else about it changes.
    atAStandstill((tick) => {
      for (const level of PLAY_LEVELS) {
        const puzzle = dealt(level);
        tick(ACTIVITY_PATIENCE_MS - 1);
        expect(play.isComplete(puzzle), `level ${level.level} a moment before`).toBe(false);
        tick(1);
        expect(play.isComplete(puzzle), `level ${level.level} at ten seconds`).toBe(true);
        expect(touched(puzzle).size, `level ${level.level} touched nothing`).toBe(0);
      }
    });
  });

  it("counts the ten seconds from the deal, not from the last touch", () => {
    // The board is rebuilt when the tablet is turned and the puzzle is not, so
    // the deadline lives with the touches rather than on the board: a rotation
    // nine seconds in must not hand out another ten.
    atAStandstill((tick) => {
      const level = PLAY_LEVELS[0] as LevelSpec;
      const puzzle = dealt(level);
      tick(ACTIVITY_PATIENCE_MS - 500);
      touched(puzzle).add("a bubble");
      expect(play.isComplete(puzzle)).toBe(false);
      tick(500);
      expect(play.isComplete(puzzle)).toBe(true);
    });
  });

  it("gives a freshly dealt level its own ten seconds", () => {
    // The reset button deals the same level again, so a level dealt after the
    // clock has run out has to be one to play rather than one already over.
    atAStandstill((tick) => {
      const level = PLAY_LEVELS[0] as LevelSpec;
      expect(play.isComplete(dealt(level))).toBe(false);
      tick(ACTIVITY_PATIENCE_MS * 3);
      expect(play.isComplete(dealt(level))).toBe(false);
    });
  });
});

describe("no way to be wrong", () => {
  it("accepts no drop at all, wherever it lands", () => {
    // Nothing is picked up on these levels and the host builds no pieces for
    // them, so this can never be reached in play. It answers anyway, and
    // answers "no": there is no placement that could be right, so there is none
    // that could be wrong either.
    for (const level of PLAY_LEVELS) {
      const puzzle = dealt(level);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
      for (const shape of puzzle.pieces) {
        for (const at of [
          { x: 0, y: 0 },
          { x: layout.canvas.width / 2, y: layout.canvas.height / 2 },
          layout.holes.get(shape.id) ?? { x: 0, y: 0 },
        ]) {
          expect(play.accepts(puzzle, layout, shape.id, at)).toBe(false);
        }
      }
    }
  });

  it("has no tray to be emptied and no piece to be placed", () => {
    for (const level of PLAY_LEVELS) {
      expect(dealt(level).placed.size).toBe(0);
    }
  });

  it("is played by touching rather than by dragging", () => {
    // The hook is what tells the host to build no pieces and start no drag
    // engine; without it these levels would be a tray nobody could empty.
    expect(typeof play.play).toBe("function");
  });
});

describe("the backdrop", () => {
  it("cuts no holes and lays out no tray", () => {
    for (const level of PLAY_LEVELS) {
      const puzzle = dealt(level);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
      const backdrop = play.backdrop(puzzle, layout);
      expect(backdrop).not.toContain("hole");
      // The sand-coloured tray lip: painted on every dragged level, on none of
      // these, because there is nothing waiting in a tray to sit on it.
      expect(backdrop).not.toContain("#d9c398");
    }
  });

  it("leaves the sky to the scene that answers", () => {
    // `alive` draws its own sun and clouds, big enough to touch. Two suns would
    // be one the child can touch and one they cannot, which is worse than none.
    const alive = PLAY_LEVELS.find((level) => level.options?.activity === "alive") as LevelSpec;
    const other = PLAY_LEVELS.find((level) => level.options?.activity === "bubbles") as LevelSpec;
    const backdropOf = (level: LevelSpec): string => {
      const puzzle = dealt(level);
      return play.backdrop(
        puzzle,
        buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets),
      );
    };
    expect(backdropOf(alive)).not.toContain("#ffd23f");
    expect(backdropOf(other)).toContain("#ffd23f");
  });
});
