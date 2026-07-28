/**
 * Builds the SVG scene graph: the backdrop the kind draws, the draggable
 * pieces, and the chrome around them. Rendering only - all decisions live in
 * game.ts and in the puzzle kind. Only the current stage's pieces are built.
 *
 * A piece is more than its drawing, though: each one carries an invisible
 * rectangle over its artwork so it can be picked up anywhere inside that box.
 * See `fitGrabBox`.
 */
import { padWithin, type Point } from "./geometry";
import { replayArrow } from "./icons";
import { GRAB_PADDING, STAGE_COUNT, boxOf, type Layout } from "./layout";
import type { PieceId, PieceShape } from "./piece";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface Board {
  readonly stage: SVGSVGElement;
  /** Everything behind the pieces; the kind decides what goes in it. */
  readonly backdropLayer: SVGGElement;
  readonly piecesLayer: SVGGElement;
  readonly fxLayer: SVGGElement;
  readonly pieces: ReadonlyMap<PieceId, SVGGElement>;
  readonly resetButton: SVGGElement;
}

/** An element built for the current stage. Throws if the piece isn't in play. */
export function elementFor(
  elements: ReadonlyMap<PieceId, SVGGElement>,
  piece: PieceId,
): SVGGElement {
  const element = elements.get(piece);
  if (!element) throw new Error(`Piece "${piece}" is not on the board.`);
  return element;
}

function group(className?: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  if (className) g.setAttribute("class", className);
  return g;
}

export function setPiecePosition(piece: SVGGElement, position: Point): void {
  // Set via CSS rather than the `transform` attribute so the settle animation
  // in style.css can transition it.
  piece.style.transform = `translate(${position.x}px, ${position.y}px)`;
}

function buildPiece(shape: PieceShape, scale: number): SVGGElement {
  const piece = group("piece");
  piece.dataset["piece"] = shape.id;
  piece.setAttribute("role", "img");
  piece.setAttribute("aria-label", shape.label);

  const art = group("art");
  art.setAttribute("transform", `scale(${scale})`);
  art.innerHTML = shape.artwork;
  piece.append(art);
  return piece;
}

/**
 * Give a piece an invisible rectangle covering its artwork, so it can be picked
 * up anywhere inside that box instead of only where a finger happens to land on
 * paint. The gap between a giraffe's legs and the notch under a duck's tail are
 * inside the animal as far as a two-year-old is concerned; without this they
 * are dead space that swallows the press and moves nothing.
 *
 * Do not delete this as unused markup - nothing else makes those places
 * grabbable. The reasoning is decision 0008.
 *
 * Three details are load-bearing:
 *
 *  - it goes *inside* the artwork group, so it is in authored units and moves
 *    and scales with the piece;
 *  - it goes *first*, so it sits behind the artwork rather than over it;
 *  - `fill="transparent"` is a paint and so is hit-testable, where
 *    `fill="none"` would not be, and leaving `pointer-events` alone lets
 *    `.piece.is-placed` in style.css go on switching the whole piece off.
 */
function fitGrabBox(piece: SVGGElement, shape: PieceShape): void {
  const art = piece.firstElementChild;
  if (!(art instanceof SVGGElement)) return;

  // In the element's own units, i.e. before its `scale()`. Measured rather than
  // declared per animal, so redrawing one moves its grab box with it.
  const drawn = art.getBBox();
  // An unmeasurable piece keeps the artwork it already had to be grabbed by,
  // which is no worse than having no grab box at all.
  if (drawn.width <= 0 || drawn.height <= 0) return;

  const padding = GRAB_PADDING * Math.min(shape.box.width, shape.box.height);
  const box = padWithin(drawn, padding, shape.box);

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("class", "grab-box");
  rect.setAttribute("x", String(box.x));
  rect.setAttribute("y", String(box.y));
  rect.setAttribute("width", String(box.width));
  rect.setAttribute("height", String(box.height));
  rect.setAttribute("fill", "transparent");
  art.prepend(rect);
}

function buildResetButton(): SVGGElement {
  const button = group("reset-button");
  button.setAttribute("transform", "translate(58 58)");
  button.setAttribute("role", "button");
  button.setAttribute("aria-label", "Start a fresh puzzle");
  button.innerHTML = `
    <circle r="32" fill="#ffffff" fill-opacity="0.82" stroke="#4f7d8c" stroke-width="4" />
    ${replayArrow(13, 6, "#4f7d8c")}
  `;
  return button;
}

/**
 * One dot per stage, filled up to the current one, so a grown-up can see how
 * far along the three puzzles are. Deliberately not interactive: every target a
 * toddler can hit should do something they meant to do.
 */
function buildStageDots(layout: Layout): SVGGElement {
  const dots = group("stage-dots");
  dots.setAttribute("transform", "translate(122 58)");
  dots.setAttribute("aria-label", `Puzzle ${layout.stage} of ${STAGE_COUNT}`);
  dots.style.pointerEvents = "none";
  dots.innerHTML = Array.from({ length: STAGE_COUNT }, (_, index) => {
    const reached = index < layout.stage;
    return `<circle cx="${index * 32}" cy="0" r="11"
      fill="${reached ? "#ffd23f" : "#ffffff"}" fill-opacity="${reached ? 1 : 0.35}"
      stroke="#4f7d8c" stroke-width="3" stroke-opacity="0.75" />`;
  }).join("");
  return dots;
}

export function buildBoard(root: HTMLElement, layout: Layout): Board {
  const stage = document.createElementNS(SVG_NS, "svg");
  stage.setAttribute("id", "stage");
  stage.setAttribute("viewBox", `0 0 ${layout.canvas.width} ${layout.canvas.height}`);
  stage.setAttribute("preserveAspectRatio", "xMidYMid meet");
  stage.dataset["layout"] = layout.id;
  stage.dataset["stage"] = String(layout.stage);

  const backdropLayer = group("backdrop");
  const piecesLayer = group("pieces");
  const fxLayer = group("fx");

  const pieces = new Map<PieceId, SVGGElement>();
  for (const shape of layout.pieces) {
    // Authored units -> logical units, at this piece's own scale.
    const piece = buildPiece(shape, boxOf(layout, shape.id).scale);
    pieces.set(shape.id, piece);
    piecesLayer.append(piece);
  }

  const resetButton = buildResetButton();
  stage.append(backdropLayer, piecesLayer, fxLayer, resetButton, buildStageDots(layout));

  root.replaceChildren(stage);

  // Measuring artwork needs it in the document, so the grab boxes are fitted
  // once the board is mounted rather than while it is being built.
  for (const shape of layout.pieces) fitGrabBox(elementFor(pieces, shape.id), shape);

  return { stage, backdropLayer, piecesLayer, fxLayer, pieces, resetButton };
}
