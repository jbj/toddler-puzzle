/**
 * Before changing this file, read docs/puzzle-kinds.md.
 * Before changing this file, read docs/feel.md.
 *
 * The pop engine: a big soft thing that floats, and bursts the instant it is
 * touched.
 *
 * It is one module rather than part of the bubbles because two parts of the game
 * want the same mechanic. The bubbles of the first chapter
 * (`kinds/play.ts`) are the first, and the balloons and petals of a chapter
 * celebration (`celebration.ts`) are the second; either can reach this without
 * knowing about the other. Anything specific to what is floating - how many
 * there are, where they come from, when the level is over - belongs to the
 * caller. What lives here is the *feel*:
 *
 *  - **the burst is immediate.** `pointerdown`, not click, and the thing is off
 *    the screen in the same tick it was touched. Latency is the whole point of a
 *    cause-and-effect level, so nothing here waits for an animation before
 *    answering.
 *  - **the whole thing is the target.** A transparent disc fills the radius
 *    behind the paint, so a bubble is caught anywhere inside its outline rather
 *    than only on the highlight.
 *  - **less motion means still, not gone.** Under `prefers-reduced-motion` a
 *    floater does not drift at all - it simply stays where it was put and waits
 *    to be touched. Collapsing the drift to a millisecond would carry it off
 *    the top of the screen at once and leave nothing to touch, which is a
 *    setting turning a level into an empty sky. See
 *    docs/decisions/Under reduced motion, a floater holds still.md.
 */
import type { Point } from "./geometry";
import { prefersReducedMotion } from "./motion";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Strong, friendly colours; nothing muddy, nothing that reads as a warning. */
export const POP_COLOURS: readonly string[] = [
  "#8ce0ff",
  "#ff8fa3",
  "#ffd23f",
  "#c9a7f5",
  "#9ce8b6",
  "#ffb27a",
];

/**
 * What a floater is drawn as. A bubble for a cause-and-effect level; a balloon
 * or a petal for a chapter celebration (`celebration.ts`). They differ only in
 * paint - the drift, the hit target and the burst are the same for all three,
 * which is the whole reason they live together.
 */
export type PopShape = "bubble" | "balloon" | "petal";

/** How each is painted, in units of the floater's own radius. */
const PAINT: Record<PopShape, (radius: number, colour: string) => string> = {
  bubble: (r, colour) => `
    <circle r="${r}" fill="${colour}" fill-opacity="0.34" />
    <circle r="${r}" fill="none" stroke="${colour}" stroke-width="${(r * 0.13).toFixed(1)}" />
    <circle cx="${(-r * 0.34).toFixed(1)}" cy="${(-r * 0.36).toFixed(1)}"
            r="${(r * 0.22).toFixed(1)}" fill="#ffffff" fill-opacity="0.85" />
  `,
  balloon: (r, colour) => `
    <path d="M0 ${(r * 1.05).toFixed(1)} q${(r * 0.3).toFixed(1)} ${(r * 0.5).toFixed(1)} 0 ${(r * 1.1).toFixed(1)}"
          fill="none" stroke="#7a5200" stroke-width="${Math.max(2, r * 0.06).toFixed(1)}" />
    <ellipse rx="${(r * 0.88).toFixed(1)}" ry="${r}" fill="${colour}" />
    <path d="M${(-r * 0.16).toFixed(1)} ${(r * 0.98).toFixed(1)} h${(r * 0.32).toFixed(1)} l${(-r * 0.16).toFixed(1)} ${(r * 0.22).toFixed(1)} Z"
          fill="${colour}" />
    <ellipse cx="${(-r * 0.3).toFixed(1)}" cy="${(-r * 0.36).toFixed(1)}"
             rx="${(r * 0.18).toFixed(1)}" ry="${(r * 0.26).toFixed(1)}"
             fill="#ffffff" fill-opacity="0.55" transform="rotate(-18)" />
  `,
  petal: (r, colour) => {
    const lobes = Array.from({ length: 5 }, (_, i) => {
      const turn = i * 72;
      return `<ellipse cx="0" cy="${(-r * 0.5).toFixed(1)}"
                 rx="${(r * 0.34).toFixed(1)}" ry="${(r * 0.5).toFixed(1)}"
                 fill="${colour}" transform="rotate(${turn})" />`;
    }).join("");
    return `
    ${lobes}
    <circle r="${(r * 0.24).toFixed(1)}" fill="#fff3b0" />
    <circle cx="${(-r * 0.07).toFixed(1)}" cy="${(-r * 0.07).toFixed(1)}"
            r="${(r * 0.1).toFixed(1)}" fill="#ffffff" fill-opacity="0.8" />
  `;
  },
};

/** Where a floater goes if nobody touches it, and how long it takes. */
export interface Drift {
  readonly to: Point;
  readonly ms: number;
  /** How far it sways from side to side on the way, in logical units. */
  readonly sway?: number;
}

export interface PopOptions {
  readonly at: Point;
  readonly radius: number;
  readonly colour: string;
  readonly shape?: PopShape;
  /**
   * Left out, the floater stays where it was put. Under
   * `prefers-reduced-motion` this is what every floater does.
   */
  readonly drift?: Drift;
  /** What a name on the element says this is, for the tests to find. */
  readonly touch?: string;
  /** Touched. Given where the burst happened, in logical units. */
  readonly onPop?: (at: Point) => void;
  /** Drifted the whole way without being touched. Never a failure. */
  readonly onEscape?: () => void;
}

