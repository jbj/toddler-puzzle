/**
 * Resting: what the game does when nobody is playing it.
 *
 * Two halves are worth testing without a browser.
 *
 * The **wait** is a state machine with its timers passed in, so two minutes of
 * sitting still is played out in a microsecond - and, more to the point, so the
 * transitions can be counted. Freezing a page twice would pause a second set of
 * animations that are already paused and lose the first set; waking one that is
 * already awake would restart animations nobody stopped. Both of those are
 * invisible in a browser until a tablet has been left alone in exactly the
 * wrong way, and both are a counter here.
 *
 * The **timers** are the ones `document.getAnimations()` cannot find: the
 * bubbles' refill, a celebration's arrivals, and the wait that hands one
 * balloon's place on to the next. What matters is that one registered while the
 * game is asleep does not start ticking, because a celebration mounted by a
 * tablet being turned in a dark room is exactly that - and that a one-shot
 * stops its clock rather than losing it, or a balloon that was half way to
 * handing on would never do it.
 *
 * What sleeping actually looks like - `data-asleep`, nothing running, and a tap
 * that both wakes the page and pops the bubble it landed on - is `npm run
 * shot`'s, which freezes a real level in Chromium.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REST_DELAY_MS,
  afterWhileAwake,
  createRest,
  repeatWhileAwake,
  restTimers,
  type Rest,
} from "../src/rest";

// --- a fake clock ----------------------------------------------------------

/** The timers a rest would otherwise take from the window, driven by hand. */
function fakeTimers(): {
  readonly setTimer: (run: () => void, ms: number) => number;
  readonly clearTimer: (id: number) => void;
  readonly pending: () => number | null;
  readonly fire: () => void;
} {
  let next = 1;
  let armed: { id: number; run: () => void; ms: number } | null = null;
  return {
    setTimer: (run, ms) => {
      // A rest has one wait at a time, and arming a second without dropping the
      // first is the leak worth catching: on a real page it would be a timer
      // per touch, all of them still pending. Silently overwriting `armed` here
      // would let that through.
      if (armed) throw new Error("A timer was armed while another was pending.");
      const id = next++;
      armed = { id, run, ms };
      return id;
    },
    clearTimer: (id) => {
      if (armed?.id === id) armed = null;
    },
    pending: () => armed?.ms ?? null,
    fire: () => {
      if (!armed) throw new Error("Nothing is scheduled to fire.");
      const { run } = armed;
      armed = null;
      run();
    },
  };
}

interface Watched {
  readonly rest: Rest;
  readonly timers: ReturnType<typeof fakeTimers>;
  readonly slept: () => number;
  readonly woke: () => number;
}

