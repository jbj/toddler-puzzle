/**
 * Builds the SVG scene graph: the backdrop the kind draws, the draggable
 * pieces, and the chrome around them. Rendering only - all decisions live in
 * game.ts and in the puzzle kind. Only the current stage's pieces are built.
 */
import type { Point } from "./geometry";
import { replayArrow } from "./icons";
import { STAGE_COUNT, type Layout } from "./layout";
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

  const scaled = group();
  scaled.setAttribute("transform", `scale(${scale})`);
  scaled.innerHTML = shape.artwork;
  piece.append(scaled);
  return piece;
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
    // Authored units -> logical units, at this stage's piece size.
    const piece = buildPiece(shape, layout.pieceSize / shape.box.width);
    pieces.set(shape.id, piece);
    piecesLayer.append(piece);
  }

  const resetButton = buildResetButton();
  stage.append(backdropLayer, piecesLayer, fxLayer, resetButton, buildStageDots(layout));

  root.replaceChildren(stage);
  return { stage, backdropLayer, piecesLayer, fxLayer, pieces, resetButton };
}