export interface Poppable {
  readonly element: SVGGElement;
  /** Burst it now, as a touch would. */
  pop(): void;
  /** Take it away without bursting it: the board is being rebuilt. */
  remove(): void;
}

/**
 * Put one floater on the layer. It bursts on touch, or drifts away and is
 * replaced; either way it looks after taking itself off the layer.
 */
export function releasePoppable(layer: SVGGElement, options: PopOptions): Poppable {
  const { at, radius, colour, shape = "bubble", drift, touch = shape } = options;
  const still = prefersReducedMotion() || !drift;

  const anchor = document.createElementNS(SVG_NS, "g");
  anchor.setAttribute("class", "poppable");
  anchor.dataset["touch"] = touch;
  anchor.setAttribute("transform", `translate(${at.x} ${at.y})`);

  // The moving part is a child, because the drift animates a CSS transform and
  // that would clobber a `transform` attribute on the same element.
  const floater = document.createElementNS(SVG_NS, "g");
  floater.style.transformOrigin = "0 0";
  // A transparent disc, first so it sits behind the paint: the whole circle is
  // the target, not only the parts a colour happens to land on.
  floater.innerHTML = `<circle r="${radius}" fill="transparent" />${PAINT[shape](radius, colour)}`;
  anchor.append(floater);

  let gone = false;
  let animation: Animation | null = null;

  /**
   * Where it is now, in logical units - the burst has to happen where the thing
   * was, not where it started. The drift is three linear keyframes, so this
   * walks the same two segments they do rather than lerping end to end, which
   * would put the burst as much as the whole sway away from the finger.
   */
  function position(): Point {
    if (still || !drift || !animation) return at;
    const elapsed = Number(animation.currentTime ?? 0);
    const t = Math.max(0, Math.min(1, elapsed / drift.ms));
    const dx = drift.to.x - at.x;
    const dy = drift.to.y - at.y;
    const midX = dx * 0.5 + (drift.sway ?? 0);
    const midY = dy * 0.5;
    const u = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    return t <= 0.5
      ? { x: at.x + midX * u, y: at.y + midY * u }
      : { x: at.x + midX + (dx - midX) * u, y: at.y + midY + (dy - midY) * u };
  }

  function take(): Point {
    const where = position();
    gone = true;
    animation?.cancel();
    anchor.remove();
    return where;
  }

  const poppable: Poppable = {
    element: anchor,
    pop() {
      if (gone) return;
      const where = take();
      popBurst(layer, where, radius, colour);
      options.onPop?.(where);
    },
    remove() {
      if (!gone) take();
    },
  };

  anchor.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    event.preventDefault();
    poppable.pop();
  });

  layer.append(anchor);

  if (!still && drift) {
    const dx = drift.to.x - at.x;
    const dy = drift.to.y - at.y;
    const sway = drift.sway ?? 0;
    animation = floater.animate(
      [
        { transform: "translate(0px, 0px)" },
        { transform: `translate(${(dx * 0.5 + sway).toFixed(1)}px, ${(dy * 0.5).toFixed(1)}px)` },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` },
      ],
      { duration: drift.ms, easing: "linear", fill: "forwards" },
    );
    animation.addEventListener("finish", () => {
      if (gone) return;
      take();
      options.onEscape?.();
    });
  }

  return poppable;
}

/**
 * The burst on its own: a ring that opens outwards and a scatter of drops. Also
 * usable without a floater, for anything that should look as though it popped.
 */
export function popBurst(layer: SVGGElement, at: Point, radius: number, colour: string): void {
  const duration = prefersReducedMotion() ? 1 : 420;
  const burst = document.createElementNS(SVG_NS, "g");
  burst.setAttribute("transform", `translate(${at.x} ${at.y})`);
  burst.style.pointerEvents = "none";
  layer.append(burst);

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("r", String(radius));
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", colour);
  ring.setAttribute("stroke-width", String(Math.max(3, radius * 0.12)));
  ring.style.transformOrigin = "0 0";
  burst.append(ring);

  const finished = ring.animate(
    [
      { transform: "scale(0.85)", opacity: 0.95 },
      { transform: "scale(1.5)", opacity: 0 },
    ],
    { duration, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "forwards" },
  );

  const drops = 7;
  for (let i = 0; i < drops; i++) {
    const angle = (i / drops) * Math.PI * 2;
    const drop = document.createElementNS(SVG_NS, "circle");
    drop.setAttribute("r", String(Math.max(3, radius * 0.13)));
    drop.setAttribute("fill", colour);
    drop.style.transformOrigin = "0 0";
    burst.append(drop);
    drop.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 0.95 },
        {
          transform: `translate(${(Math.cos(angle) * radius * 1.35).toFixed(1)}px, ${(
            Math.sin(angle) *
            radius *
            1.35
          ).toFixed(1)}px) scale(0.3)`,
          opacity: 0,
        },
      ],
      { duration, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "forwards" },
    );
  }

  finished.addEventListener("finish", () => burst.remove());
}
