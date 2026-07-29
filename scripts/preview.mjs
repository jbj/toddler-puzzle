/**
 * Art review harness.
 *
 * Renders every animal SVG twice - full colour, and silhouette-only - into a
 * single contact sheet. The silhouette view matters because that shape is what
 * gets cut into the scene as a hole: if a toddler can't tell what it is from the
 * outline alone, the puzzle doesn't work.
 *
 *   node scripts/preview.mjs           every animal, as a contact sheet
 *   node scripts/preview.mjs rabbit    one animal, large enough to judge detail
 *   node scripts/preview.mjs scenes    every picture scene, with its cut grid
 *   node scripts/preview.mjs farmyard  one scene, large, at every grid
 *
 * The contact sheet is too small to see whether details line up with the
 * outline; review a single animal large before calling its art finished.
 *
 * A scene is reviewed the same way and for the same reason, but what has to be
 * looked at is different: a scene is cut into rectangles, so it is drawn with
 * the cut lines over it and judged a cell at a time. A cell with nothing in it
 * is a piece a child cannot place, which `npm run art:check` measures - this is
 * where you see what the measurement meant.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { gridName, gridsInLevels, sceneFiles, withGrid } from "./pictures.mjs";
import { magick, requireArtTools, rsvg } from "./tools.mjs";

requireArtTools();

const root = fileURLToPath(new URL("..", import.meta.url));
const animalsDir = join(root, "src/assets/animals");
const outDir = join(root, ".art");
const only = process.argv[2];
const CELL = only ? 900 : 300;

mkdirSync(outDir, { recursive: true });

/** Force the silhouette to a flat fill and hide interior detail. */
function silhouetteOnly(svg) {
  const openTagEnd = svg.indexOf(">", svg.indexOf("<svg"));
  if (openTagEnd === -1) throw new Error("no <svg> element found");
  const style =
    "<style>#detail{display:none}" +
    "#silhouette{fill:#33404f;stroke:#33404f;stroke-width:0}</style>";
  return svg.slice(0, openTagEnd + 1) + style + svg.slice(openTagEnd + 1);
}

function render(svgText, outPath, background, width, height) {
  const tmp = join(outDir, "_tmp.svg");
  writeFileSync(tmp, svgText);
  rsvg([
    "-w",
    String(width ?? CELL),
    "-h",
    String(height ?? CELL),
    "-b",
    background,
    tmp,
    "-o",
    outPath,
  ]);
}

// --- scenes ---------------------------------------------------------------

/**
 * The picture scenes, drawn with the grid they get cut at.
 *
 * One scene is shown large and once per grid, because a scene that works at
 * 2x2 can still hand out an empty piece at 4x3; the whole set is shown at the
 * busiest grid only, which is the one that decides.
 */
function reviewScenes(wanted) {
  const scenes = sceneFiles().filter((scene) => wanted === "scenes" || scene.id === wanted);
  const grids = gridsInLevels();
  const busiest = grids[grids.length - 1];
  const width = wanted === "scenes" ? 480 : 760;
  const height = (width * 3) / 4;
  const columns = [];

  for (const scene of scenes) {
    const svg = readFileSync(scene.path, "utf8");
    const views = [];
    const draw = (text, name) => {
      const png = join(outDir, `${scene.id}-${name}.png`);
      render(text, png, "#ffffff", width, height);
      views.push(png);
      return png;
    };
    draw(svg, "plain");
    for (const grid of wanted === "scenes" ? [busiest] : grids) {
      draw(withGrid(svg, grid), `grid-${gridName(grid)}`);
    }

    const column = join(outDir, `${scene.id}-scene.png`);
    magick([
      "-background",
      "white",
      "-fill",
      "#333",
      "-pointsize",
      "24",
      `label:${scene.id}`,
      ...views,
      "-append",
      column,
    ]);
    columns.push(column);
  }

  if (columns.length === 0) {
    console.error(`No scene named "${wanted}" in ${join(root, "src/assets/scenes")}`);
    process.exit(1);
  }
  const sheet = join(outDir, wanted === "scenes" ? "scene-sheet.png" : `${wanted}-large.png`);
  magick([...columns, "+append", "-bordercolor", "white", "-border", "8", sheet]);
  console.log(sheet);
}

if (only && (only === "scenes" || sceneFiles().some((scene) => scene.id === only))) {
  reviewScenes(only);
  process.exit(0);
}

// --- animals --------------------------------------------------------------

const files = readdirSync(animalsDir)
  .filter((f) => f.endsWith(".svg"))
  .filter((f) => !only || basename(f, ".svg") === only)
  .sort();
if (files.length === 0) {
  console.error(
    only ? `No animal named "${only}" in ${animalsDir}` : `No animal SVGs found in ${animalsDir}`,
  );
  process.exit(1);
}

const columns = [];
for (const file of files) {
  const name = basename(file, ".svg");
  const svg = readFileSync(join(animalsDir, file), "utf8");

  const colourPng = join(outDir, `${name}-colour.png`);
  const silPng = join(outDir, `${name}-silhouette.png`);
  render(svg, colourPng, "#fdf6e3");
  render(silhouetteOnly(svg), silPng, "#fdf6e3");

  // Stack the two views vertically, labelled, to form one column per animal.
  // A single animal is laid out side by side instead: it is being inspected,
  // not compared, and a 900px column would not fit on screen.
  const column = join(outDir, `${name}-column.png`);
  magick(
    only
      ? [colourPng, silPng, "+append", column]
      : [
          "-background",
          "white",
          "-fill",
          "#333",
          "-pointsize",
          "22",
          "label:" + name,
          colourPng,
          silPng,
          "-append",
          column,
        ],
  );
  columns.push(column);
}

const sheet = join(outDir, only ? `${only}-large.png` : "contact-sheet.png");
magick([...columns, "+append", "-bordercolor", "white", "-border", "8", sheet]);
console.log(sheet);
