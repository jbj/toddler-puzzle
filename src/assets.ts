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
import type { Point, Rect, Size } from "./geometry";
import { pieceId, type PieceShape } from "./piece";
import type { ThemeId } from "./themes";

import butterflySvg from "./assets/animals/butterfly.svg?raw";
import cowSvg from "./assets/animals/cow.svg?raw";
import crabSvg from "./assets/animals/crab.svg?raw";
import duckSvg from "./assets/animals/duck.svg?raw";
import elephantSvg from "./assets/animals/elephant.svg?raw";
import fishSvg from "./assets/animals/fish.svg?raw";
import frogSvg from "./assets/animals/frog.svg?raw";
import giraffeSvg from "./assets/animals/giraffe.svg?raw";
import monkeySvg from "./assets/animals/monkey.svg?raw";
import octopusSvg from "./assets/animals/octopus.svg?raw";
import parrotSvg from "./assets/animals/parrot.svg?raw";
import penguinSvg from "./assets/animals/penguin.svg?raw";
import pigSvg from "./assets/animals/pig.svg?raw";
import rabbitSvg from "./assets/animals/rabbit.svg?raw";
import turtleSvg from "./assets/animals/turtle.svg?raw";
import whaleSvg from "./assets/animals/whale.svg?raw";

export const ANIMAL_IDS = [
  "duck",
  "elephant",
  "giraffe",
  "turtle",
  "rabbit",
  "butterfly",
  "fish",
  "frog",
  "penguin",
  "crab",
  "cow",
  "pig",
  "whale",
  "octopus",
  "monkey",
  "parrot",
] as const;
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
  fish: 190,
  frog: 207,
  penguin: 216,
  crab: 212,
  cow: 212,
  pig: 198,
  whale: 190,
  octopus: 202,
  monkey: 209,
  parrot: 206,
};

/** Where an animal stands within its art box: on its feet, centred. */
export const animalAnchor = (id: AnimalId): Point => {
  const y = FOOT_LEVEL[id];
  if (y === undefined) throw new Error(`Animal "${id}" has no FOOT_LEVEL.`);
  return { x: ART_BOX / 2, y };
};

/**
 * Where each animal actually draws inside its art box - left, top, width,
 * height in art units - stroke and overhang included, rounded outwards so the
 * box never clips the drawing. Set these from `npm run art:check`, never by eye.
 *
 * Every other kind of piece says where it draws inside the box it carries: a
 * slice, a jigsaw piece and a shape of a picture all do. An animal that said
 * nothing was taken to fill its box, and none of them does - a pig draws a
 * little over half its box's height - so the box a whole animal was placed by
 * reached most of a pig above and below the pig. See
 * [decision 20260731T133000](../docs/decisions/20260731T133000-one-box-measures-a-piece.md).
 */
const ANIMAL_INK: Record<AnimalId, readonly [number, number, number, number]> = {
  giraffe: [30, 12, 186, 217],
  elephant: [40, 62, 177, 157],
  duck: [19, 35, 206, 168],
  turtle: [21, 53, 214, 134],
  rabbit: [29, 7, 198, 208],
  butterfly: [10, 16, 220, 191],
  fish: [23, 43, 194, 150],
  frog: [7, 33, 226, 177],
  penguin: [36, 17, 168, 202],
  crab: [5, 41, 230, 174],
  cow: [17, 37, 202, 178],
  pig: [19, 72, 200, 129],
  whale: [15, 16, 205, 177],
  octopus: [20, 51, 204, 154],
  monkey: [45, 33, 163, 179],
  parrot: [25, 27, 190, 182],
};

/** What an animal draws inside its art box, as a rectangle. */
export const animalInk = (id: AnimalId): Rect => {
  const ink = ANIMAL_INK[id];
  if (ink === undefined) throw new Error(`Animal "${id}" has no ANIMAL_INK.`);
  const [x, y, width, height] = ink;
  return { x, y, width, height };
};

/**
 * Which themed casts each animal belongs to (`themes.ts`). An animal joins
 * every theme a child would expect to find it in, so a butterfly is over the
 * meadow as well as under the canopy - and pays for the second membership by
 * having to read distinctly from the rest of both. `npm run art:check` enforces
 * that, one theme at a time; nothing here may be widened without running it.
 *
 * No animal is a vehicle, so nothing lists that theme yet.
 */
const ANIMAL_THEMES: Record<AnimalId, readonly ThemeId[]> = {
  duck: ["farm"],
  elephant: ["jungle"],
  giraffe: ["jungle"],
  turtle: ["sea"],
  rabbit: ["farm"],
  butterfly: ["farm", "jungle"],
  fish: ["sea"],
  frog: ["jungle"],
  penguin: ["sea"],
  crab: ["sea"],
  cow: ["farm"],
  pig: ["farm"],
  whale: ["sea"],
  octopus: ["sea"],
  monkey: ["jungle"],
  parrot: ["jungle"],
};

/** The themes this animal belongs to. */
export const animalThemes = (id: AnimalId): readonly ThemeId[] => {
  const themes = ANIMAL_THEMES[id];
  if (themes === undefined) throw new Error(`Animal "${id}" has no themes.`);
  return themes;
};

const SOURCES: Record<AnimalId, { name: string; svg: string }> = {
  duck: { name: "Duck", svg: duckSvg },
  elephant: { name: "Elephant", svg: elephantSvg },
  giraffe: { name: "Giraffe", svg: giraffeSvg },
  turtle: { name: "Turtle", svg: turtleSvg },
  rabbit: { name: "Rabbit", svg: rabbitSvg },
  butterfly: { name: "Butterfly", svg: butterflySvg },
  fish: { name: "Fish", svg: fishSvg },
  frog: { name: "Frog", svg: frogSvg },
  penguin: { name: "Penguin", svg: penguinSvg },
  crab: { name: "Crab", svg: crabSvg },
  cow: { name: "Cow", svg: cowSvg },
  pig: { name: "Pig", svg: pigSvg },
  whale: { name: "Whale", svg: whaleSvg },
  octopus: { name: "Octopus", svg: octopusSvg },
  monkey: { name: "Monkey", svg: monkeySvg },
  parrot: { name: "Parrot", svg: parrotSvg },
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
    inked: animalInk(id),
    anchor: animalAnchor(id),
    label: name,
    themes: animalThemes(id),
  };
}

let cachedShapes: readonly PieceShape[] | null = null;

/** Every animal, as a piece shape. */
export function loadAnimalShapes(): readonly PieceShape[] {
  if (!cachedShapes) {
    // Every animal is parsed up front: a malformed asset should fail loudly at
    // startup, not on the level that happens to use it.
    cachedShapes = ANIMAL_IDS.map(parseAnimal);
  }
  return cachedShapes;
}
