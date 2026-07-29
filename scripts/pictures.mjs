/**
 * What a picture scene has to survive: being cut into rectangles.
 *
 * A jigsaw piece is a rectangle of the artwork, taken from wherever the grid
 * falls, so the thing that decides whether a scene works is not how it looks
 * whole - it is whether *every* rectangle of it has something in it. A sky a
 * painter would be proud of cuts into four pieces of identical blue, and a
 * two-year-old holding one of those has nothing to match it on.
 *
 * That question is about pixels, so this works in pixels: rasterise the scene
 * once, coarsely, then score each cell of each grid the level table uses.
 * Shared by `check-art.mjs`, which judges, and `preview.mjs`, which draws the
 * same grid over the picture so a human can see what the numbers meant.
 *
 * The scoring half is deliberately pure - it takes a pixel buffer and returns
 * numbers, with no files and no ImageMagick in it - so `tests/scene-cells.test.mjs`
 * can hold it to known pictures.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { magick, rsvg } from "./tools.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Where the scenes live, and the box they are all authored in. */
export const scenesDir = join(root, "src/assets/scenes");

/** Must match PICTURE_BOX in src/pictures.ts. */
export const PICTURE_WIDTH = 480;
export const PICTURE_HEIGHT = 360;

/**
 * The size a scene is measured at: half the art box in each direction, after
 * being rendered at four times it and averaged down.
 *
 * Coarse on purpose. Half of "no detail so fine it vanishes at piece size" is
 * measured by simply *not looking* at that detail: a two-unit line in the art
 * box is a single blended pixel here, so it cannot carry a cell on its own. It
 * also divides evenly by every grid the table uses - 2, 3 and 4 columns, 2 and
 * 3 rows - so no cell is a pixel wider than its neighbour.
 */
export const MEASURE_WIDTH = PICTURE_WIDTH / 2;
export const MEASURE_HEIGHT = PICTURE_HEIGHT / 2;

/**
 * How far apart two colours have to be before a toddler is going to see a
 * boundary between them, as a difference on the widest-differing channel out
 * of 255.
 *
 * Set where two shades of the same green stop counting: the grass and the far
 * field of the farmyard differ by 34, and they are meant to read as one field
 * lit two ways rather than as two things. A barn against sky differs by well
 * over a hundred.
 */
export const DISTINCT = 40;

/**
 * How much of a piece has to be something other than its own background.
 *
 * A tenth. Below that a piece is a wash with a speck in the corner, which is
 * the failure this whole file exists to catch; much above it and an honest
 * patch of sky with a cloud in it would be banned, and a picture with no sky in
 * it is not a picture.
 */
export const MIN_FEATURE = 0.1;

/** Every scene file, id first, sorted. */
export function sceneFiles() {
  return readdirSync(scenesDir)
    .filter((file) => file.endsWith(".svg"))
    .sort()
    .map((file) => ({ id: basename(file, ".svg"), path: join(scenesDir, file) }));
}

