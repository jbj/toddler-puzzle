/**
 * Art review harness.
 *
 * Renders every animal SVG twice - full colour, and silhouette-only - into a
 * single contact sheet. The silhouette view matters because that shape is what
 * gets cut into the scene as a hole: if a toddler can't tell what it is from the
 * outline alone, the puzzle doesn't work.
 *
 *   node scripts/preview.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const animalsDir = join(root, "src/assets/animals");
const outDir = join(root, ".art");
const CELL = 300;

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
  execFileSync("rsvg-convert", [
    "-w", String(CELL),
    "-h", String(CELL),
    "-b", background,
    tmp,
    "-o", outPath,
  ]);
}

const files = readdirSync(animalsDir).filter((f) => f.endsWith(".svg")).sort();
if (files.length === 0) {
  console.error("No animal SVGs found in", animalsDir);
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
  const column = join(outDir, `${name}-column.png`);
  execFileSync("magick", [
    "-background", "white",
    "-fill", "#333",
    "-pointsize", "22",
    "label:" + name,
    colourPng,
    silPng,
    "-append",
    column,
  ]);
  columns.push(column);
}

const sheet = join(outDir, "contact-sheet.png");
execFileSync("magick", [...columns, "+append", "-bordercolor", "white", "-border", "8", sheet]);
console.log(sheet);
