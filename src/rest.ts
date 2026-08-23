/**
 * Before changing this file, read docs/feel.md.
 *
 * Rest: what the game does when nobody is playing it.
 *
 * A board can keep costing frames while nobody is playing: the idle hint pulses,
 * celebrations animate, the finish button breathes, and the audio context
 * renders silence. A tablet put down must not carry on doing that indefinitely.
 *
 * So after two minutes with nothing touched - and the moment the tab is hidden -
 * the whole page is frozen, and anything that says somebody is there unfreezes
 * it: a finger, a key, a mouse crossing the board, or the tab being looked at
 * again.
 *
 * **A freeze, never a state change.** Nothing ends, nothing advances, nothing is
 * put away: every animation is paused where it stood and resumed from there, so
 * the finale that "never winds down" does not wind down, and a child who comes
 * back finds the same screen they left, moving again. Sleep is invisible in the
 * game's own state; only `data-asleep` on the document says it happened.
 *
 * **`document.getAnimations()` is the blunt instrument on purpose.** Registering
 * every animation with this module would be a list to keep in step, and the one
 * that got forgotten would be the one still running. Asking the document what is
 * running catches the CSS pulse, the balloons, the parade, the button, and
 * whatever is added next by somebody who has never read this file.
 *
 * Repeating *timers* cannot be found that way, so the two that exist ask for
 * themselves: `repeatWhileAwake` is what `celebration.ts` uses instead of
 * `setInterval`.
 *
 * The rule half is a state machine with its timers passed in, in the spirit of
 * `createIdleHint` in `hint.ts`, so two minutes of sitting still is played out
 * in a microsecond in Vitest.
 */
import { restAudio, stirAudio } from "./audio";

/**
 * How long the game goes untouched before it sleeps.
 *
 * Long enough that it is never the child who wakes it - a two-year-old who is
 * thinking, or being talked to, or fetching a different toy to put on the
 * screen, is back well inside it - and short enough that a tablet left face up
 * on the sofa stops drawing within the same minute somebody would have noticed.
 * The hint is the thing most likely to be on screen when this lands, and the
 * hint holds rather than pulsing (`[data-asleep]` in `style.css`), so nothing
 * the child needs goes away with the animation.
 */
export const REST_DELAY_MS = 120_000;

/**
 * How long a rebuild for a new orientation is given to finish.
 *
 * Longer than the debounce on the resize handler in `game.ts`, which is what
 * this waits out.
 */
const RELAYOUT_SETTLE_MS = 400;

/** The wait, as three verbs. `stop` latches, so a torn-down page draws nothing. */
export interface Rest {
  /** Something happened. Wake if asleep, and start the wait again. */
  stir(): void;
  /** Sleep now, whatever the wait says. What a hidden tab does. */
  restNow(): void;
  /** Finished with. Wake, disarm, and never sleep again; safe to call twice. */
  stop(): void;
  /** For tests and for the sweep: whether the game is currently asleep. */
  asleep(): boolean;
}

export interface RestOptions {
  /** Freeze everything. Called once per transition, never twice running. */
  readonly sleep: () => void;
  /** Unfreeze everything. Called only when the game is actually asleep. */
  readonly wake: () => void;
  /** How long the game goes untouched before it sleeps. */
  readonly delayMs?: number;
  /** Injectable so the two minutes can be played out without waiting. */
  readonly setTimer?: (run: () => void, ms: number) => number;
  readonly clearTimer?: (id: number) => void;
}

export function createRest(options: RestOptions): Rest {
  const setTimer = options.setTimer ?? ((run, ms) => window.setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));
  const delayMs = options.delayMs ?? REST_DELAY_MS;

  let timer: number | null = null;
  let sleeping = false;
  let stopped = false;

  const disarm = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const arm = (): void => {
    disarm();
    timer = setTimer(() => {
      timer = null;
      if (stopped || sleeping) return;
      sleeping = true;
      options.sleep();
    }, delayMs);
  };

  const rest: Rest = {
    stir() {
      if (stopped) return;
      if (sleeping) {
        sleeping = false;
        options.wake();
      }
      arm();
    },
    restNow() {
      if (stopped || sleeping) return;
      disarm();
      sleeping = true;
      options.sleep();
    },
    stop() {
      stopped = true;
      disarm();
      if (sleeping) {
        sleeping = false;
        options.wake();
      }
    },
    asleep: () => sleeping,
  };

  // The wait begins at once: a game opened and then put down without being
  // touched is the case this is most obviously for, and nothing would ever stir
  // it.
  arm();
  return rest;
}

// --- timers -----------------------------------------------------------------

/**
 * A repeating timer that only ticks while the game is awake.
 *
 * The game's repeat is a belt-and-braces refill - a celebration's arrivals -
 * so a tick missed while the screen was frozen is a tick nobody wanted: there
 * was nothing to top up, because nothing had popped.
 * They therefore stop dead and start again on waking rather than catching up.
 *
 * The returned function cancels it, exactly as `clearInterval` did.
 */
export function repeatWhileAwake(ms: number, run: () => void): () => void {
  return schedule({ ms, run, once: false, left: ms, since: 0, timer: null });
}

/**
 * A one-shot timer whose countdown stops while the game is asleep, and picks up
 * the rest of it on waking.
 *
 * A celebration is what needs this. Every balloon hands its place on to the
 * next one part way up, on a timer, and the next one arrives with an animation
 * of its own - so a party left alone with a plain `setTimeout` goes on minting
 * balloons behind the freeze, for as long as the tablet has battery in the case
 * of the finale, which never stops arriving. Stopping the clock rather than
 * dropping the timer is what keeps that a freeze: the balloon still hands on,
 * a moment after somebody comes back.
 *
 * The returned function cancels it, exactly as `clearTimeout` did.
 */
