/**
 * Art contract check.
 *
 * Every animal SVG has to satisfy a few invariants that are easy to break by
 * hand and annoying to spot by eye. This checks them mechanically:
 *
 *   - the structure `src/assets.ts` expects, so a bad asset fails here rather
 *     than at startup in the browser;
 *   - the artwork fits inside the 240x240 box instead of being clipped by it;
 *   - every mark in `#detail` stays inside `#silhouette`, because that one path
 *     draws both the piece and its hole - anything poking out makes the piece
 *     overhang the hole it is supposed to fill;
 *   - `FOOT_LEVEL` in `src/layout.ts` matches where the animal's feet actually
 *     are, so it stands on the ground line instead of floating or sinking.
 *
 *   npm run art:check
 *
 * Needs rsvg-convert and ImageMagick, same as `npm run art`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const animalsDir = join(root, "src/assets/animals");
const scratch = join(root, ".art/check");

/** Must match ART_BOX in src/assets.ts. */
const ART_BOX = 240;
/** Render scale for measuring: 8 device pixels per art unit. */
const SAMPLE = ART_BOX * 8;
const PER_UNIT = SAMPLE / ART_BOX;

mkdirSync(scratch, { recursive: true });

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` - ${detail}`}`);
  if (!ok) failures++;
};

// --- rendering ------------------------------------------------------------

/** Render the SVG with extra CSS injected, and return an opaque-pixel mask. */
function mask(svg, css, name) {
  const openTagEnd = svg.indexOf(">", svg.indexOf("<svg"));
  if (openTagEnd === -1) throw new Error("no <svg> element found");
  const patched = `${svg.slice(0, openTagEnd + 1)}<style>${css}</style>${svg.slice(openTagEnd + 1)}`;
  const svgPath = join(scratch, `${name}.svg`);
  const pngPath = join(scratch, `${name}.png`);
  writeFileSync(svgPath, patched);
  execFileSync("rsvg-convert", ["-w", String(SAMPLE), "-h", String(SAMPLE), svgPath, "-o", pngPath]);
  // Anything at least half opaque counts as covered; this keeps antialiased
  // edges from reading as stray marks.
  execFileSync("magick", [pngPath, "-alpha", "extract", "-threshold", "50%", pngPath]);
  return pngPath;
}

const HIDE_DETAIL = "#detail{display:none}";
/**
 * Marks tagged `data-overhang` are deliberately allowed past the outline - the
 * giraffe's tail, for instance. They still overhang the hole slightly, which is
 * fine for a small appendage and wrong for anything larger, so it has to be
 * opted into per mark rather than tolerated everywhere.
 */
const HIDE_SILHOUETTE = "#silhouette{display:none}#detail [data-overhang]{display:none}";
/** The outline without its stroke - the shape the animal actually occupies. */
const FILL_ONLY = `${HIDE_DETAIL}#silhouette{stroke-width:0}`;

function opaquePixels(png) {
  const out = execFileSync("magick", [png, "-format", "%[fx:mean*w*h]", "info:"]).toString();
  return Math.round(Number(out));
}

/** Bounding box of a mask, in art units. */
function bounds(png) {
  const geometry = execFileSync("magick", [
    png, "-bordercolor", "black", "-border", "1", "-format", "%@", "info:",
  ]).toString();
  const [w, h, x, y] = geometry.match(/\d+/g).map(Number);
  // The border added for trimming shifts the origin by one pixel.
  return {
    left: (x - 1) / PER_UNIT,
    top: (y - 1) / PER_UNIT,
    right: (x - 2 + w) / PER_UNIT,
    bottom: (y - 2 + h) / PER_UNIT,
  };
}

// --- what the rest of the codebase says -----------------------------------

function registeredIds() {
  const source = readFileSync(join(root, "src/assets.ts"), "utf8");
  const list = source.match(/ANIMAL_IDS\s*=\s*\[([^\]]*)\]/);
  if (!list) throw new Error("could not find ANIMAL_IDS in src/assets.ts");
  return [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function declaredFootLevels() {
  const source = readFileSync(join(root, "src/layout.ts"), "utf8");
  const table = source.match(/FOOT_LEVEL[^=]*=\s*\{([^}]*)\}/);
  if (!table) throw new Error("could not find FOOT_LEVEL in src/layout.ts");
  const levels = {};
  for (const [, id, value] of table[1].matchAll(/(\w+)\s*:\s*([\d.]+)\s*\/\s*ART_BOX/g)) {
    levels[id] = Number(value);
  }
  return levels;
}

