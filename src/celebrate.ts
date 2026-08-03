/**
 * Reward feedback: sparkles when a level is finished, and the big button in the
 * now-empty tray that leads on to the next puzzle - which arrives `WAY_OUT_MS`
 * after the level ends rather than at once, so there is a moment between one
 * puzzle and the next.
 *
 * The sparkles are the only thing here. What comes down over the board behind
 * them - balloons, beach balls, paper, ribbon - is a celebration, and lives in
 * `celebration.ts`.
 */
import type { Point } from "./geometry";
import { replayArrow } from "./icons";
import type { Layout } from "./layout";
import { prefersReducedMotion } from "./motion";
import { afterWhileAwake } from "./rest";

const SVG_NS = "http://www.w3.org/2000/svg";
const SPARKLE_COLOURS = ["#ffd23f", "#ff8fa3", "#8ce0ff", "#c9a7f5", "#ffffff"];

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
      y: layout.sceneTop + Math.random() * (layout.canvas.height - layout.sceneTop),
    };
    const colour = SPARKLE_COLOURS[i % SPARKLE_COLOURS.length] as string;
    fxLayer.append(
      sparkle(center, colour, 60 + Math.random() * 80, Math.random() * Math.PI * 2, i * 25),
    );
  }
}

/**
 * Large, unmissable button shown when a puzzle is finished: an arrow onwards to
 * the next level, or a replay arrow after the last one. It lives in the tray,
 * which is empty by the time the puzzle is complete, and is far bigger than any
 * adult UI control because it is meant to be hit by a toddler.
 */
export type FinishButton = "next" | "again";

const BUTTON_ICON: Record<FinishButton, string> = {
  next: `
    <path d="M-40 0 H10" fill="none" stroke="#7a5200" stroke-width="15" stroke-linecap="round" />
    <path d="M2 -32 L44 0 L2 32 Z" fill="#7a5200" />
  `,
  again: replayArrow(34, 15, "#7a5200"),
};

/**
 * How long the way onwards holds back while a celebration goes up.
 *
 * This is the mandatory pause between one level and the next, and it is the
 * whole of what a celebration between levels is *for*. A finished board leading
 * straight into a fresh one asks a one-year-old to start again with nothing in
 * between, and in playtesting that is where they stopped rather than where they
 * were stretched. So the level ends, something to look at arrives, and the way
 * onwards is not there yet.
 *
 * There is a second reason, which is why it applied to a chapter end before it
 * applied to anything: by level 25 the child has pressed this button
 * twenty-five times. It is the most conditioned action in the game and a huge
 * saturated yellow disc in the middle of the screen. Put it up in the same tick
 * as the celebration and a good number of children press it before they notice
 * there was anything else.
 *
 * Four and a half seconds is one balloon's climb of a landscape board - the
 * time the first thing released has to cross the sky - and it is the same
 * number in both orientations, because a child who turns the tablet has not
 * asked for a longer wait. It is deliberately a *number* rather than a
 * particular balloon: the pause has to be the same whether the celebration is
 * balloons, beach balls, paper or ribbon, and it has to hold even when the
 * celebration chunk never arrived.
 *
 * Nothing else is withheld. The celebration answers a finger from its first
 * frame, so this is never a wait for permission to play - only for permission
 * to leave. See
 * `docs/decisions/20260803T133000-a-celebration-between-every-level.md`.
 */
export const WAY_OUT_MS = 4500;

export function showFinishButton(
  fxLayer: SVGGElement,
  layout: Layout,
  kind: FinishButton,
  onPress: () => void,
  /**
   * Hold the button back for this long, then fade it up. Zero - every ordinary
   * level - puts it there at once, exactly as before.
   */
  arriveAfterMs = 0,
): () => void {
  if (arriveAfterMs > 0) {
    // Through `rest.ts` rather than `setTimeout`, so the wait is measured in
    // time somebody was there for. A tablet put down during the pause would
    // otherwise have the button appear behind the freeze - fading up and
    // pulsing on a page that is meant to be standing still, and, worse, waiting
    // there having been missed. The child comes back to the celebration they
    // left, and the way onwards arrives a moment later, in front of them.
    return afterWhileAwake(arriveAfterMs, () => {
      const anchor = finishButton(layout, kind, onPress);
      // Never an invisible hit target: it is in the document only once it has
      // started to show, and it answers a finger from that first frame.
      if (!prefersReducedMotion()) {
        anchor.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 620, easing: "ease-out" });
      }
      fxLayer.append(anchor);
    });
  }

  fxLayer.append(finishButton(layout, kind, onPress));
  return () => {};
}

function finishButton(layout: Layout, kind: FinishButton, onPress: () => void): SVGGElement {
  const anchor = document.createElementNS(SVG_NS, "g");
  const { x, y } = layout.finishCenter;
  anchor.setAttribute("transform", `translate(${x} ${y})`);

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
  return anchor;
}
