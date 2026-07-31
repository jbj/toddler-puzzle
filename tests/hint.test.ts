/**
 * The idle hint.
 *
 * Two things are worth testing here without a browser, and the second is the
 * one that bites.
 *
 * The **rule** - which piece a hint is about - is a pure function, and the
 * interesting cases are the two the issue leaves undefined: the start of a
 * level, where nobody has touched anything, and the moment after a placement,
 * where the piece last touched is home.
 *
 * The **wait** is a state machine with its timers passed in, so a stretch of
 * fourteen seconds is played out in a microsecond and, more to the point, so
 * the races can be. A hint armed against a board that is then replaced must
 * draw nothing into it, and only a machine slow enough to get between the
 * scheduling and the firing would ever show that in a browser. Here the
 * callback is simply held and fired by hand, after the board has gone.
 *
 * What a hint actually looks like is `npm run shot`'s, which lets a real level
 * go idle in Chromium and photographs the result.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  HINT_DELAY_MS,
  createIdleHint,
  hintDelay,
  hintPiece,
  setHintTiming,
  type IdleHint,
} from "../src/hint";
import { pieceId, type PieceId, type PieceShape } from "../src/piece";
import { DEFAULT_SETTINGS, type HintTiming } from "../src/progress";

// --- a fake clock ----------------------------------------------------------

/**
 * The timers a hint would otherwise take from the window, with the pending
 * callback kept where a test can reach it. `fire` runs it whether or not the
 * hint still wants it, which is how a torn-down board is played.
 */
function fakeTimers(): {
  readonly setTimer: (run: () => void, ms: number) => number;
  readonly clearTimer: (id: number) => void;
  readonly pending: () => number | null;
  readonly fire: () => void;
} {
  let next = 1;
  let armed: { id: number; run: () => void; ms: number } | null = null;
  let held: (() => void) | null = null;
  return {
    setTimer: (run, ms) => {
      const id = next++;
      armed = { id, run, ms };
      held = run;
      return id;
    },
    clearTimer: (id) => {
      if (armed?.id === id) armed = null;
    },
    pending: () => armed?.ms ?? null,
    /**
     * Run whatever was last scheduled, cancelled or not, exactly once - which
     * is how a callback that outlived its board is played. A real timer fires
     * at most once, so this drops it afterwards too.
     */
    fire: () => {
      if (!held) throw new Error("Nothing is scheduled to fire.");
      const run = held;
      held = null;
      armed = null;
      run();
    },
  };
}

interface Watched {
  readonly hint: IdleHint;
  readonly timers: ReturnType<typeof fakeTimers>;
  readonly shown: () => number;
  readonly hidden: () => number;
}

