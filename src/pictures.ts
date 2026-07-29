/**
 * The picture scenes: hand-authored SVG artwork for the chapters that cut a
 * picture up rather than dealing an animal.
 *
 * A scene is not a piece and never becomes one. It is a *backdrop* that a kind
 * clips through piece outlines it generated itself, so one scene serves a 2x2
 * board and a 4x3 board without being redrawn. That is why nothing here has an
 * anchor, an outline or a theme: the shape of a jigsaw piece comes from the
 * cutter, and the only thing the scene owes it is a picture that survives being
 * cut anywhere.
 *
 * Each scene is authored as a standalone SVG with a fixed structure:
 *
 *   <svg viewBox="0 0 480 360">
 *     <g id="scene"> ... </g>          everything the picture draws
 *   </svg>
 *
 * `artwork` is what is *inside* that group, so a caller can drop it into a
 * clipped group of its own. Two rules make that safe, and both are enforced
 * here rather than hoped for, because several scenes end up inlined into one
 * document at once:
 *
 *   - **nothing inside carries an id**, so two scenes on one board cannot
 *     collide or steal each other's references;
 *   - **nothing refers outward** - no `href`, no `url(...)`, no `<image>`, no
 *     `<use>` - so a scene draws the same whatever document it lands in, with
 *     nothing to fetch and nothing to fail to load.
 *
 * The rest of the contract is about whether the picture *cuts* well, which is
 * a question about pixels rather than markup: every piece has to have something
 * in it at every grid the level table asks for. `npm run art:check` measures
 * that; `.github/instructions/art.instructions.md` says what to do when it
 * fails.
 *
 * Parsed by hand rather than with `DOMParser`, unlike `assets.ts`: the wrapper
 * is fixed rather than free-form, so there is nothing to query for, and staying
 * off the DOM keeps the catalogue checkable in a plain unit test instead of
 * only in a browser.
 */
import type { Size } from "./geometry";

import farmyardSvg from "./assets/scenes/farmyard.svg?raw";
import junglePathSvg from "./assets/scenes/jungle-path.svg?raw";
import nightSkySvg from "./assets/scenes/night-sky.svg?raw";
import rockpoolSvg from "./assets/scenes/rockpool.svg?raw";

/**
 * The box every scene is authored in.
 *
 * Four by three, because that is the shape of the busiest grid the level table
 * cuts a picture at (level 30). A 4x3 grid over a 4:3 box gives square pieces,
 * and every other grid in the table - 2x2, 3x2, 3x3 - divides it into whole
 * units too, so a piece outline maps onto the artwork without rounding.
 */
export const PICTURE_BOX: Size = { width: 480, height: 360 };

/** Every scene in the library, in no particular order. */
export const PICTURE_IDS = ["farmyard", "rockpool", "jungle-path", "night-sky"] as const;

export type PictureId = (typeof PICTURE_IDS)[number];

/** One scene, ready to be clipped through whatever outlines a kind generates. */
export interface Picture {
  readonly id: PictureId;
  /** For a grown-up reading a level map; never shown to the child. */
  readonly label: string;
  /** The box `artwork` is drawn in. The same for every scene. */
  readonly box: Size;
  /** The markup inside `<g id="scene">`, safe to inline more than once. */
  readonly artwork: string;
}

const SOURCES: Record<PictureId, { name: string; svg: string }> = {
  farmyard: { name: "Farmyard", svg: farmyardSvg },
  rockpool: { name: "Rockpool", svg: rockpoolSvg },
  "jungle-path": { name: "Jungle path", svg: junglePathSvg },
  "night-sky": { name: "Night sky", svg: nightSkySvg },
};

/**
 * Markup a scene may not contain, and why. Every one of them either reaches
 * outside the document or names something another scene could name too, and
 * both break the moment two scenes share a board.
 */
const FORBIDDEN: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bid\s*=/, why: 'an "id" attribute, which could collide with another scene' },
  {
    pattern: /<(?:image|use|script|foreignObject)\b/,
    why: "an element that reaches outside itself",
  },
  { pattern: /<text\b/, why: "text, which a two-year-old cannot read" },
  {
    pattern: /<(?:defs|style|clipPath|mask|filter|linearGradient|radialGradient|pattern)\b/,
    why: "a definition that has to be referred to by id",
  },
  { pattern: /\b(?:xlink:href|href)\s*=/, why: "a reference to something outside itself" },
  { pattern: /url\(/, why: "a url(...) reference, which needs an id to point at" },
];

/**
 * The markup inside the outermost `<g id="scene">`, or a thrown error.
 *
 * Counts group depth rather than looking for the first `</g>`, because a scene
 * is mostly groups; a self-closing group is treated as the empty group it is.
 */
function sceneContents(id: PictureId, svg: string): string {
  const opening = /<g\s+id="scene"\s*>/.exec(svg);
  if (!opening) {
    throw new Error(`Scene "${id}" is missing its <g id="scene"> wrapper.`);
  }
  const start = opening.index + opening[0].length;
  const groups = /<g\b[^>]*>|<\/g\s*>/g;
  groups.lastIndex = start;
  let depth = 1;
  for (let match = groups.exec(svg); match; match = groups.exec(svg)) {
    if (match[0].startsWith("</")) depth--;
    else if (!match[0].endsWith("/>")) depth++;
    if (depth === 0) return svg.slice(start, match.index);
  }
  throw new Error(`Scene "${id}" never closes its <g id="scene"> wrapper.`);
}

function parsePicture(id: PictureId): Picture {
  const { name, svg } = SOURCES[id];

  const viewBox = /<svg\b[^>]*\bviewBox="([^"]*)"/.exec(svg)?.[1];
  const wanted = `0 0 ${PICTURE_BOX.width} ${PICTURE_BOX.height}`;
  if (viewBox !== wanted) {
    throw new Error(
      `Scene "${id}" must use viewBox "${wanted}" so a piece outline lands on the same picture every time (got "${viewBox}").`,
    );
  }

  const artwork = sceneContents(id, svg);
  if (artwork.trim() === "") {
    throw new Error(`Scene "${id}" draws nothing.`);
  }
  for (const { pattern, why } of FORBIDDEN) {
    if (pattern.test(artwork)) {
      throw new Error(`Scene "${id}" contains ${why}; see src/pictures.ts for the scene contract.`);
    }
  }

  return { id, label: name, box: PICTURE_BOX, artwork };
}

let cached: readonly Picture[] | null = null;

/** Every scene, as artwork ready to be cut. */
export function loadPictures(): readonly Picture[] {
  // Parsed up front, like the animals: a malformed scene should fail on the
  // first level of the game rather than on the one that happens to use it.
  cached ??= PICTURE_IDS.map(parsePicture);
  return cached;
}

/**
 * The scene a level named, or a thrown error naming the ones there are.
 *
 * A level's `scene` option is a plain string - the level table is allowed to
 * run ahead of the artwork - so this is where a name nobody drew is caught.
 */
export function pictureFor(id: string): Picture {
  const found = loadPictures().find((picture) => picture.id === id);
  if (!found) {
    throw new Error(`No scene called "${id}"; the library holds ${PICTURE_IDS.join(", ")}.`);
  }
  return found;
}