export function afterWhileAwake(ms: number, run: () => void): () => void {
  return schedule({ ms, run, once: true, left: ms, since: 0, timer: null });
}

interface Timer {
  readonly ms: number;
  readonly run: () => void;
  readonly once: boolean;
  /** How much of a one-shot's wait is left to serve. */
  left: number;
  /** When the current stretch of it began. */
  since: number;
  timer: number | null;
}

const timers = new Set<Timer>();
let resting = false;

function schedule(timer: Timer): () => void {
  if (!resting) start(timer);
  timers.add(timer);
  return () => {
    halt(timer);
    timers.delete(timer);
  };
}

// Bare rather than `window.`-qualified, so the registry can be played out in
// Vitest, which runs these tests without a DOM.
function start(timer: Timer): void {
  if (timer.timer !== null) return;
  timer.since = Date.now();
  timer.timer = timer.once
    ? setTimeout(() => {
        timer.timer = null;
        timers.delete(timer);
        timer.run();
      }, timer.left)
    : setInterval(timer.run, timer.ms);
}

function halt(timer: Timer): void {
  if (timer.timer === null) return;
  if (timer.once) {
    clearTimeout(timer.timer);
    timer.left = Math.max(0, timer.left - (Date.now() - timer.since));
  } else {
    clearInterval(timer.timer);
  }
  timer.timer = null;
}

/** Freeze or unfreeze every registered timer. Exported for the page wiring. */
export function restTimers(asleep: boolean): void {
  resting = asleep;
  for (const timer of timers) {
    if (asleep) halt(timer);
    else start(timer);
  }
}

// --- the page ---------------------------------------------------------------

/**
 * Everything the freeze does to the document, and the events that undo it.
 *
 * The wake listeners are in the **capture** phase, so the touch that wakes the
 * game still reaches the game: a finger landing on a piece wakes the page and
 * then picks the piece up, in that order, and a child never has to tap twice. They
 * are passive, since none of them does anything to the event.
 *
 * `pointermove` counts as being there - a mouse being moved over the board is
 * somebody at the screen - but it arrives in floods, so it only re-arms the wait
 * once a stretch rather than on every pixel.
 */
export function startResting(options: { readonly delayMs?: number } = {}): Rest {
  const root = document.documentElement;
  let paused: Animation[] = [];

  const freeze = (): void => {
    for (const animation of document.getAnimations()) {
      if (animation.playState !== "running") continue;
      animation.pause();
      paused.push(animation);
    }
  };

  const rest = createRest({
    ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
    sleep() {
      // First, so the hint stops pulsing and starts holding before the sweep
      // below would otherwise freeze its glow at whatever opacity the fade had
      // reached. `animation: none` in the stylesheet takes it out of
      // `getAnimations` entirely, which is why it does not need resuming.
      root.dataset["asleep"] = "true";
      freeze();
      restTimers(true);
      restAudio();
    },
    wake() {
      delete root.dataset["asleep"];
      // Only what is still paused. A rebuild while asleep can cancel an
      // animation out from under the freeze, and `play()` on a cancelled
      // animation starts it again from the beginning - a state change, on a
      // board that is no longer on the screen. Resuming is the whole promise
      // here; restarting is the opposite of it.
      for (const animation of paused) {
        if (animation.playState === "paused") animation.play();
      }
      paused = [];
      restTimers(false);
      stirAudio();
    },
  });

  let lastStir = 0;
  const listen = (type: string, run: (event: Event) => void): void => {
    window.addEventListener(type, run, { capture: true, passive: true });
  };

  // The speakers are asked here as well as in `wake` above, and not only on the
  // way out of sleep. A wake with no finger in it - a tab looked at again - can
  // have its `resume()` turned down by a browser that wants a gesture first,
  // and `audio.ts` leaves the speakers down when that happens so that the next
  // touch asks again. This is that touch. Asking when they are already up is a
  // boolean and a return.
  for (const type of ["pointerdown", "pointerup", "keydown", "wheel"]) {
    listen(type, () => {
      rest.stir();
      stirAudio();
    });
  }
  listen("pointermove", () => {
    const now = Date.now();
    if (!rest.asleep() && now - lastStir < 1000) return;
    lastStir = now;
    rest.stir();
  });

  // A tab put behind another window, a screen locked, an app switched away
  // from: none of that is worth a single further frame, and the two-minute wait
  // would go on drawing for two more minutes of nobody looking. Looked at
  // again is somebody there, so it wakes without waiting to be touched: a
  // screenful of balloons hanging still is a poor thing to come back to, and the
  // saving that matters - a tablet face up on the sofa - is untouched by this.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") rest.restNow();
    else rest.stir();
  });

  // Turning a sleeping tablet is the one thing that can start an animation with
  // no finger on the screen: `game.ts` rebuilds the board for the new
  // orientation, and a board rebuilt while the page is asleep arrives with the
  // pieces settling and the finish button breathing again, at nobody. So the
  // sweep is run once more after the rebuild has settled - comfortably after
  // that handler's own 150ms debounce - and whatever it catches joins the rest
  // to be resumed on waking. Everything else that animates needs a touch, and a
  // touch has already woken the game by the time it gets there.
  let resweep = 0;
  listen("resize", () => {
    if (!rest.asleep()) return;
    window.clearTimeout(resweep);
    resweep = window.setTimeout(() => {
      if (rest.asleep()) freeze();
    }, RELAYOUT_SETTLE_MS);
  });

  return rest;
}
