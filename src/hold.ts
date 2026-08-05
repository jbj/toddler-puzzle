/**
 * Before changing this file, read docs/navigation.md.
 *
 * The press a toddler cannot make.
 *
 * Two buttons in this game do something a two-year-old should not be able to do
 * by leaning on the screen: the "Grown-ups" button, which opens the panel, and
 * the button in the corner of the board, which throws the puzzle in front of
 * the child away and deals another one. Neither is hidden - a parent who has
 * never seen the game has to be able to find both - so what keeps a toddler out
 * is not secrecy but patience. Pressing does nothing; the ring round the button
 * fills, and only a press held for {@link HOLD_MS} counts.
 *
 * This file is both halves of that. {@link createHoldGate} is the rule, with no
 * timers and no DOM in it, so a hundred taps can be played through it in a
 * millisecond. {@link watchHold} is the wiring, which every button that holds
 * shares so that "held" means the same thing on all of them.
 */

/**
 * How long a button has to be held. Two seconds is long enough that no tap, and
 * no drumming of fingers, ever adds up to it, and short enough that an adult
 * holding it while reading "Hold to open" is already most of the way there.
 */
export const HOLD_MS = 2000;

/**
 * How long the prompt stays up after the button is let go. A grown-up's first
 * press is nearly always a tap, and that tap is the moment they need to be told
 * what to do instead; the answer has to still be on screen when they look.
 */
export const PROMPT_MS = 6000;

/** What the button looks like at a given moment. */
export interface HoldState {
  /** Whether the "hold me" prompt is showing. */
  readonly prompt: boolean;
  /** How full the ring is, 0 to 1. */
  readonly fill: number;
  /** Whether the hold has lasted long enough to count. */
  readonly open: boolean;
}

/**
 * The rule that keeps a toddler out, with no timers and no DOM in it: press,
 * let go, and ask what it looks like now. Time is passed in rather than read,
 * so a test can hold the button for two seconds without waiting two seconds.
 */
export interface HoldGate {
  /** The button went down. Starts the hold, from zero, every time. */
  press(now: number): void;
  /** The button came up, or the finger slid off it. The hold is abandoned. */
  cancel(now: number): void;
  state(now: number): HoldState;
  /** Called once the hold has been answered, so the next press starts empty. */
  reset(): void;
  /**
   * The two lengths this gate was made with. The wiring arms its timers off
   * these rather than off the constants, so a gate given a different hold
   * cannot be watched on the default one.
   */
  readonly holdMs: number;
  readonly promptMs: number;
}

export interface HoldGateOptions {
  readonly holdMs?: number;
  readonly promptMs?: number;
}

export function createHoldGate(options: HoldGateOptions = {}): HoldGate {
  const holdMs = options.holdMs ?? HOLD_MS;
  const promptMs = options.promptMs ?? PROMPT_MS;

  let pressedAt: number | null = null;
  let promptUntil = 0;

  return {
    holdMs,
    promptMs,
    press(now) {
      pressedAt = now;
    },
    cancel(now) {
      // Only a press that actually happened leaves the prompt behind, so a
      // stray pointer-up cannot put the hint up on its own.
      if (pressedAt !== null) promptUntil = now + promptMs;
      pressedAt = null;
    },
    state(now) {
      const fill = pressedAt === null ? 0 : Math.min(1, (now - pressedAt) / holdMs);
      return {
        prompt: pressedAt !== null || now < promptUntil,
        fill,
        open: fill >= 1,
      };
    },
    reset() {
      pressedAt = null;
      promptUntil = 0;
    },
  };
}

export interface HoldWatchOptions {
  /** The rule. Its own, so a caller can reset it when the hold is answered. */
  readonly gate: HoldGate;
  /** Injectable so the hold can be driven; `performance.now` in the game. */
  readonly now: () => number;
  /** What the hold was for. Called once, the moment it has lasted. */
  readonly held: () => void;
  /** Show the state: the ring, and whatever prompt the button carries. */
  readonly paint?: (state: HoldState) => void;
  /** The press itself, however it ends. Where audio gets unlocked. */
  readonly pressed?: () => void;
}

