/**
 * Builds the SVG scene graph: background, holes cut into it, and the draggable
 * pieces. Rendering only - all decisions live in game.ts.
 */
import { ART_BOX, ANIMAL_IDS, type AnimalArt, type AnimalId } from "./assets";
import type { Point } from "./geometry";
import { PIECE_SIZE, type Layout } from "./layout";
import { renderScenery } from "./scenery";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Art units -> logical units. */
export const PIECE_SCALE = PIECE_SIZE / ART_BOX;

export interface Board {
  readonly stage: SVGSVGElement;
  readonly piecesLayer: SVGGElement;
  readonly fxLayer: SVGGElement;
  readonly pieces: Record<AnimalId, SVGGElement>;
  readonly holes: Record<AnimalId, SVGGElement>;
  readonly resetButton: SVGGElement;
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

function buildHole(art: AnimalArt, layout: Layout): SVGGElement {
  const hole = group("hole");
  hole.dataset["animal"] = art.id;
  const origin = layout.holes[art.id];
  hole.setAttribute("transform", `translate(${origin.x} ${origin.y}) scale(${PIECE_SCALE})`);
  // A soft dark fill plus a light rim reads as a recess against both the sky
  // and the grass, so one treatment works everywhere in the scene.
  hole.innerHTML = `
    <path d="${art.silhouettePath}" fill="#1f3b34" opacity="0.24" />
    <path d="${art.silhouettePath}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="5" />
  `;
  return hole;
}

function buildPiece(art: AnimalArt): SVGGElement {
  const piece = group("piece");
  piece.dataset["animal"] = art.id;
  piece.setAttribute("role", "img");
  piece.setAttribute("aria-label", art.name);

  const scaled = group();
  scaled.setAttribute("transform", `scale(${PIECE_SCALE})`);
  scaled.innerHTML = `${art.silhouetteMarkup}<g>${art.detailMarkup}</g>`;
  piece.append(scaled);
  return piece;
}

function buildResetButton(): SVGGElement {
  const button = group("reset-button");
  button.setAttribute("transform", "translate(58 58)");
  button.setAttribute("role", "button");
  button.setAttribute("aria-label", "Start again");
  button.innerHTML = `
    <circle r="32" fill="#ffffff" fill-opacity="0.82" stroke="#4f7d8c" stroke-width="4" />
    <path d="M-13 3 A13 13 0 1 1 0 16" fill="none" stroke="#4f7d8c" stroke-width="6" stroke-linecap="round" />
    <path d="M-13 -6 L-13 4 L-4 4 Z" fill="#4f7d8c" />
  `;
  return button;
}

export function buildBoard(
  root: HTMLElement,
  animals: Record<AnimalId, AnimalArt>,
  layout: Layout,
): Board {
  const stage = document.createElementNS(SVG_NS, "svg");
  stage.setAttribute("id", "stage");
  stage.setAttribute("viewBox", `0 0 ${layout.canvas.width} ${layout.canvas.height}`);
  stage.setAttribute("preserveAspectRatio", "xMidYMid meet");
  stage.dataset["layout"] = layout.id;

  const sceneLayer = group("scene");
  sceneLayer.innerHTML = renderScenery(layout);

  const holesLayer = group("holes");
  const piecesLayer = group("pieces");
  const fxLayer = group("fx");

  const pieces = {} as Record<AnimalId, SVGGElement>;
  const holes = {} as Record<AnimalId, SVGGElement>;
  for (const id of ANIMAL_IDS) {
    const art = animals[id];
    const hole = buildHole(art, layout);
    holes[id] = hole;
    holesLayer.append(hole);
    const piece = buildPiece(art);
    pieces[id] = piece;
    piecesLayer.append(piece);
  }

  const resetButton = buildResetButton();
  stage.append(sceneLayer, holesLayer, piecesLayer, fxLayer, resetButton);

  root.replaceChildren(stage);
  return { stage, piecesLayer, fxLayer, pieces, holes, resetButton };
}
