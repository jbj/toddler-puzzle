/**
 * The idle hint: after a stretch with nothing happening, a gentle glow where
 * the piece the child last touched wants to go.
 *
 * It is the anti-frustration valve at the young end of the ramp, and it is also
 * what makes the later levels safe to be harder: a child who is stuck gets led
 * rather than left. Everything about it is deliberately quiet. It is **silent**
 * - no sound is played when one appears - it never says "try again", it costs
 * nothing, and it does not go away by itself. Touch anything and it goes; touch
 * nothing and it waits with you.
 *
 * **The glow is drawn from the piece's own outline.** `PieceShape.outline` is
 * the one path both the piece and its hole are already drawn from, so a mark
 * made from it lands exactly on the hole, for every kind of puzzle, with no
 * per-kind knowledge in here at all: an animal's hole, the whole animal a slice
 * belongs to, the shadow a polygon piece is aimed at *now*, a jigsaw piece's
 * place in the picture. The same path drawn at the piece's tray position is the
 * other end of the hint. See the invariant in `product.instructions.md`.
 *
 * **Two ends, because one end is ambiguous.** A glow across the board says
 * something goes here; it does not say what. A pair says "this one, there", and
 * the child this exists for may not yet have worked out that pieces move at
 * all. See
 * [decision 20260730T213000](../docs/decisions/20260730T213000-a-hint-points-at-both-ends.md).
 *
 * **No fill, ever.** A filled target in this game is an opaque animal sitting
 * in its hole, and an empty one is a thin white rim. A warm double stroke round
 * an empty hole is neither, which is what keeps a hint from reading as a place
 * that is already done.
 *
 * The rule half of this file - when a hint is due - is a state machine with its
 * timers passed in, in the spirit of `createHoldGate` in `grownups.ts`, so the
 * races that only a slow machine finds can be played out in Vitest in a
 * millisecond.
 */
import type { Point } from "./geometry";
import { prefersReducedMotion } from "./motion";
import type { PieceId, PieceShape } from "./piece";
import type { HintTiming } from "./progress";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * How long a board sits untouched before the hint appears.
 *
 * A patient child should be left to work it out and an impatient one helped
 * quickly, and only a parent can tell which they have, so the choice is theirs
 * (`grownups.ts`). Five seconds is about as long as a one-year-old who has run
 * out of ideas will keep looking; fourteen is long enough that a two-year-old
 * who is thinking is never interrupted. `off` is a number of milliseconds
 * nobody waits.
 */
export const HINT_DELAY_MS: Record<HintTiming, number | null> = {
  off: null,
  sooner: 5000,
  later: 14000,
};

/**
 * The timing in force, and everything a hint that is already on a board needs
 * in order to answer a change to it.
 *
 * A grown-up who moves this switch is nearly always watching the child be stuck
 * *right now*, so the answer has to be on the board in front of them rather
 * than at the next level. Live hints register themselves, exactly one at a time
 * in practice, and a change stirs them: "off" takes a showing hint down at
 * once, and "sooner" restarts the wait on the shorter clock.
 */
let timing: HintTiming = "later";
const live = new Set<IdleHint>();

/** Called from `applySettings`, which is the one place a setting reaches the game. */
export function setHintTiming(next: HintTiming): void {
  timing = next;
  for (const hint of [...live]) hint.stir();
}

/** How long the wait is now, or null when hints are switched off. */
export const hintDelay = (): number | null => HINT_DELAY_MS[timing];

/**
 * The wait, as three verbs. `stop` latches, and that latch is the whole of the
 * race guard: a board is replaced by a new level, a re-deal or a turned tablet,
 * and a callback already scheduled against the old one must draw nothing into
 * it, as must a stray pointer event arriving after the teardown.
 */
export interface IdleHint {
  /** Something happened. Take any hint down and start the wait again. */
  stir(): void;
  /** A finger is down. Take it down, and do not start the wait again. */
  pause(): void;
  /** This board is finished with. Never show again; safe to call twice. */
  stop(): void;
}

export interface IdleHintOptions {
  /** Put the hint on the board. Asked when the wait runs out, never before. */
  readonly show: () => void;
  /** Take it off again. Called only when a hint is actually on the board. */
  readonly hide: () => void;
  /** Injectable so the wait can be played out without waiting. */
  readonly setTimer?: (run: () => void, ms: number) => number;
  readonly clearTimer?: (id: number) => void;
}

/**
 * Start watching a board. The wait begins immediately: a level that is dealt
 * and then ignored is exactly the case the hint is for.
 */