/** The scene ids `src/pictures.ts` registers. */
export function registeredPictures() {
  const source = readFileSync(join(root, "src/pictures.ts"), "utf8");
  const list = source.match(/PICTURE_IDS\s*=\s*\[([^\]]*)\]/);
  if (!list) throw new Error("could not find PICTURE_IDS in src/pictures.ts");
  return [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Every scene name the level table asks for, deduplicated. */
export function scenesInLevels() {
  const source = readFileSync(join(root, "src/levels.ts"), "utf8");
  return [...new Set([...source.matchAll(/scene:\s*"([^"]+)"/g)].map((m) => m[1]))].sort();
}

/**
 * Every grid the level table cuts a picture at, smallest first, with the
 * busiest one guaranteed to be in there. A scene has to survive all of them,
 * and the busiest is the one that decides whether it survives at all.
 */
export function gridsInLevels() {
  const source = readFileSync(join(root, "src/levels.ts"), "utf8");
  const found = new Map();
  for (const [, columns, rows] of source.matchAll(
    /grid:\s*\{\s*columns:\s*(\d+),\s*rows:\s*(\d+)\s*\}/g,
  )) {
    found.set(`${columns}x${rows}`, { columns: Number(columns), rows: Number(rows) });
  }
  if (found.size === 0) throw new Error("could not find any grid in src/levels.ts");
  return [...found.values()].sort((a, b) => a.columns * a.rows - b.columns * b.rows);
}

/** A grid, as a human reads it. */
export const gridName = ({ columns, rows }) => `${columns}x${rows}`;

/**
 * The picture with a grid drawn over it, for review. Returns SVG text: the
 * scene untouched, with the cut lines and nothing else added, so what a human
 * looks at is what the numbers were taken from.
 */
export function withGrid(svg, { columns, rows }) {
  const closing = svg.lastIndexOf("</svg>");
  if (closing === -1) throw new Error("no </svg> found");
  const lines = [];
  for (let column = 1; column < columns; column++) {
    const x = (PICTURE_WIDTH / columns) * column;
    lines.push(`<path d="M${x} 0 L${x} ${PICTURE_HEIGHT}" />`);
  }
  for (let row = 1; row < rows; row++) {
    const y = (PICTURE_HEIGHT / rows) * row;
    lines.push(`<path d="M0 ${y} L${PICTURE_WIDTH} ${y}" />`);
  }
  const overlay =
    `<g fill="none" stroke="#ffffff" stroke-width="6" stroke-opacity="0.75">${lines.join("")}</g>` +
    `<g fill="none" stroke="#1b1b22" stroke-width="2">${lines.join("")}</g>`;
  return svg.slice(0, closing) + overlay + svg.slice(closing);
}

// --- rasterising ----------------------------------------------------------

/**
 * Rasterise a scene, and hand back both things worth asking of the pixels:
 * whether every one of them is opaque, and what colour they are.
 *
 * Rendered on nothing, so a hole in the picture stays a hole. A scene has to
 * paint its whole box - a piece cut from a gap would be a transparent piece,
 * and the child would be holding the board's background in the shape of a
 * jigsaw piece - so the transparency is measured before the colours are
 * flattened onto white for measuring.
 */
export function rasterise(svgPath, scratch, name) {
  const png = join(scratch, `${name}.png`);
  rsvg(["-w", String(MEASURE_WIDTH * 4), "-h", String(MEASURE_HEIGHT * 4), svgPath, "-o", png]);

  const alpha = join(scratch, `${name}-alpha.png`);
  magick([png, "-alpha", "extract", alpha]);
  const opaque = Number(magick([alpha, "-format", "%[fx:minima]", "info:"]).toString());

  const raw = join(scratch, `${name}.rgb`);
  magick([
    png,
    "-background",
    "white",
    "-alpha",
    "remove",
    "-resize",
    `${MEASURE_WIDTH}x${MEASURE_HEIGHT}!`,
    "-depth",
    "8",
    `RGB:${raw}`,
  ]);
  const bytes = readFileSync(raw);
  const wanted = MEASURE_WIDTH * MEASURE_HEIGHT * 3;
  if (bytes.length !== wanted) {
    throw new Error(`Expected ${wanted} bytes from ${svgPath}, got ${bytes.length}.`);
  }
  return {
    png,
    pixels: bytes,
    width: MEASURE_WIDTH,
    height: MEASURE_HEIGHT,
    /** 1 when the thinnest pixel is fully opaque, so the box is fully painted. */
    opacity: opaque,
  };
}

/** Write an SVG somewhere the rasteriser can reach it, and return the path. */
export function scratchSvg(text, scratch, name) {
  const path = join(scratch, `${name}.svg`);
  writeFileSync(path, text);
  return path;
}

/** Which of 8 levels per channel a colour falls in; the bucket a cell votes in. */
const bucketOf = (r, g, b) => ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);

/**
 * Score one cell of a picture.
 *
 * The measure is "how much of this piece is not its own background": find the
 * colour the cell is mostly made of, then count the pixels that differ from it
 * by more than `DISTINCT` on some channel. It is deliberately not a variance:
 * variance rewards a gradient, which a child cannot match on, and punishes a
 * cell that is one flat thing against one flat background, which is exactly
 * what a piece of a toddler's jigsaw should be.
 *
 * `pixels` is RGB triples, row-major, `width` by `height`.
 */
export function cellFeature(pixels, width, height, cell) {
  const { left, top, right, bottom } = cell;
  const votes = new Int32Array(512);
  const sums = new Float64Array(512 * 3);
  let counted = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const at = (y * width + x) * 3;
      const bucket = bucketOf(pixels[at], pixels[at + 1], pixels[at + 2]);
      votes[bucket]++;
      sums[bucket * 3] += pixels[at];
      sums[bucket * 3 + 1] += pixels[at + 1];
      sums[bucket * 3 + 2] += pixels[at + 2];
      counted++;
    }
  }
  if (counted === 0) throw new Error("cell has no pixels in it");

  let dominant = 0;
  for (let bucket = 1; bucket < votes.length; bucket++) {
    if (votes[bucket] > votes[dominant]) dominant = bucket;
  }
  const background = [
    sums[dominant * 3] / votes[dominant],
    sums[dominant * 3 + 1] / votes[dominant],
    sums[dominant * 3 + 2] / votes[dominant],
  ];

  let different = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const at = (y * width + x) * 3;
      const apart = Math.max(
        Math.abs(pixels[at] - background[0]),
        Math.abs(pixels[at + 1] - background[1]),
        Math.abs(pixels[at + 2] - background[2]),
      );
      if (apart > DISTINCT) different++;
    }
  }
  return { feature: different / counted, background };
}

/** Where each cell of a grid falls in a pixel buffer, reading order. */
export function cellsOf(width, height, { columns, rows }) {
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({
        column,
        row,
        left: Math.round((width / columns) * column),
        right: Math.round((width / columns) * (column + 1)),
        top: Math.round((height / rows) * row),
        bottom: Math.round((height / rows) * (row + 1)),
      });
    }
  }
  return cells;
}

/**
 * Every cell of one grid, scored. The worst of these is what decides whether a
 * scene may be cut that way at all.
 */
export function scoreGrid(pixels, width, height, grid) {
  return cellsOf(width, height, grid).map((cell) => ({
    ...cell,
    ...cellFeature(pixels, width, height, cell),
  }));
}

/** A share, as a percent a human can act on - rounded *down*, so a number
 * printed next to a failure is never flattering: a cell at 9.6% reads "9%"
 * rather than looking as if it met a floor of 10%. */
export const percent = (share) => `${Math.floor(share * 100)}%`;
