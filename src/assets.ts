/**
 * Animal shapes: one provider of `PieceShape`s.
 *
 * Each animal is authored as a standalone SVG with a strict structure:
 *
 *   <svg viewBox="0 0 240 240">
 *     <path id="silhouette" d="..."/>   one closed outer outline
 *     <g id="detail"> ... </g>          eyes, ears, spots
 *   </svg>
 *
 * The silhouette's `d` becomes the shape's `outline`, and the artwork is built
 * from that same string, so the piece and the hole it fills are drawn from one
 * path and cannot drift apart. If an asset is malformed we throw immediately at
 * startup rather than silently rendering an unsolvable puzzle.
 *
 * Nothing but this file knows that a piece happens to be an animal.
 */
import type { Point, Size } from "./geometry";
import { pieceId, type PieceShape } from "./piece";

import butterflySvg from "./assets/animals/butterfly.svg?raw";
import duckSvg from "./assets/animals/duck.svg?raw";
import elephantSvg from "./assets/animals/elephant.svg?raw";
import giraffeSvg from "./assets/animals/giraffe.svg?raw";
import rabbitSvg from "./assets/animals/rabbit.svg?raw";
import turtleSvg from "./assets/animals/turtle.svg?raw";

export const ANIMAL_IDS = ["duck", "elephant", "giraffe", "turtle", "rabbit", "butterfly"] as const;
export type AnimalId = (typeof ANIMAL_IDS)[number];

/** Every animal is authored on this square canvas. */
export const ART_BOX = 240;

/** The box every animal is authored in. */
export const ANIMAL_BOX: Size = { width: ART_BOX, height: ART_BOX };

/**
 * Where each animal's feet sit within its 240x240 art box, in art units. This
 * becomes the shape's anchor, which is what stands an animal on the ground line
 * instead of aligning its box. Set these from `npm run art:check`, never by eye.
 */
const FOOT_LEVEL: Record<AnimalId, number> = {
  giraffe: 226,
  elephant: 216,
  duck: 200,
  turtle: 184,
  rabbit: 212,
  butterfly: 204,
};

/** Where an animal stands within its art box: on its feet, centred. */
export const animalAnchor = (id: AnimalId): Point => {
  const y = FOOT_LEVEL[id];
  if (y === undefined) throw new Error(`Animal "${id}" has no FOOT_LEVEL.`);
  return { x: ART_BOX / 2, y };
};

const SOURCES: Record<AnimalId, { name: string; svg: string }> = {
  duck: { name: "Duck", svg: duckSvg },
  elephant: { name: "Elephant", svg: elephantSvg },
  giraffe: { name: "Giraffe", svg: giraffeSvg },
  turtle: { name: "Turtle", svg: turtleSvg },
  rabbit: { name: "Rabbit", svg: rabbitSvg },
  butterfly: { name: "Butterfly", svg: butterflySvg },
};

function parseSvg(source: string, label: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(`Asset "${label}" is not valid SVG.`);
  }
  const root = doc.documentElement;
  if (!(root instanceof SVGSVGElement)) {
    throw new Error(`Asset "${label}" has no root <svg> element.`);
  }
  return root;
}

/** Escaped for use inside a double-quoted attribute in the markup we build. */
const attributeValue = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The silhouette's styling, minus the two attributes the artwork supplies. */
function bodyAttributes(silhouette: SVGPathElement): string {
  return [...silhouette.attributes]
    .filter((attribute) => attribute.name !== "d" && attribute.name !== "id")
    .map((attribute) => `${attribute.name}="${attributeValue(attribute.value)}"`)
    .join(" ");
}

function parseAnimal(id: AnimalId): PieceShape {
  const { name, svg } = SOURCES[id];
  const root = parseSvg(svg, id);

  const silhouette = root.querySelector("#silhouette");
  if (!(silhouette instanceof SVGPathElement)) {
    throw new Error(`Animal "${id}" is missing a <path id="silhouette">.`);
  }
  const outline = silhouette.getAttribute("d");
  if (!outline) {
    throw new Error(`Animal "${id}" has a silhouette with no "d" attribute.`);
  }
  // The outline is interpolated straight into markup, both here and when the
  // hole is cut, so anything that could break a quoted attribute is a broken
  // asset rather than something the runtime should try to recover from.
  if (/[&"<>]/.test(outline)) {
    throw new Error(`Animal "${id}" has a silhouette whose "d" is not path data.`);
  }

  const viewBox = root.getAttribute("viewBox");
  if (viewBox !== `0 0 ${ART_BOX} ${ART_BOX}`) {
    throw new Error(
      `Animal "${id}" must use viewBox "0 0 ${ART_BOX} ${ART_BOX}" so pieces and holes share one scale (got "${viewBox}").`,
    );
  }

  const detail = root.querySelector("#detail");

  return {
    id: pieceId(id),
    outline,
    // The body is drawn from `outline` itself, so the coloured piece and the
    // hole it drops into can only ever be the same shape.
    artwork:
      `<path d="${outline}" ${bodyAttributes(silhouette)} />` +
      `<g>${detail ? detail.innerHTML : ""}</g>`,
    box: ANIMAL_BOX,
    anchor: animalAnchor(id),
    label: name,
  };
}

let cachedShapes: readonly PieceShape[] | null = null;

/** Every animal, as a piece shape. */
export function loadAnimalShapes(): readonly PieceShape[] {
  if (!cachedShapes) {
    // Every animal is parsed up front: a malformed asset should fail loudly at
    // startup, not on the stage that happens to use it.
    cachedShapes = ANIMAL_IDS.map(parseAnimal);
  }
  return cachedShapes;
}
