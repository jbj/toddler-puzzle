/**
 * Packs the screenshots from `npm run shot` into one image to attach to a pull
 * request.
 *
 *   node scripts/shot-sheet.mjs
 *
 * `npm run shot` calls this at the end, so the sheet is already waiting at
 * .art/shots/contact-sheet.png by the time the run finishes.
 *
 * One file rather than thirteen, because the cost of attaching evidence decides
 * whether it gets attached at all. Reviewing a puzzle means looking at it, and
 * nothing in CI can do that looking on the reviewer's behalf - see
 * docs/decisions/Let the author attach the screenshots.md.
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
 * Whether ImageMagick can render text. Ubuntu's imagemagick package installed
 * without recommends has no font, and `label:` then fails with "unable to read
 * font (null)" - which is how the GitHub runner is set up. Probing once beats
 * naming a font, since which fonts exist is exactly what varies.
 */
let labelsWork;
function canLabel() {
  if (labelsWork === undefined) {
    const probe = join(shotsDir, "_probe.png");
    try {
      magick(["-pointsize", "18", "label:probe", probe]);
      labelsWork = true;
    } catch {
      labelsWork = false;
      console.warn("ImageMagick has no font available; the contact sheet will not be labelled.");
    }
    rmSync(probe, { force: true });
  }
  return labelsWork;
}

/**
 * Builds the sheet and returns its path, or null if there was nothing to pack
 * or ImageMagick is not installed. Throws if ImageMagick fails.
 *
 * Falls back to an unlabelled sheet where text cannot be rendered: the pictures
 * are the point, and they stay in filename order, left to right and top to
 * bottom.
 */
export function buildSheet() {
  if (!existsSync(shotsDir) || !haveImageMagick()) return null;
  const shots = readdirSync(shotsDir)
    .filter((f) => f.endsWith(".png") && f !== SHEET)
    .sort();
  if (shots.length === 0) return null;

  const temporaries = [];
  try {
    const label = canLabel();
    const cells = shots.map((file) => {
      const resized = join(shotsDir, `_fit-${file}`);
      const cell = join(shotsDir, `_cell-${file}`);
      temporaries.push(resized, cell);
      // Portrait and landscape shots come out of the run at different sizes, so
      // normalise on height and let the widths differ. The resize has to happen
      // before the label joins the list, or the label is scaled to 300px tall too.
      magick([
        join(shotsDir, file),
        "-resize",
        `x${CELL_HEIGHT}`,
        "-depth",
        "8",
        "-strip",
        resized,
      ]);
      magick([
        "-background",
        "white",
        ...(label
          ? ["-fill", "#333", "-pointsize", "18", `label:${file.replace(/\.png$/, "")}`]
          : []),
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
    return sheet;
  } finally {
    // Cleared even when a step failed, or the leftovers are picked up as
    // screenshots by the next run and uploaded as if they were evidence.
    for (const file of temporaries) rmSync(file, { force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!haveImageMagick()) {
    console.error(
      "Cannot find ImageMagick.\nInstall it first - on Debian or Ubuntu: sudo apt-get install imagemagick",
    );
    process.exit(1);
  }
  let sheet;
  try {
    sheet = buildSheet();
  } catch (error) {
    console.error(`ImageMagick failed: ${error.message.split("\n")[0]}`);
    process.exit(1);
  }
  if (!sheet) {
    console.error(`No screenshots in ${shotsDir}. Run npm run shot first.`);
    process.exit(1);
  }
  console.log(sheet);
}
