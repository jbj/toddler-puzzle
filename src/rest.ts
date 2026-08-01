/**
 * Rest: what the game does when nobody is playing it.
 *
 * A board left alone used to go on costing frames forever. The idle hint's glow
 * pulses (`hint-pulse` in `style.css`, and an opacity animation on SVG repaints
 * rather than composites), the bubbles drift and respawn, the finish button
 * breathes on `iterations: Infinity`, a celebration walks its parade round and
 * refills itself on a timer, and the audio context renders silence into the
 * speakers. A tablet put down on a finished chapter would have carried on doing
 * all of that until its battery went.
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
 * running catches the CSS pulse, the bubbles, the parade, the button, and
 * whatever is added next by somebody who has never read this file.
 *
 * Repeating *timers* cannot be found that way, so the two that exist ask for
 * themselves: `repeatWhileAwake` is what `kinds/play.ts` and `celebration.ts`
 * use instead of `setInterval`.
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

// --- repeating timers ------------------------------------------------------

/**
 * A repeating timer that only ticks while the game is awake.
 *
 * Both of the game's repeats are belt-and-braces refills - the bubbles and a
 * celebration's arrivals - so a tick missed while the screen was frozen is a
 * tick nobody wanted: there was nothing to top up, because nothing had popped.
 * They therefore stop dead and start again on waking rather than catching up.
 *
 * The returned function cancels it, exactly as `clearInterval` did.
 */
export function repeatWhileAwake(ms: number, run: () => void): () => void {
  const repeat: Repeat = { ms, run, timer: null };
  if (!resting) start(repeat);
  repeats.add(repeat);
  return () => {
    halt(repeat);
    repeats.delete(repeat);
  };
}

interface Repeat {
  readonly ms: number;
  readonly run: () => void;
  timer: number | null;
}

const repeats = new Set<Repeat>();
let resting = false;

// Bare rather than `window.`-qualified, so the registry can be played out in
// Vitest, which runs these tests without a DOM.
function start(repeat: Repeat): void {
  repeat.timer ??= setInterval(repeat.run, repeat.ms);
}

function halt(repeat: Repeat): void {
  if (repeat.timer !== null) clearInterval(repeat.timer);
  repeat.timer = null;
}

/** Freeze or unfreeze every registered repeat. Exported for the page wiring. */
export function restRepeats(asleep: boolean): void {
  resting = asleep;
  for (const repeat of repeats) {
    if (asleep) halt(repeat);
    else start(repeat);
  }
}

// --- the page ---------------------------------------------------------------

/**
 * Everything the freeze does to the document, and the events that undo it.
 *
 * The wake listeners are in the **capture** phase, so the touch that wakes the
 * game still reaches the game: a finger landing on a bubble wakes the page and
 * then pops the bubble, in that order, and a child never has to tap twice. They
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
      restRepeats(true);
      restAudio();
    },
    wake() {
      delete root.dataset["asleep"];
      for (const animation of paused) animation.play();
      paused = [];
      restRepeats(false);
      stirAudio();
    },
  });

  let lastStir = 0;
  const listen = (type: string, run: (event: Event) => void): void => {
    window.addEventListener(type, run, { capture: true, passive: true });
  };

  for (const type of ["pointerdown", "pointerup", "keydown", "wheel"]) {
    listen(type, () => rest.stir());
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
  // screenful of bubbles hanging still is a poor thing to come back to, and the
  // saving that matters - a tablet face up on the sofa - is untouched by this.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") rest.restNow();
    else rest.stir();
  });

  // Turning a sleeping tablet is the one thing that can start an animation with
  // no finger on the screen: `game.ts` rebuilds the board for the new
  // orientation, and a board rebuilt while the page is asleep arrives with the
  // bubbles drifting and the finish button breathing again, at nobody. So the
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
