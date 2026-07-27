/**
 * Reward feedback: sparkles when a piece lands, and a finish celebration with a
 * big button in the now-empty tray that leads on to the next puzzle.
 */
import type { Point } from "./geometry";
import type { Layout } from "./layout";

const SVG_NS = "http://www.w3.org/2000/svg";
const SPARKLE_COLOURS = ["#ffd23f", "#ff8fa3", "#8ce0ff", "#c9a7f5", "#ffffff"];

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function sparkle(
  center: Point,
  colour: string,
  distance: number,
  angle: number,
  delay: number,
): SVGGElement {
  const anchor = document.createElementNS(SVG_NS, "g");
  anchor.setAttribute("transform", `translate(${center.x} ${center.y})`);
  anchor.style.pointerEvents = "none";

  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("r", "9");
  dot.setAttribute("fill", colour);
  // Without this, an SVG element scales about the centre of the whole viewBox.
  dot.style.transformOrigin = "0 0";
  anchor.append(dot);

  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const animation = dot.animate(
    [
      { transform: "translate(0px, 0px) scale(0.3)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.1)`, opacity: 0 },
    ],
    {
      duration: prefersReducedMotion() ? 1 : 700,
      delay,
      easing: "cubic-bezier(0.2, 0.7, 0.3, 1)",
      fill: "forwards",
    },
  );
  animation.addEventListener("finish", () => anchor.remove());
  return anchor;
}

/** Small burst around a piece that has just snapped into place. */
export function sparkleBurst(fxLayer: SVGGElement, center: Point): void {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const colour = SPARKLE_COLOURS[i % SPARKLE_COLOURS.length] as string;
    fxLayer.append(sparkle(center, colour, 70 + Math.random() * 40, angle, 0));
  }
}

/** Bigger, scattered burst across the whole landscape when the puzzle is done. */
export function celebrationBurst(fxLayer: SVGGElement, layout: Layout): void {
  for (let i = 0; i < 28; i++) {
    const center = {
      x: Math.random() * layout.canvas.width,
      y: Math.random() * layout.trayTop,
    };
    const colour = SPARKLE_COLOURS[i % SPARKLE_COLOURS.length] as string;
    fxLayer.append(
      sparkle(center, colour, 60 + Math.random() * 80, Math.random() * Math.PI * 2, i * 25),
    );
  }
}

/**
 * Large, unmissable button shown when a puzzle is finished: an arrow onwards to
 * the next stage, or a replay arrow after the last one. It lives in the tray,
 * which is empty by the time the puzzle is complete, and is far bigger than any
 * adult UI control because it is meant to be hit by a toddler.
 */
export type FinishButton = "next" | "again";

const BUTTON_ICON: Record<FinishButton, string> = {
  next: `
    <path d="M-40 0 H10" fill="none" stroke="#7a5200" stroke-width="15" stroke-linecap="round" />
    <path d="M2 -32 L44 0 L2 32 Z" fill="#7a5200" />
  `,
  again: `
    <path d="M-34 8 A34 34 0 1 1 0 42" fill="none" stroke="#7a5200" stroke-width="15" stroke-linecap="round" />
    <path d="M-34 -14 L-34 12 L-11 12 Z" fill="#7a5200" />
  `,
};

export function showFinishButton(
  fxLayer: SVGGElement,
  layout: Layout,
  kind: FinishButton,
  onPress: () => void,
): void {
  const anchor = document.createElementNS(SVG_NS, "g");
  const centerY = (layout.trayTop + layout.canvas.height) / 2;
  anchor.setAttribute("transform", `translate(${layout.canvas.width / 2} ${centerY})`);

  // The pulse animates CSS `transform`, which would clobber a `transform`
  // attribute on the same element - so the translate lives on a parent.
  const button = document.createElementNS(SVG_NS, "g");
  button.setAttribute("class", "reset-button");
  button.setAttribute("role", "button");
  button.setAttribute("aria-label", kind === "next" ? "Next puzzle" : "Play again");
  button.style.transformOrigin = "0 0";
  button.innerHTML = `
    <circle r="82" fill="#ffd23f" stroke="#e0a615" stroke-width="7" />
    ${BUTTON_ICON[kind]}
  `;

  if (!prefersReducedMotion()) {
    button.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }],
      { duration: 1400, iterations: Infinity },
    );
  }

  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    onPress();
  });

  anchor.append(button);
  fxLayer.append(anchor);
}
