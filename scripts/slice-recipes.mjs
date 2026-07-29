/**
 * Work out where to cut every animal, and write the table.
 *
 *   npm run art:slices
 *
 * Rasterises each animal, searches for cuts that leave two, three and four
 * whole, fair, grabbable slices (`slices.mjs` does the judging), and writes
 * `src/slice-recipes.json`. Nothing derives these at runtime: the search needs
 * pixels and a second of arithmetic per animal, and the answer only changes
 * when the artwork does.
 *
 * This is the same contract `FOOT_LEVEL` has - a script measures it, a human
 * commits it, and `npm run art:check` fails if the two ever part company. Run
 * this after drawing or redrawing an animal, look at the result with
 * `npm run art`, and commit the table with the artwork.
 *
 * Needs rsvg-convert and ImageMagick.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { maskPixels, recipeFor, writeTable } from "./slices.mjs";
import { magick, requireArtTools, rsvg } from "./tools.mjs";

requireArtTools();

const root = fileURLToPath(new URL("..", import.meta.url));
const animalsDir = join(root, "src/assets/animals");
const scratch = join(root, ".art/slices");
const table = join(root, "src/slice-recipes.json");

/** Must match ART_BOX in src/assets.ts, and SLICE_COUNTS in src/slices.ts. */
const ART_BOX = 240;
const COUNTS = [2, 3, 4];
/** Rendered large and measured small, so the threshold is not aliased. */
const SAMPLE = ART_BOX * 8;

mkdirSync(scratch, { recursive: true });

/**
 * Render an animal with some CSS injected and return the opaque pixels, on the
 * measuring grid. The same trick `check-art.mjs` uses, and deliberately the
 * same numbers: a recipe measured on a different raster than the one the check
 * re-measures would fail the check the moment it was written.
 */
export function maskOf(svg, css, name) {
  const openTagEnd = svg.indexOf(">", svg.indexOf("<svg"));
  if (openTagEnd === -1) throw new Error("no <svg> element found");
  const patched = `${svg.slice(0, openTagEnd + 1)}<style>${css}</style>${svg.slice(openTagEnd + 1)}`;
  const svgPath = join(scratch, `${name}.svg`);
  const pngPath = join(scratch, `${name}.png`);
  writeFileSync(svgPath, patched);
  rsvg(["-w", String(SAMPLE), "-h", String(SAMPLE), svgPath, "-o", pngPath]);
  magick([pngPath, "-alpha", "extract", "-threshold", "50%", pngPath]);
  return maskPixels(pngPath, scratch, name);
}

const files = readdirSync(animalsDir)
  .filter((file) => file.endsWith(".svg"))
  .sort();

const recipes = {};
let missing = 0;

for (const file of files) {
  const id = basename(file, ".svg");
  const svg = readFileSync(join(animalsDir, file), "utf8");
  const silhouette = maskOf(svg, "#detail{display:none}", `${id}-silhouette`);
  const drawn = maskOf(svg, "", `${id}-drawn`);

  recipes[id] = {};
  const notes = [];
  for (const count of COUNTS) {
    const recipe = recipeFor(silhouette, drawn, count);
    if (!recipe) {
      missing++;
      notes.push(`${count}: NONE`);
      continue;
    }
    recipes[id][String(count)] = recipe;
    notes.push(`${count}: ${recipe.cuts.map(([, angle]) => `${angle}deg`).join(" ")}`);
  }
  console.log(`${id.padEnd(10)} ${notes.join("   ")}`);
}

await writeTable(table, recipes);
console.log(`\nWrote ${table.slice(root.length)}`);
if (missing > 0) {
  console.error(
    `\n${missing} recipe(s) could not be found. Loosen the limits in scripts/slices.mjs, ` +
      "or redraw the animal so it has somewhere to be cut.",
  );
  process.exit(1);
}