export function createIdleHint(options: IdleHintOptions): IdleHint {
  const setTimer = options.setTimer ?? ((run, ms) => window.setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));

  let timer: number | null = null;
  let showing = false;
  let stopped = false;

  const disarm = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const takeDown = (): void => {
    disarm();
    if (!showing) return;
    showing = false;
    options.hide();
  };

  const hint: IdleHint = {
    stir() {
      if (stopped) return;
      takeDown();
      const delay = hintDelay();
      if (delay === null) return;
      timer = setTimer(() => {
        timer = null;
        // The board this was armed against may have been torn down between the
        // scheduling and the firing, on a machine slow enough to get between
        // them. A stopped hint draws nothing.
        if (stopped) return;
        showing = true;
        options.show();
      }, delay);
    },
    pause() {
      if (stopped) return;
      takeDown();
    },
    stop() {
      stopped = true;
      takeDown();
      live.delete(hint);
    },
  };

  live.add(hint);
  hint.stir();
  return hint;
}

/**
 * Which piece the hint is about.
 *
 * The issue asks for "whichever piece the child last touched", and twice over
 * that is not defined: at the start of a level nobody has touched anything, and
 * after a successful placement the piece they last touched is home. Both fall
 * through to the same answer - some piece that still needs moving - because the
 * child who has not yet worked out that pieces move is precisely the child this
 * exists for, and "nobody has touched anything" must not mean "no help". The
 * product's tie-breaker settles it: choose whatever is more forgiving.
 *
 * A `lastTouched` from an earlier board is ignored rather than trusted, since
 * it is not among these pieces.
 */
export function hintPiece(
  pieces: readonly PieceShape[],
  placed: ReadonlySet<PieceId>,
  lastTouched: PieceId | null,
): PieceShape | null {
  const waiting = pieces.filter((shape) => !placed.has(shape.id));
  const touched = waiting.find((shape) => shape.id === lastTouched);
  return touched ?? waiting[0] ?? null;
}

/** Where one end of the hint is drawn, and how loudly. */
export interface HintMark {
  /** Top-left of the piece's box, in logical units. */
  readonly at: Point;
  /** Authored units -> logical units, this piece's own. */
  readonly scale: number;
  /**
   * The bright end sits on the target, which is the thing the child cannot
   * work out. The quiet end sits under the waiting piece, which they can
   * already see, and only says which one is meant.
   */
  readonly quiet: boolean;
}

/**
 * The glow: the piece's own outline, twice - a wide soft pass with a narrower
 * bright one over it, which is as close to a halo as a stroke gets without a
 * filter. Never filled.
 *
 * The pulse is what makes it read as an invitation rather than as a state, and
 * `prefers-reduced-motion` gets the invitation without the movement: the glow
 * appears and holds. Dropping it there would take the help away from a child
 * who still needs it, which is not what honouring the request means.
 */
export function hintMark(shape: PieceShape, mark: HintMark): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", `hint-mark${mark.quiet ? " is-quiet" : ""}`);
  group.setAttribute("transform", `translate(${mark.at.x} ${mark.at.y}) scale(${mark.scale})`);
  group.style.pointerEvents = "none";
  // Strokes are in authored units inside the scale, so a small piece gets a
  // proportionally small glow rather than a rim thicker than the piece.
  group.innerHTML = `
    <path d="${shape.outline}" fill="none" stroke="#ffd23f" stroke-opacity="0.5"
      stroke-width="22" stroke-linejoin="round" />
    <path d="${shape.outline}" fill="none" stroke="#fff4c2" stroke-opacity="0.95"
      stroke-width="8" stroke-linejoin="round" />
  `;
  return group;
}

/**
 * Draw the whole hint into its layer: a bright mark on every place the piece
 * would be taken, and a quiet one under the piece still waiting in the tray.
 * The layer is cleared first, so showing a hint twice cannot stack two of them.
 *
 * `targets` is a list rather than a point because some kinds have a *choice* of
 * place, and pointing at one of several equally right ones would teach a rule
 * the game does not have. See `PuzzleKind.openTargets`.
 */
export function drawHint(
  layer: SVGGElement,
  shape: PieceShape,
  options: { readonly scale: number; readonly targets: readonly Point[]; readonly waiting: Point },
): void {
  clearHint(layer);
  const { scale, targets, waiting } = options;
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "hint");
  group.dataset["piece"] = shape.id;
  group.style.pointerEvents = "none";
  if (prefersReducedMotion()) group.classList.add("is-still");
  group.append(hintMark(shape, { at: waiting, scale, quiet: true }));
  for (const at of targets) group.append(hintMark(shape, { at, scale, quiet: false }));
  layer.append(group);
}

export function clearHint(layer: SVGGElement): void {
  layer.replaceChildren();
}