function watch(timing: HintTiming = "sooner"): Watched {
  setHintTiming(timing);
  const timers = fakeTimers();
  let shown = 0;
  let hidden = 0;
  const hint = createIdleHint({
    show: () => shown++,
    hide: () => hidden++,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return { hint, timers, shown: () => shown, hidden: () => hidden };
}

// A hint registers itself so that a switch moved mid-play reaches the board.
// Left registered, it would be stirred by the next test's `setHintTiming`.
const opened: IdleHint[] = [];
const open = (timing: HintTiming = "sooner"): Watched => {
  const watched = watch(timing);
  opened.push(watched.hint);
  return watched;
};

afterEach(() => {
  for (const hint of opened.splice(0)) hint.stop();
  setHintTiming(DEFAULT_SETTINGS.hints);
});

// --- the delays ------------------------------------------------------------

describe("how long the game waits", () => {
  it("waits for nothing at all when hints are off", () => {
    expect(HINT_DELAY_MS.off).toBeNull();
    setHintTiming("off");
    expect(hintDelay()).toBeNull();
  });

  it("waits a real, and shorter, time on sooner than on later", () => {
    const sooner = HINT_DELAY_MS.sooner;
    const later = HINT_DELAY_MS.later;
    expect(sooner).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(sooner as number);
  });

  it("reads the timing in force rather than the one it was built with", () => {
    setHintTiming("sooner");
    expect(hintDelay()).toBe(HINT_DELAY_MS.sooner);
    setHintTiming("later");
    expect(hintDelay()).toBe(HINT_DELAY_MS.later);
  });
});

// --- the wait --------------------------------------------------------------

describe("waiting for an idle board", () => {
  it("starts watching as soon as the board is dealt", () => {
    const { timers, shown } = open("sooner");
    expect(timers.pending()).toBe(HINT_DELAY_MS.sooner);
    expect(shown()).toBe(0);
  });

  it("shows once the wait runs out", () => {
    const { timers, shown } = open();
    timers.fire();
    expect(shown()).toBe(1);
  });

  it("never shows at all when hints are off", () => {
    const { hint, shown } = open("off");
    hint.stir();
    expect(shown()).toBe(0);
  });

  it("starts the wait again rather than adding to it", () => {
    const { hint, timers } = open("sooner");
    for (let stir = 0; stir < 20; stir++) hint.stir();
    // One pending callback, however much has happened; the fake timers hold
    // exactly one, and clearing an unknown id would have left the old one.
    expect(timers.pending()).toBe(HINT_DELAY_MS.sooner);
  });

  it("takes a showing hint down when something happens", () => {
    const { hint, timers, shown, hidden } = open();
    timers.fire();
    expect(shown()).toBe(1);
    hint.stir();
    expect(hidden()).toBe(1);
  });

  it("does not hide what was never shown", () => {
    const { hint, hidden } = open();
    hint.stir();
    hint.stir();
    expect(hidden()).toBe(0);
  });

  it("holds still while a finger is down, and does not re-arm", () => {
    const { hint, timers, shown, hidden } = open();
    timers.fire();
    hint.pause();
    expect(hidden()).toBe(1);
    expect(timers.pending()).toBeNull();
    // Whatever else the drag does, nothing comes back until something stirs.
    hint.pause();
    expect(shown()).toBe(1);
    hint.stir();
    expect(timers.pending()).toBe(HINT_DELAY_MS.sooner);
  });
});

// --- the races -------------------------------------------------------------

describe("a board that has been replaced", () => {
  it("draws nothing into it, however late the callback arrives", () => {
    const { hint, timers, shown } = open();
    // The board goes - a new level, a re-deal, a turned tablet - and only then
    // does the wait that was armed against it come due.
    hint.stop();
    timers.fire();
    expect(shown()).toBe(0);
  });

  it("takes a showing hint down as it goes", () => {
    const { hint, timers, hidden } = open();
    timers.fire();
    hint.stop();
    expect(hidden()).toBe(1);
  });

  it("arms nothing from a stray event after the teardown", () => {
    const { hint, timers, shown } = open();
    hint.stop();
    hint.stir();
    expect(timers.pending()).toBeNull();
    hint.pause();
    timers.fire();
    expect(shown()).toBe(0);
  });

  it("can be stopped twice", () => {
    const { hint, timers, hidden } = open();
    timers.fire();
    hint.stop();
    hint.stop();
    expect(hidden()).toBe(1);
  });
});

// --- a switch moved mid-play ----------------------------------------------

describe("a grown-up moving the switch", () => {
  it("takes a showing hint down the moment hints are switched off", () => {
    const { timers, shown, hidden } = open("sooner");
    timers.fire();
    expect(shown()).toBe(1);
    setHintTiming("off");
    expect(hidden()).toBe(1);
    expect(timers.pending()).toBeNull();
    expect(shown()).toBe(1);
  });

  it("puts a live board on the shorter clock at once", () => {
    const { timers } = open("later");
    expect(timers.pending()).toBe(HINT_DELAY_MS.later);
    setHintTiming("sooner");
    expect(timers.pending()).toBe(HINT_DELAY_MS.sooner);
  });

  it("does not reach a board that has already gone", () => {
    const { hint, timers, shown } = open("later");
    hint.stop();
    setHintTiming("sooner");
    expect(timers.pending()).toBeNull();
    timers.fire();
    expect(shown()).toBe(0);
  });
});

// --- which piece -----------------------------------------------------------

const shape = (name: string): PieceShape => ({
  id: pieceId(name),
  outline: "M0 0 H240 V240 H0 Z",
  artwork: "",
  box: { width: 240, height: 240 },
  inked: { x: 0, y: 0, width: 240, height: 240 },
  anchor: { x: 120, y: 240 },
  label: name,
});

const cast = [shape("a"), shape("b"), shape("c")];
const id = (name: string): PieceId => pieceId(name);
const placed = (...names: string[]): Set<PieceId> => new Set(names.map(id));

describe("which piece the hint is about", () => {
  it("is the one the child last touched", () => {
    expect(hintPiece(cast, placed(), id("c"))?.id).toBe(id("c"));
  });

  it("is some piece that still needs moving before anything has been touched", () => {
    // The child who has not yet worked out that pieces move is exactly the one
    // the hint exists for, so "nobody has touched anything" must not mean
    // "no help". See docs/decisions/20260730T213000.
    const first = hintPiece(cast, placed(), null);
    expect(first).not.toBeNull();
    expect(placed().has(first?.id as PieceId)).toBe(false);
  });

  it("moves on once the piece last touched is home", () => {
    const next = hintPiece(cast, placed("a"), id("a"));
    expect(next?.id).not.toBe(id("a"));
    expect(next?.id).toBe(id("b"));
  });

  it("ignores a piece left over from another board", () => {
    const next = hintPiece(cast, placed(), id("elephant-from-last-level"));
    expect(next?.id).toBe(id("a"));
  });

  it("has nothing to say once every piece is home", () => {
    expect(hintPiece(cast, placed("a", "b", "c"), id("a"))).toBeNull();
  });

  it("has nothing to say about a level with no pieces", () => {
    expect(hintPiece([], placed(), null)).toBeNull();
  });
});
