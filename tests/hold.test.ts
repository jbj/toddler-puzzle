/**
 * The press a toddler cannot make.
 *
 * The hold is the whole of what keeps a two-year-old out of the grown-up panel
 * and away from the button that throws their puzzle away, so it is a plain
 * state machine with the clock passed in: a hundred taps can be played through
 * it in a millisecond, which is exactly the case a real timer makes tedious to
 * check.
 *
 * The wiring round it needs something to listen on, so the second half of this
 * file gives it a button, a clock and the four window functions it reaches for.
 * The ring itself is `npm run shot`'s, which taps both buttons and holds both.
 */
import { describe, expect, it } from "vitest";
import { HOLD_MS, PROMPT_MS, createHoldGate, watchHold } from "../src/hold";

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

/**
 * A button, a clock and the four window functions `watchHold` reaches for. Small
 * enough to read, and the only way to play a finger sliding off the button
 * without a browser: with the pointer captured there is no `pointerleave` to
 * lean on, so the drift check is the whole of that rule.
 */
function fakeButton(): {
  readonly button: Element;
  readonly box: { left: number; top: number; right: number; bottom: number };
  readonly send: (type: string, x: number, y: number) => void;
  readonly tick: (ms: number) => void;
  readonly now: () => number;
} {
  const box = { left: 0, top: 0, right: 60, bottom: 60 };
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  let clock = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  let nextTimer = 1;

  const button = {
    getBoundingClientRect: () => box,
    setPointerCapture: () => undefined,
    addEventListener(
      type: string,
      handler: (event: unknown) => void,
      options?: AddEventListenerOptions,
    ) {
      const forType = handlers.get(type) ?? new Set();
      forType.add(handler);
      handlers.set(type, forType);
      options?.signal?.addEventListener("abort", () => forType.delete(handler));
    },
  } as unknown as Element;

  const browser = globalThis as unknown as Record<string, unknown>;
  browser["window"] = {
    // Frames never arrive here: the rule is the clock, and the timer below is
    // what arms it, which is exactly the claim these cases are checking.
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => undefined,
    setTimeout: (run: () => void, ms: number) => {
      const id = nextTimer++;
      timers.set(id, { at: clock + ms, run });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  };

  return {
    button,
    box,
    send: (type, x, y) => {
      for (const handler of handlers.get(type) ?? []) {
        handler({ clientX: x, clientY: y, pointerId: 1, preventDefault: () => undefined });
      }
    },
    tick: (ms) => {
      clock += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock) {
          timers.delete(id);
          timer.run();
        }
      }
    },
    now: () => clock,
  };
}

describe("wiring a button to the hold", () => {
  it("gives the hold up the moment the finger leaves the button", () => {
    const wiring = fakeButton();
    let held = 0;
    watchHold(wiring.button, {
      gate: createHoldGate(),
      now: wiring.now,
      held: () => held++,
    });

    // Off the button in the same millisecond the press landed, which is the
    // case a ring that has filled nothing cannot be asked about.
    wiring.send("pointerdown", 30, 30);
    wiring.send("pointermove", 200, 30);
    wiring.tick(HOLD_MS * 2);
    expect(held).toBe(0);
  });

  it("keeps the hold while the finger stays on the button", () => {
    const wiring = fakeButton();
    let held = 0;
    watchHold(wiring.button, {
      gate: createHoldGate(),
      now: wiring.now,
      held: () => held++,
    });

    wiring.send("pointerdown", 30, 30);
    wiring.send("pointermove", 31, 32);
    wiring.tick(HOLD_MS * 2);
    expect(held).toBe(1);
  });

  it("hears nothing in a finger crossing the button with no press behind it", () => {
    const wiring = fakeButton();
    const paints: number[] = [];
    watchHold(wiring.button, {
      gate: createHoldGate(),
      now: wiring.now,
      held: () => undefined,
      paint: (state) => paints.push(state.fill),
    });

    const painted = paints.length;
    wiring.send("pointermove", 200, 30);
    expect(paints.length).toBe(painted);
  });

  it("takes its listeners and its timers down when the board is replaced", () => {
    const wiring = fakeButton();
    let held = 0;
    const stop = watchHold(wiring.button, {
      gate: createHoldGate(),
      now: wiring.now,
      held: () => held++,
    });

    wiring.send("pointerdown", 30, 30);
    stop();
    wiring.tick(HOLD_MS * 2);
    expect(held).toBe(0);
    wiring.send("pointerdown", 30, 30);
    wiring.tick(HOLD_MS * 2);
    expect(held).toBe(0);
  });
});