/**
 * Wire a button to a gate: press, watch, and answer a hold that lasts. Returns
 * a teardown, because a board is rebuilt under this one and a frame loop left
 * running would be drawing into an element nothing can see.
 */
export function watchHold(element: Element, options: HoldWatchOptions): () => void {
  const { gate, now, held } = options;
  // The gate's own lengths, not the constants: the rule and the timers that
  // arm it have to be answering the same two seconds.
  const { holdMs, promptMs } = gate;
  const listeners = new AbortController();

  let frame = 0;
  let openTimer = 0;
  let promptTimer = 0;
  /**
   * Whether a press is under way. The drift check below needs to know, and how
   * full the ring is cannot tell it: a finger that leaves the button inside the
   * same millisecond it landed has a fill of zero and is still a press.
   */
  let pressing = false;

  const paint = (): void => options.paint?.(gate.state(now()));

  function stopWatching(): void {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(openTimer);
    frame = 0;
    openTimer = 0;
  }

  /** Answer the hold if it has lasted, and stop watching either way. */
  function answerIfHeld(): boolean {
    if (!gate.state(now()).open) return false;
    stopWatching();
    held();
    return true;
  }

  function watch(): void {
    stopWatching();
    const step = (): void => {
      if (answerIfHeld()) return;
      paint();
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    // The frames are for the ring; the rule is the clock. A tab that is not
    // being painted still has to answer a long press, so it is armed on a timer
    // as well and does not depend on a frame arriving.
    openTimer = window.setTimeout(answerIfHeld, holdMs + 20);
  }

  element.addEventListener(
    "pointerdown",
    (event) => {
      const pointer = event as PointerEvent;
      pointer.preventDefault();
      // Capture, so the release that follows a successful hold lands on the
      // button rather than on whatever has just appeared underneath it.
      try {
        (element as Element & { setPointerCapture(id: number): void }).setPointerCapture(
          pointer.pointerId,
        );
      } catch {
        // A browser that will not capture still holds and still answers; it
        // just has to rely on the drift check below to notice a finger leaving.
      }
      options.pressed?.();
      pressing = true;
      gate.press(now());
      paint();
      watch();
    },
    { signal: listeners.signal },
  );

  const letGo = (): void => {
    pressing = false;
    gate.cancel(now());
    stopWatching();
    paint();
    // The prompt outlives the press, so it has to be taken down on a timer
    // rather than by the next pointer event. A toddler will tap this button
    // over and over, so each release replaces the pending timer instead of
    // adding to it: one press, one timer, however fast the tapping.
    window.clearTimeout(promptTimer);
    promptTimer = window.setTimeout(() => {
      promptTimer = 0;
      paint();
    }, promptMs + 50);
  };

  element.addEventListener("pointerup", letGo, { signal: listeners.signal });
  element.addEventListener("pointercancel", letGo, { signal: listeners.signal });
  element.addEventListener(
    "pointermove",
    (event) => {
      // A finger that slides off the button gives up the hold, however early it
      // goes: what matters is that the pointer is outside, not how much of the
      // ring it managed to fill first. With the pointer captured, `pointerleave`
      // never fires, so the drift is measured instead.
      if (!pressing) return;
      const pointer = event as PointerEvent;
      const box = element.getBoundingClientRect();
      const outside =
        pointer.clientX < box.left ||
        pointer.clientX > box.right ||
        pointer.clientY < box.top ||
        pointer.clientY > box.bottom;
      if (outside) letGo();
    },
    { signal: listeners.signal },
  );

  paint();

  return () => {
    listeners.abort();
    pressing = false;
    stopWatching();
    window.clearTimeout(promptTimer);
    promptTimer = 0;
  };
}
