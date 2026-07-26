/**
 * Asset loading.
 *
 * Each animal is authored as a standalone SVG with a strict structure:
 *
 *   <svg viewBox="0 0 240 240">
 *     <path id="silhouette" d="..."/>   one closed outer outline
 *     <g id="detail"> ... </g>          eyes, ears, spots
 *   </svg>
 *
 * The *same* silhouette path is used both to draw the draggable piece and to
 * cut the hole in the scene, which is what guarantees a piece always fits its
 * hole exactly. If an asset is malformed we throw immediately at startup rather
 * than silently rendering an unsolvable puzzle.
 */
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

export interface AnimalArt {
  readonly id: AnimalId;
  readonly name: string;
  /** The `d` attribute of the outline - used for the hole. */
  readonly silhouettePath: string;
  /** Full `<path id="silhouette">` markup - used for the coloured piece. */
  readonly silhouetteMarkup: string;
  /** Inner markup of `<g id="detail">`. */
  readonly detailMarkup: string;
}

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

function parseAnimal(id: AnimalId): AnimalArt {
  const { name, svg } = SOURCES[id];
  const root = parseSvg(svg, id);

  const silhouette = root.querySelector("#silhouette");
  if (!(silhouette instanceof SVGPathElement)) {
    throw new Error(`Animal "${id}" is missing a <path id="silhouette">.`);
  }
  const silhouettePath = silhouette.getAttribute("d");
  if (!silhouettePath) {
    throw new Error(`Animal "${id}" has a silhouette with no "d" attribute.`);
  }

  const viewBox = root.getAttribute("viewBox");
  if (viewBox !== `0 0 ${ART_BOX} ${ART_BOX}`) {
    throw new Error(
      `Animal "${id}" must use viewBox "0 0 ${ART_BOX} ${ART_BOX}" so pieces and holes share one scale (got "${viewBox}").`,
    );
  }

  const detail = root.querySelector("#detail");

  return {
    id,
    name,
    silhouettePath,
    silhouetteMarkup: silhouette.outerHTML,
    detailMarkup: detail ? detail.innerHTML : "",
  };
}

let cachedAnimals: Record<AnimalId, AnimalArt> | null = null;

export function loadAnimals(): Record<AnimalId, AnimalArt> {
  if (!cachedAnimals) {
    const parsed = {} as Record<AnimalId, AnimalArt>;
    // Every animal is parsed up front: a malformed asset should fail loudly at
    // startup, not on the stage that happens to use it.
    for (const id of ANIMAL_IDS) parsed[id] = parseAnimal(id);
    cachedAnimals = parsed;
  }
  return cachedAnimals;
}
