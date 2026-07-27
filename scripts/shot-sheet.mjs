/**
 * Packs the screenshots from `npm run shot` into one image to attach to a pull
 * request.
 *
 *   node scripts/shot-sheet.mjs
 *
 * `npm run shot` calls this at the end, so the sheet is already waiting at
 * .art/shots/contact-sheet.png by the time the run finishes.
 *
 * One file rather than eleven, because the cost of attaching evidence decides
 * whether it gets attached at all. Reviewing a puzzle means looking at it, and
 * nothing in CI can do that looking on the reviewer's behalf - see
 * docs/decisions/0006.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { magick, haveImageMagick } from "./tools.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const shotsDir = join(root, ".art/shots");

const SHEET = "contact-sheet.png";
const CELL_HEIGHT = 300;
const COLUMNS = 4;

/**
 * Builds the sheet and returns its path, or null if there was nothing to pack
 * or ImageMagick is not installed. Throws if ImageMagick fails.
 */
export function buildSheet() {
  if (!existsSync(shotsDir) || !haveImageMagick()) return null;
  const shots = readdirSync(shotsDir)
    .filter((f) => f.endsWith(".png") && f !== SHEET)
    .sort();
  if (shots.length === 0) return null;

  const temporaries = [];
  const cells = shots.map((file) => {
    const resized = join(shotsDir, `_fit-${file}`);
    const cell = join(shotsDir, `_cell-${file}`);
    temporaries.push(resized, cell);
    // Portrait and landscape shots come out of the run at different sizes, so
    // normalise on height and let the widths differ. The resize has to happen
    // before the label joins the list, or the label is scaled to 300px tall too.
    magick([join(shotsDir, file), "-resize", `x${CELL_HEIGHT}`, "-depth", "8", "-strip", resized]);
    magick([
      "-background",
      "white",
      "-fill",
      "#333",
      "-pointsize",
      "18",
      `label:${file.replace(/\.png$/, "")}`,
      resized,
      "-gravity",
      "center",
      "-append",
      "-bordercolor",
      "white",
      "-border",
      "8",
      cell,
    ]);
    return cell;
  });

  const rows = [];
  for (let i = 0; i < cells.length; i += COLUMNS) {
    const row = join(shotsDir, `_row-${rows.length}.png`);
    temporaries.push(row);
    magick([
      ...cells.slice(i, i + COLUMNS),
      "-background",
      "white",
      "-gravity",
      "south",
      "+append",
      row,
    ]);
    rows.push(row);
  }

  const sheet = join(shotsDir, SHEET);
  magick([
    ...rows,
    "-background",
    "white",
    "-gravity",
    "west",
    "-append",
    "-depth",
    "8",
    "-strip",
    sheet,
  ]);
  for (const file of temporaries) rmSync(file, { force: true });
  return sheet;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!haveImageMagick()) {
    console.error(
      "Cannot find ImageMagick.\nInstall it first - on Debian or Ubuntu: sudo apt-get install imagemagick",
    );
    process.exit(1);
  }
  const sheet = buildSheet();
  if (!sheet) {
    console.error(`No screenshots in ${shotsDir}. Run npm run shot first.`);
    process.exit(1);
  }
  console.log(sheet);
}
