/**
 * The panel that is not for the child.
 *
 * Two things here are worth testing without a browser, and they are the two
 * that matter most.
 *
 * The **hold** is the whole of what keeps a toddler out, so it is a plain state
 * machine with the clock passed in: a hundred taps can be played through it in
 * a millisecond, which is exactly the case a real timer makes tedious to check.
 *
 * The **level map** is what a grown-up reads to decide where to send the child,
 * so what it says has to keep meaning what it says however much it is used.
 *
 * The DOM around both - the button, the sheet, the switches - is covered by
 * `npm run shot`, which taps the button, holds it, jumps a level and reloads
 * the page to see whether a setting survived.
 */
import { describe, expect, it } from "vitest";
import { setSoundEnabled, soundEnabled } from "../src/audio";
import {
  HOLD_MS,
  PROMPT_MS,
  applySettings,
  createHoldGate,
  isLastKindOn,
  levelMap,
  toggleKind,
} from "../src/grownups";
import { CHAPTERS, LEVELS, LEVEL_COUNT, PUZZLE_KINDS, type EnabledKinds } from "../src/levels";
import { ALL_KINDS, DEFAULT_SETTINGS, NEW_PLAYER, type Progress } from "../src/progress";

const record = (over: Partial<Progress> = {}): Progress => ({ ...NEW_PLAYER, ...over });

/** Everything in play except the kinds named. */
const without = (...off: readonly (keyof EnabledKinds)[]): EnabledKinds =>
  Object.fromEntries(PUZZLE_KINDS.map((kind) => [kind, !off.includes(kind)])) as EnabledKinds;

const settings = (kinds: EnabledKinds): Progress =>
  record({ settings: { ...DEFAULT_SETTINGS, kinds } });

describe("holding the button", () => {
  it("does not open on a tap, however many times it is tapped", () => {
    const gate = createHoldGate();
    let clock = 0;
    for (let tap = 0; tap < 200; tap++) {
      gate.press(clock);
      // A toddler's tap, and then some: still nowhere near the hold.
      clock += 90;
      expect(gate.state(clock).open).toBe(false);
      gate.cancel(clock);
      clock += 30;
      expect(gate.state(clock).open).toBe(false);
    }
  });

  it("opens when the button is held long enough", () => {
    const gate = createHoldGate();
    gate.press(0);
    expect(gate.state(HOLD_MS - 1).open).toBe(false);
    expect(gate.state(HOLD_MS).open).toBe(true);
  });

  it("fills the ring evenly across the hold", () => {
    const gate = createHoldGate();
    gate.press(1000);
    expect(gate.state(1000).fill).toBe(0);
    expect(gate.state(1000 + HOLD_MS / 2).fill).toBeCloseTo(0.5);
    expect(gate.state(1000 + HOLD_MS * 2).fill).toBe(1);
  });

  it("empties the ring when the button is let go", () => {
    const gate = createHoldGate();
    gate.press(0);
    expect(gate.state(HOLD_MS - 100).fill).toBeGreaterThan(0.9);
    gate.cancel(HOLD_MS - 100);
    expect(gate.state(HOLD_MS - 100).fill).toBe(0);
    // And letting go a hair early does not open it a moment later.
    expect(gate.state(HOLD_MS + 5000).open).toBe(false);
  });

  it("starts the hold over on each press, so two near misses are not one hold", () => {
    const gate = createHoldGate();
    gate.press(0);
    gate.cancel(HOLD_MS - 1);
    gate.press(HOLD_MS - 1);
    expect(gate.state(HOLD_MS).open).toBe(false);
    expect(gate.state(HOLD_MS * 2 - 1).open).toBe(true);
  });

  it("answers a tap with 'Hold to open', and leaves it up long enough to read", () => {
    const gate = createHoldGate();
    expect(gate.state(0).prompt).toBe(false);
    gate.press(0);
    expect(gate.state(10).prompt).toBe(true);
    gate.cancel(120);
    expect(gate.state(120 + PROMPT_MS - 1).prompt).toBe(true);
    expect(gate.state(120 + PROMPT_MS).prompt).toBe(false);
  });

  it("says nothing about a release that followed no press", () => {
    const gate = createHoldGate();
    gate.cancel(500);
    expect(gate.state(600).prompt).toBe(false);
  });

  it("forgets everything once the panel is open", () => {
    const gate = createHoldGate();
    gate.press(0);
    expect(gate.state(HOLD_MS).open).toBe(true);
    gate.reset();
    const after = gate.state(HOLD_MS);
    expect(after).toEqual({ open: false, fill: 0, prompt: false });
  });

  it("can be given a different hold length", () => {
    const gate = createHoldGate({ holdMs: 500, promptMs: 100 });
    gate.press(0);
    expect(gate.state(499).open).toBe(false);
    expect(gate.state(500).open).toBe(true);
  });
});

