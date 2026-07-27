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
 *   - `FOOT_LEVEL` in `src/assets.ts` matches where the animal's feet actually
 *     are, so it stands on the ground line instead of floating or sinking.
 *
 *   npm run art:check
 *
 * Needs rsvg-convert and ImageMagick, same as `npm run art`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { magick, requireArtTools, rsvg } from "./tools.mjs";

requireArtTools();

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
  rsvg(["-w", String(SAMPLE), "-h", String(SAMPLE), svgPath, "-o", pngPath]);
  // Anything at least half opaque counts as covered; this keeps antialiased
  // edges from reading as stray marks.
  magick([pngPath, "-alpha", "extract", "-threshold", "50%", pngPath]);
  return pngPath;
}

const HIDE_DETAIL = "#detail{display:none}";
/** Only the marks that have not been declared as deliberate overhangs. */
const DETAIL_UNTAGGED = "#silhouette{display:none}#detail [data-overhang]{display:none}";
/** Every mark, including the deliberate overhangs. */
const DETAIL_ALL = "#silhouette{display:none}";
/** The outline without its stroke - the shape the animal actually occupies. */
const FILL_ONLY = `${HIDE_DETAIL}#silhouette{stroke-width:0}`;

/**
 * How much of an animal may hang past its outline, as a share of the animal's
 * own area. A little is good - a tail or an ear reads better loose than tucked
 * in - but every bit of it overhangs the hole the piece drops into, so it stays
 * small enough to look like styling rather than a misfit.
 */
const OVERHANG_BUDGET = 0.03;

function opaquePixels(png) {
  const out = magick([png, "-format", "%[fx:mean*w*h]", "info:"]).toString();
  return Math.round(Number(out));
}

/** Bounding box of a mask, in art units. */
function bounds(png) {
  const geometry = magick([
    png,
    "-bordercolor",
    "black",
    "-border",
    "1",
    "-format",
    "%@",
    "info:",
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
  const source = readFileSync(join(root, "src/assets.ts"), "utf8");
  const table = source.match(/FOOT_LEVEL[^=]*=\s*\{([^}]*)\}/);
  if (!table) throw new Error("could not find FOOT_LEVEL in src/assets.ts");
  const levels = {};
  for (const [, id, value] of table[1].matchAll(/(\w+)\s*:\s*([\d.]+)/g)) {
    levels[id] = Number(value);
  }
  return levels;
}

// --- checks ---------------------------------------------------------------

const files = readdirSync(animalsDir)
  .filter((f) => f.endsWith(".svg"))
  .sort();
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
  check(
    "uses the shared art box",
    viewBox === `0 0 ${ART_BOX} ${ART_BOX}`,
    `viewBox is "${viewBox}"`,
  );

  const silhouetteTag = svg.match(/<path\b[^>]*\bid="silhouette"[^>]*>/)?.[0];
  const hasSilhouette = Boolean(silhouetteTag && /\bd="[^"]/.test(silhouetteTag));
  check('has a <path id="silhouette"> with a d attribute', hasSilhouette);
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

  // The piece and the hole are both drawn from #silhouette, so anything outside
  // that shape hangs over the edge of the hole. A tagged mark is allowed to;
  // an untagged one is a mistake, because nobody chose it.
  // Masks are plain black/white by this point, so "outside" is an ordinary
  // multiply against the inverted silhouette rather than an alpha operation.
  const silhouette = mask(svg, HIDE_DETAIL, `${id}-silhouette`);
  const outside = join(scratch, `${id}-outside.png`);
  magick([silhouette, "-negate", outside]);

  const strayOf = (css, name) => {
    const png = join(scratch, `${id}-${name}.png`);
    magick([
      mask(svg, css, `${id}-${name}-marks`),
      outside,
      "-compose",
      "Multiply",
      "-composite",
      png,
    ]);
    return { pixels: opaquePixels(png), png };
  };

  const accidental = strayOf(DETAIL_UNTAGGED, "stray");
  check(
    "anything outside the silhouette is a deliberate overhang",
    accidental.pixels === 0,
    `${accidental.pixels} px of untagged detail outside - see ${accidental.png.slice(root.length)}` +
      "; tag it data-overhang if you meant it",
  );

  const overhang = strayOf(DETAIL_ALL, "overhang").pixels / opaquePixels(silhouette);
  const share = `${(overhang * 100).toFixed(1)}%`;
  check(
    `overhang stays within budget${overhang > 0 ? ` (${share} of the animal)` : ""}`,
    overhang <= OVERHANG_BUDGET,
    `budget is ${(OVERHANG_BUDGET * 100).toFixed(0)}% of the animal's area`,
  );

  // Feet are measured from the fill, ignoring the stroke that hangs below it.
  // Every animal is measured the same way, so they line up on the ground line.
  const measured = bounds(mask(svg, FILL_ONLY, `${id}-fill`)).bottom;
  const suggested = Math.round(measured);
  const declared = footLevels[id];
  if (declared === undefined) {
    check("has a FOOT_LEVEL", false, `add \`${id}: ${suggested}\` to src/assets.ts`);
  } else {
    check(
      "FOOT_LEVEL matches the artwork",
      Math.abs(declared - measured) <= 0.5,
      `declared ${declared}, measured ${measured.toFixed(1)} - use ${suggested}`,
    );
  }
}

const orphans = registered.filter((id) => !files.includes(`${id}.svg`));
console.log("");
check(
  "every registered animal has artwork",
  orphans.length === 0,
  `missing: ${orphans.join(", ")}`,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll art checks passed.");