// --- checks ---------------------------------------------------------------

const files = readdirSync(animalsDir).filter((f) => f.endsWith(".svg")).sort();
if (files.length === 0) {
  console.error("No animal SVGs found in", animalsDir);
  process.exit(1);
}

const registered = registeredIds();
const footLevels = declaredFootLevels();

for (const file of files) {
  const id = basename(file, ".svg");
  const svg = readFileSync(join(animalsDir, file), "utf8");
  console.log(`\n${id}`);

  const viewBox = svg.match(/viewBox="([^"]*)"/)?.[1];
  check("uses the shared art box", viewBox === `0 0 ${ART_BOX} ${ART_BOX}`, `viewBox is "${viewBox}"`);

  const silhouetteTag = svg.match(/<path\b[^>]*\bid="silhouette"[^>]*>/)?.[0];
  const hasSilhouette = Boolean(silhouetteTag && /\bd="[^"]/.test(silhouetteTag));
  check("has a <path id=\"silhouette\"> with a d attribute", hasSilhouette);
  if (!hasSilhouette) continue;

  check("is registered in ANIMAL_IDS", registered.includes(id), "add it to src/assets.ts");

  // Drawn extent, stroke included: this is what gets clipped by the art box.
  const drawn = bounds(mask(svg, "", `${id}-drawn`));
  const clipped =
    drawn.left <= 0 || drawn.top <= 0 || drawn.right >= ART_BOX - 1 || drawn.bottom >= ART_BOX - 1;
  check(
    "fits inside the art box",
    !clipped,
    `extends to ${drawn.left.toFixed(1)}..${drawn.right.toFixed(1)} x ` +
      `${drawn.top.toFixed(1)}..${drawn.bottom.toFixed(1)}`,
  );

  // The piece and the hole are both drawn from #silhouette with the same
  // stroke, so a detail mark is safe exactly when it lands on that shape.
  // Masks are plain black/white by this point, so "outside" is an ordinary
  // multiply against the inverted silhouette rather than an alpha operation.
  const silhouette = mask(svg, HIDE_DETAIL, `${id}-silhouette`);
  const detail = mask(svg, HIDE_SILHOUETTE, `${id}-detail`);
  const outside = join(scratch, `${id}-outside.png`);
  execFileSync("magick", [silhouette, "-negate", outside]);
  const strayPng = join(scratch, `${id}-stray.png`);
  execFileSync("magick", [detail, outside, "-compose", "Multiply", "-composite", strayPng]);
  const stray = opaquePixels(strayPng);
  const exempt = (svg.match(/data-overhang/g) ?? []).length;
  check(
    `detail stays inside the silhouette${exempt ? ` (${exempt} mark(s) opted out)` : ""}`,
    stray === 0,
    `${stray} px outside - see ${strayPng.slice(root.length)}`,
  );

  // Feet are measured from the fill, ignoring the stroke that hangs below it.
  // Every animal is measured the same way, so they line up on the ground line.
  const measured = bounds(mask(svg, FILL_ONLY, `${id}-fill`)).bottom;
  const suggested = Math.round(measured);
  const declared = footLevels[id];
  if (declared === undefined) {
    check("has a FOOT_LEVEL", false, `add \`${id}: ${suggested} / ART_BOX\` to src/layout.ts`);
  } else {
    check(
      "FOOT_LEVEL matches the artwork",
      Math.abs(declared - measured) <= 0.5,
      `declared ${declared}, measured ${measured.toFixed(1)} - use ${suggested} / ART_BOX`,
    );
  }
}

const orphans = registered.filter((id) => !files.includes(`${id}.svg`));
console.log("");
check("every registered animal has artwork", orphans.length === 0, `missing: ${orphans.join(", ")}`);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll art checks passed.");