describe("the level map", () => {
  it("shows every level of the game, in order", () => {
    const entries = levelMap(record(), 1);
    expect(entries).toHaveLength(LEVEL_COUNT);
    expect(entries.map((entry) => entry.level)).toEqual(
      Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1),
    );
  });

  it("marks the levels the child has played, and no more", () => {
    const entries = levelMap(record({ level: 4, furthest: 7 }), 4);
    expect(entries.filter((entry) => entry.reached).map((entry) => entry.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("marks exactly one level as the one being played", () => {
    const entries = levelMap(record({ level: 9, furthest: 12 }), 9);
    expect(entries.filter((entry) => entry.current).map((entry) => entry.level)).toEqual([9]);
  });

  it("takes the current level from the game, not from the record", () => {
    // `?level=` plays a level the record is deliberately not told about, and
    // the map should show where the board actually is.
    const entries = levelMap(record({ level: 4, furthest: 4 }), 30);
    expect(entries.find((entry) => entry.current)?.level).toBe(30);
    expect(entries.filter((entry) => entry.reached)).toHaveLength(4);
  });

  it("groups the thirty into the six chapters, five at a time", () => {
    const entries = levelMap(record(), 1);
    for (const [index, chapter] of CHAPTERS.entries()) {
      const levels = entries.filter((entry) => entry.chapter === chapter).map((e) => e.level);
      expect(levels).toHaveLength(5);
      expect(levels[0]).toBe(index * 5 + 1);
    }
  });
});

describe("the kind switches", () => {
  it("turns a kind off and back on again", () => {
    const off = toggleKind(ALL_KINDS, "jigsaw");
    expect(off).toEqual({ ...ALL_KINDS, jigsaw: false });
    expect(off && toggleKind(off, "jigsaw")).toEqual(ALL_KINDS);
  });

  it("refuses to turn the last kind off, however often it is pressed", () => {
    let kinds: EnabledKinds = ALL_KINDS;
    for (const kind of PUZZLE_KINDS.slice(0, -1)) {
      const next = toggleKind(kinds, kind);
      expect(next, `turning ${kind} off`).not.toBeNull();
      if (next) kinds = next;
    }
    const last = PUZZLE_KINDS[PUZZLE_KINDS.length - 1];
    expect(last).toBeDefined();
    if (!last) return;
    expect(isLastKindOn(kinds, last)).toBe(true);
    for (let press = 0; press < 20; press++) expect(toggleKind(kinds, last)).toBeNull();
    // And a kind already off is not the last one, so its switch stays live.
    const first = PUZZLE_KINDS[0];
    expect(first).toBeDefined();
    if (first) expect(isLastKindOn(kinds, first)).toBe(false);
  });

  it("holds no kind on while there is more than one", () => {
    for (const kind of PUZZLE_KINDS) expect(isLastKindOn(ALL_KINDS, kind)).toBe(false);
  });
});

describe("the level map with a kind switched off", () => {
  it("skips nothing while every kind is in play", () => {
    expect(levelMap(record(), 1).some((entry) => entry.skipped)).toBe(false);
  });

  it("marks the levels of a kind that has been switched off, and keeps all thirty", () => {
    const entries = levelMap(settings(without("jigsaw")), 1);
    expect(entries).toHaveLength(LEVEL_COUNT);
    expect(entries.filter((entry) => entry.skipped).map((entry) => entry.level)).toEqual(
      LEVELS.filter((level) => level.kind === "jigsaw").map((level) => level.level),
    );
  });

  it("still says where the child is, even on a level being skipped", () => {
    // A grown-up can send the child to any square, including one whose kind is
    // switched off; the map has to go on saying both things.
    const entries = levelMap(settings(without("jigsaw")), 21);
    const current = entries.find((entry) => entry.current);
    expect(current?.level).toBe(21);
    expect(current?.skipped).toBe(true);
  });
});

describe("applying a setting", () => {
  it("silences the whole game when sound is off", () => {
    applySettings({ ...DEFAULT_SETTINGS, sound: false });
    expect(soundEnabled()).toBe(false);
    applySettings({ ...DEFAULT_SETTINGS, sound: true });
    expect(soundEnabled()).toBe(true);
  });

  it("leaves sound on for a player who has never changed anything", () => {
    setSoundEnabled(false);
    applySettings(DEFAULT_SETTINGS);
    expect(soundEnabled()).toBe(true);
  });
});
