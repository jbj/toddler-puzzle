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
 *     are, so it stands on the ground line instead of floating or sinking;
 *   - no two animals a themed level could deal together read the same at a
 *     glance, because a toddler matches the outline before the detail and a
 *     cast this size is past being judged by eye.
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
 * The size two silhouettes are compared at: a coarse square, far smaller than
 * a tray piece is drawn. A two-year-old matches the outline before the detail
 * and does it at a glance, so the comparison is deliberately made at a size
 * where only the gross shape survives - a tail, an ear tip or a notch is gone
 * by 48 pixels, and what is left is what a glance had to go on.
 */
const GLANCE = 48;

/**
 * How alike two silhouettes in one theme may look. Above this the pair is
 * judged too close to deal together.
 *
 * Tuned against the cast the game shipped with, whose ten animals a human had
 * already judged distinct: the closest pair of those ten is the frog and the
 * penguin at 68%, so 70% is the first score no accepted pair reaches. The
 * measure, why it is scoped to a theme, and how to react to a failure are in
 * [decision 20260729T004500](../docs/decisions/20260729T004500-silhouettes-checked-at-a-glance.md).
 */
const SIMILARITY_LIMIT = 0.7;

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

function declaredThemes() {
  const source = readFileSync(join(root, "src/assets.ts"), "utf8");
  const table = source.match(/ANIMAL_THEMES[^=]*=\s*\{([^}]*)\}/);
  if (!table) throw new Error("could not find ANIMAL_THEMES in src/assets.ts");
  const themes = {};
  for (const [, id, list] of table[1].matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
    themes[id] = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }
  return themes;
}

// --- distinctness ---------------------------------------------------------

/** The silhouette as a glance sees it: square, coarse, and black and white. */
function glance(id, silhouettePng) {
  const png = join(scratch, `${id}-glance.png`);
  magick([silhouettePng, "-resize", `${GLANCE}x${GLANCE}!`, "-threshold", "50%", png]);
  return png;
}

/**
 * How alike two silhouettes are, from 0 (nothing in common) to 1 (identical):
 * the shared area over the area either one covers.
 *
 * They are compared where the game puts them - both animals are authored in
 * the same 240x240 box, every piece of a level is drawn at one scale, and a
 * tray slot holds that box - so no alignment or rescaling is done here. Two
 * animals overlap in this measure exactly as much as they overlap in the tray.
 */
function similarity(a, b, name) {
  const shared = join(scratch, `${name}-shared.png`);
  const either = join(scratch, `${name}-either.png`);
  magick([a, b, "-compose", "Multiply", "-composite", shared]);
  magick([a, b, "-compose", "Lighten", "-composite", either]);
  const union = opaquePixels(either);
  return union === 0 ? 0 : opaquePixels(shared) / union;
}

/** A similarity, as the whole percent a human can act on. */
const percent = (share) => `${(share * 100).toFixed(0)}%`;

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
const themes = declaredThemes();
/** Each animal's silhouette as a glance sees it, for the distinctness check. */
const glances = new Map();

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
  check(
    "belongs to at least one theme",
    (themes[id] ?? []).length > 0,
    "add it to ANIMAL_THEMES in src/assets.ts",
  );

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
  glances.set(id, glance(id, silhouette));
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

// Two animals a level can deal together have to be told apart at a glance. The
// pairs that matter are the ones inside one theme, because that is what a
// themed level deals from; two animals in different themes never share a board.
const themeNames = [...new Set(Object.values(themes).flat())].sort();
for (const theme of themeNames) {
  const cast = [...glances.keys()].filter((id) => (themes[id] ?? []).includes(theme)).sort();
  const scored = [];
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      const [a, b] = [cast[i], cast[j]];
      scored.push({ a, b, score: similarity(glances.get(a), glances.get(b), `${a}-${b}`) });
    }
  }
  scored.sort((one, other) => other.score - one.score);
  console.log(`\n${theme} (${cast.length}: ${cast.join(", ")})`);
  const tooAlike = scored.filter((pair) => pair.score > SIMILARITY_LIMIT);
  for (const { a, b, score } of tooAlike) {
    check(
      `${a} and ${b} read differently`,
      false,
      `silhouettes are ${percent(score)} alike at ${GLANCE}px, over the ` +
        `${percent(SIMILARITY_LIMIT)} limit - redraw one of them, or move it to another theme`,
    );
  }
  const closest = scored[0];
  if (tooAlike.length === 0) {
    check(
      closest
        ? `every pair reads differently (closest: ${closest.a}/${closest.b} at ` +
            `${percent(closest.score)})`
        : "reads differently (nothing to compare it with yet)",
      true,
    );
  }
}

if (process.env.ART_SIMILARITY_REPORT) {
  const ids = [...glances.keys()].sort();
  const all = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      all.push({
        pair: `${ids[i]}/${ids[j]}`,
        score: similarity(glances.get(ids[i]), glances.get(ids[j]), `${ids[i]}-${ids[j]}`),
      });
    }
  }
  all.sort((one, other) => other.score - one.score);
  console.log("\nevery pair, most alike first");
  for (const { pair, score } of all) console.log(`  ${percent(score).padStart(4)}  ${pair}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll art checks passed.");