function watch(delayMs = REST_DELAY_MS): Watched {
  const timers = fakeTimers();
  let slept = 0;
  let woke = 0;
  const rest = createRest({
    sleep: () => slept++,
    wake: () => woke++,
    delayMs,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return { rest, timers, slept: () => slept, woke: () => woke };
}

// --- the wait ---------------------------------------------------------------

describe("waiting for a game nobody is playing", () => {
  it("waits a couple of quiet minutes, not a couple of seconds", () => {
    // Long enough that a two-year-old who is thinking, or being talked to, is
    // never the one who wakes it.
    expect(REST_DELAY_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("starts watching the moment the page is up, before anything is touched", () => {
    const { timers } = watch(1000);
    expect(timers.pending()).toBe(1000);
  });

  it("sleeps once the wait runs out", () => {
    const { rest, timers, slept } = watch(1000);
    rest.stir();
    expect(timers.pending()).toBe(1000);
    timers.fire();
    expect(slept()).toBe(1);
    expect(rest.asleep()).toBe(true);
  });

  it("starts the wait again every time something happens", () => {
    const { rest, timers, slept } = watch(1000);
    rest.stir();
    rest.stir();
    rest.stir();
    expect(slept()).toBe(0);
    timers.fire();
    expect(slept()).toBe(1);
  });

  it("wakes on the first thing that happens, and only once", () => {
    const { rest, timers, slept, woke } = watch(1000);
    rest.stir();
    timers.fire();
    rest.stir();
    expect(woke()).toBe(1);
    expect(rest.asleep()).toBe(false);
    rest.stir();
    rest.stir();
    expect(woke()).toBe(1);
    // And it is watching again rather than staying awake for good.
    timers.fire();
    expect(slept()).toBe(2);
  });

  it("never freezes a page that is already frozen", () => {
    const { rest, timers, slept } = watch(1000);
    rest.stir();
    timers.fire();
    rest.restNow();
    expect(slept()).toBe(1);
  });

  it("sleeps at once when the tab is hidden, without waiting", () => {
    const { rest, timers, slept } = watch(1000);
    rest.stir();
    rest.restNow();
    expect(slept()).toBe(1);
    expect(rest.asleep()).toBe(true);
    // The wait is disarmed rather than left to fire into a sleeping page.
    expect(timers.pending()).toBeNull();
  });

  it("leaves nothing frozen behind when it is stopped", () => {
    const { rest, timers, woke } = watch(1000);
    rest.stir();
    timers.fire();
    rest.stop();
    expect(woke()).toBe(1);
    expect(rest.asleep()).toBe(false);
  });

  it("never sleeps again once stopped, however hard it is poked", () => {
    const { rest, timers, slept } = watch(1000);
    rest.stop();
    rest.stir();
    rest.restNow();
    expect(timers.pending()).toBeNull();
    expect(slept()).toBe(0);
    rest.stop();
  });
});

// --- the timers -------------------------------------------------------------

describe("timers that only tick while the game is awake", () => {
  afterEach(() => {
    restTimers(false);
    vi.useRealTimers();
  });

  it("ticks while the game is awake", () => {
    vi.useFakeTimers();
    let ticks = 0;
    const cancel = repeatWhileAwake(100, () => ticks++);
    vi.advanceTimersByTime(350);
    expect(ticks).toBe(3);
    cancel();
  });

  it("stops dead when the game sleeps and picks up when it wakes", () => {
    vi.useFakeTimers();
    let ticks = 0;
    const cancel = repeatWhileAwake(100, () => ticks++);
    vi.advanceTimersByTime(150);
    restTimers(true);
    vi.advanceTimersByTime(10_000);
    expect(ticks).toBe(1);
    restTimers(false);
    vi.advanceTimersByTime(150);
    expect(ticks).toBe(2);
    cancel();
  });

  it("does not start one registered while the game is asleep", () => {
    vi.useFakeTimers();
    restTimers(true);
    let ticks = 0;
    const cancel = repeatWhileAwake(100, () => ticks++);
    vi.advanceTimersByTime(10_000);
    expect(ticks).toBe(0);
    restTimers(false);
    vi.advanceTimersByTime(150);
    expect(ticks).toBe(1);
    cancel();
  });

  it("holds a one-shot's clock while the game sleeps, rather than losing it", () => {
    vi.useFakeTimers();
    let fired = 0;
    afterWhileAwake(100, () => fired++);
    vi.advanceTimersByTime(60);
    restTimers(true);
    vi.advanceTimersByTime(10_000);
    expect(fired).toBe(0);

    restTimers(false);
    // The 40ms it had left, and not a millisecond of the ten seconds nobody
    // was there for.
    vi.advanceTimersByTime(39);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1);
    expect(fired).toBe(1);

    // And once only, however long the game goes on.
    vi.advanceTimersByTime(10_000);
    expect(fired).toBe(1);
  });

  it("does not start a one-shot registered while the game is asleep", () => {
    vi.useFakeTimers();
    restTimers(true);
    let fired = 0;
    const cancel = afterWhileAwake(100, () => fired++);
    vi.advanceTimersByTime(10_000);
    expect(fired).toBe(0);
    restTimers(false);
    vi.advanceTimersByTime(100);
    expect(fired).toBe(1);
    cancel();
  });

  it("stays cancelled, asleep or awake", () => {
    vi.useFakeTimers();
    let ticks = 0;
    const cancel = repeatWhileAwake(100, () => ticks++);
    cancel();
    restTimers(true);
    restTimers(false);
    vi.advanceTimersByTime(10_000);
    expect(ticks).toBe(0);
  });
});
