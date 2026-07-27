/**
 * Art review harness.
 *
 * Renders every animal SVG twice - full colour, and silhouette-only - into a
 * single contact sheet. The silhouette view matters because that shape is what
 * gets cut into the scene as a hole: if a toddler can't tell what it is from the
 * outline alone, the puzzle doesn't work.
 *
 *   node scripts/preview.mjs             every animal, as a contact sheet
 *   node scripts/preview.mjs rabbit      one animal, large enough to judge detail
 *   node scripts/preview.mjs rabbit -a   the same animal printed as text
 *
 * The contact sheet is too small to see whether details line up with the
 * outline; review a single animal large before calling its art finished.
 *
 * `--ascii` exists because not every reviewer can open the PNG: an agent
 * working through a terminal usually cannot, and a coarse picture it can read
 * beats a sharp one it cannot. It is a working view, not a substitute for
 * looking at the render before calling the art done.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { canLabel, magick, requireArtTools, rsvg } from "./tools.mjs";

requireArtTools();

const root = fileURLToPath(new URL("..", import.meta.url));
const animalsDir = join(root, "src/assets/animals");
const outDir = join(root, ".art");
const args = process.argv.slice(2);
const ascii = args.includes("--ascii") || args.includes("-a");
const only = args.find((arg) => !arg.startsWith("-"));
const CELL = only ? 900 : 300;

/** Columns of text an ASCII view is printed in; two rows make one square. */
const ASCII_WIDTH = 120;

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

function render(svgText, outPath, background) {
  const tmp = join(outDir, "_tmp.svg");
  writeFileSync(tmp, svgText);
  rsvg(["-w", String(CELL), "-h", String(CELL), "-b", background, tmp, "-o", outPath]);
}

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

/**
 * Print a rendered PNG as text. Pixels are averaged into a character grid and
 * mapped darkest-first, and the grid is half as tall as it is wide because a
 * character cell is about twice as tall as it is wide.
 */
function printAscii(png, heading) {
  const rows = Math.round(ASCII_WIDTH / 2);
  const grey = join(outDir, "_ascii.pgm");
  magick([
    png,
    "-resize",
    `${ASCII_WIDTH}x${rows}!`,
    "-colorspace",
    "gray",
    "-depth",
    "8",
    "-compress",
    "none",
    grey,
  ]);
  // Plain-text PGM: magic number, width, height, maximum value, then samples.
  const samples = readFileSync(grey, "utf8").split(/\s+/).filter(Boolean).slice(4).map(Number);
  const ramp = "@%#*+=-:. ";
  console.log(`\n${heading}`);
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < ASCII_WIDTH; x++) {
      const value = samples[y * ASCII_WIDTH + x] ?? 255;
      line += ramp[Math.min(ramp.length - 1, Math.floor((value / 256) * ramp.length))];
    }
    console.log(line.replace(/\s+$/, ""));
  }
}

const columns = [];
for (const file of files) {
  const name = basename(file, ".svg");
  const svg = readFileSync(join(animalsDir, file), "utf8");

  const colourPng = join(outDir, `${name}-colour.png`);
  const silPng = join(outDir, `${name}-silhouette.png`);
  render(svg, colourPng, "#fdf6e3");
  render(silhouetteOnly(svg), silPng, "#fdf6e3");

  if (ascii) {
    printAscii(colourPng, `${name} - colour`);
    printAscii(silPng, `${name} - silhouette`);
  }

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
          // Where ImageMagick has no font the name is dropped rather than the
          // sheet: the shapes are what a review looks at, and they stay in
          // alphabetical order left to right.
          ...(canLabel() ? ["-fill", "#333", "-pointsize", "22", `label:${name}`] : []),
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
