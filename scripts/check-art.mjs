/**
 * Art contract check.
 *
 * Two kinds of artwork, checked for two different things.
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
 * Every picture scene has to satisfy one that cannot be seen in the file at
 * all: it gets cut into rectangles, and *every* rectangle has to have something
 * in it. That is measured rather than eyeballed, at every grid the level table
 * cuts a picture at.
 *
 *   npm run art:check
 *
 * Needs rsvg-convert and ImageMagick, same as `npm run art`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  gridName,
  gridsInLevels,
  MIN_FEATURE,
  percent as sharePercent,
  PICTURE_HEIGHT,
  PICTURE_WIDTH,
  rasterise,
  registeredPictures,
  sceneFiles,
  scenesDir,
  scenesInLevels,
  scoreGrid,
  shardWindow,
  shatterCountsInLevels,
  worstWindow,
} from "./pictures.mjs";
import {
  AREA_TOLERANCE,
  cellMasks,
  GRID,
  inkBounds,
  inkFits,
  intersect,
  isConnected,
  inscribedRadius,
  MIN_INSCRIBED,
  maskPixels,
  recipeFor,
} from "./slices.mjs";
import { magick, requireArtTools, rsvg } from "./tools.mjs";
import { createReport } from "./report.mjs";

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

const report = createReport("art check");
let currentFile = "scripts/check-art.mjs";
const check = (label, ok, detail) => {
  report.check(currentFile, label, ok ? [] : detail || label);
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
 * docs/decisions/Check silhouettes for distinctness at a glance.md.
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

/**
 * `ANIMAL_INK` as `src/assets.ts` declares it, keyed by animal: the tuples are
 * read rather than trusted, so an animal redrawn without re-running this is
 * caught here instead of by a child aiming at empty box.
 */
function declaredInks() {
  const source = readFileSync(join(root, "src/assets.ts"), "utf8");
  const table = source.match(/ANIMAL_INK[^=]*=\s*\{([^}]*)\}/);
  if (!table) throw new Error("could not find ANIMAL_INK in src/assets.ts");
  const inks = {};
  for (const [, id, values] of table[1].matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
    const [x, y, width, height] = values.split(",").map(Number);
    inks[id] = { left: x, top: y, right: x + width, bottom: y + height };
  }
  return inks;
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

// --- slice recipes --------------------------------------------------------

/** How many slices an animal has to have a recipe for; SLICE_COUNTS. */
const SLICE_COUNTS = [2, 3, 4];
const recipesPath = join(root, "src/slice-recipes.json");

function declaredRecipes() {
  try {
    return JSON.parse(readFileSync(recipesPath, "utf8"));
  } catch {
    return {};
  }
}

const sliceRecipes = declaredRecipes();

/** The entry a human should paste into src/slice-recipes.json, or a shrug. */
function suggestedRecipe(silhouette, drawn, count) {
  const found = recipeFor(silhouette, drawn, count);
  if (!found) return "no cut of this animal into that many slices passes - redraw it";
  const list = (rows) => rows.map((row) => `[${row.join(", ")}]`).join(", ");
  return `use { "cuts": [${list(found.cuts)}], "ink": [${list(found.ink)}] }`;
}

/**
 * Judge what the committed table says about one animal.
 *
 * Deliberately a check rather than a derivation. Searching for cuts takes a
 * couple of seconds an animal, so the table is generated once by
 * `npm run art:slices` and only re-judged here - and a recipe that no longer
 * matches its artwork fails with the replacement to paste in, which is the same
 * bargain `FOOT_LEVEL` strikes a few lines above.
 *
 * Every number that decides the verdict lives in `scripts/slices.mjs`, so the
 * search and the check can never drift apart into a table that generates but
 * does not pass.
 */
/**
 * How far `ANIMAL_INK` may sit outside the drawing it describes, in art units.
 *
 * The declared box is rounded outwards, so it is always a little larger than
 * what was measured; what this bounds is how much larger. Under half a unit
 * would fail on a rasteriser a version apart, and two units is a fifth of the
 * margin a hand is given around a piece, so a table that has drifted this far
 * is a table someone has to look at.
 */
const INK_SLACK = 2;

/**
 * The box `assets.ts` says an animal draws in against the one it actually
 * draws in. Declared too small and a piece cannot be grabbed by its own ear;
 * declared too large and a child places it by aiming at empty box, which is
 * what a whole animal did before it was measured at all.
 */
function checkInk(id, drawn) {
  const round = (box) => [
    Math.floor(box.left),
    Math.floor(box.top),
    Math.ceil(box.right) - Math.floor(box.left),
    Math.ceil(box.bottom) - Math.floor(box.top),
  ];
  const suggestion = `use \`${id}: [${round(drawn).join(", ")}],\``;
  const declared = inks[id];
  if (declared === undefined) {
    check("has an ANIMAL_INK", false, `add it to src/assets.ts: ${suggestion}`);
    return;
  }
  const outside = [
    drawn.left - declared.left,
    drawn.top - declared.top,
    declared.right - drawn.right,
    declared.bottom - drawn.bottom,
  ];
  const worst = Math.min(...outside);
  check(
    "ANIMAL_INK matches the artwork",
    worst >= 0 && Math.max(...outside) <= INK_SLACK,
    `declared [${round(declared).join(", ")}], measured ` +
      `[${drawn.left.toFixed(1)}, ${drawn.top.toFixed(1)}, ` +
      `${(drawn.right - drawn.left).toFixed(1)}, ${(drawn.bottom - drawn.top).toFixed(1)}] - ` +
      suggestion,
  );
}

function checkSliceRecipes(id, silhouettePng, drawnPng) {
  const silhouette = maskPixels(silhouettePng, scratch, `${id}-silhouette-mask`);
  const drawn = maskPixels(drawnPng, scratch, `${id}-drawn-mask`);
  const total = silhouette.reduce((sum, on) => sum + on, 0);
  const whole = new Uint8Array(GRID * GRID).fill(1);

  for (const count of SLICE_COUNTS) {
    const label = `cuts into ${count} whole, fair, grabbable slices`;
    const recipe = sliceRecipes[id]?.[String(count)];
    if (!recipe || recipe.cuts?.length !== count - 1 || recipe.ink?.length !== count) {
      check(label, false, suggestedRecipe(silhouette, drawn, count));
      continue;
    }

    const cells = cellMasks(silhouette, recipe.cuts);
    const boxes = cellMasks(whole, recipe.cuts);
    const faults = [];
    for (const [index, cell] of cells.entries()) {
      const area = cell.reduce((sum, on) => sum + on, 0) / total;
      const want = 1 / count;
      const radius = inscribedRadius(cell);
      const ink = inkBounds(intersect(drawn, boxes[index]));
      const declared = recipe.ink[index];
      if (!isConnected(cell)) faults.push(`slice ${index} is in more than one piece`);
      if (Math.abs(area - want) > want * AREA_TOLERANCE) {
        faults.push(`slice ${index} is ${(area * 100).toFixed(0)}% of the animal`);
      }
      if (radius < MIN_INSCRIBED) {
        faults.push(`slice ${index} is only ${radius.toFixed(1)} units fat`);
      }
      if (!inkFits(declared, ink)) {
        faults.push(`slice ${index} draws somewhere else than its declared ink`);
      }
    }
    check(
      label,
      faults.length === 0,
      faults.length === 0
        ? ""
        : `${faults.join("; ")}; ${suggestedRecipe(silhouette, drawn, count)}`,
    );
  }
}

// --- checks ---------------------------------------------------------------

const files = readdirSync(animalsDir)
  .filter((f) => f.endsWith(".svg"))
  .sort();
if (files.length === 0) {
  report.check("src/assets/animals", "contains animal SVGs", "none found");
  report.finish();
  process.exit(1);
}

const registered = registeredIds();
const footLevels = declaredFootLevels();
const inks = declaredInks();
const themes = declaredThemes();
/** Each animal's silhouette as a glance sees it, for the distinctness check. */
const glances = new Map();

for (const file of files) {
  const id = basename(file, ".svg");
  const svg = readFileSync(join(animalsDir, file), "utf8");
  currentFile = `src/assets/animals/${file}`;
  report.section(`\n${id}`);

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
  const drawnPng = mask(svg, "", `${id}-drawn`);
  const drawn = bounds(drawnPng);
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

  checkInk(id, drawn);

  checkSliceRecipes(id, silhouette, drawnPng);
}

// --- the picture scenes ---------------------------------------------------

/**
 * A scene is not judged on its structure, mostly - `src/pictures.ts` throws on
 * a scene it cannot safely inline, and `tests/pictures.test.ts` loads every one
 * of them, so the markup rules have a single home and are already in
 * `npm run verify`. What is judged here is the thing no amount of reading the
 * file can tell you: whether the picture survives being cut into rectangles.
 *
 * Every grid the level table uses is tried, not only the busiest one. A cell of
 * a 2x2 board is a quarter of the picture and contains its neighbours' content
 * too, so it is nearly free to pass; a scene that fails there has a quarter of
 * itself empty, which is worth knowing separately from a 4x3 piece being thin.
 */
/**
 * Where in the picture a patch is, said twice: in the art box's own
 * coordinates, which is what an author edits in, and in words, because a
 * scene's author thinks in "the sky, top left" rather than in numbers.
 *
 * The emptiest patch can be anywhere - it is usually a stretch of sky or of
 * water, and only sometimes a corner - so the message has to say which, or it
 * sends the person fixing it to the wrong part of their own drawing.
 */
function whereIs(patch, width, height) {
  const scale = PICTURE_WIDTH / width;
  const across = ["left", "middle", "right"][Math.min(2, Math.floor((3 * patch.left) / width))];
  const down = ["top", "middle", "bottom"][Math.min(2, Math.floor((3 * patch.top) / height))];
  const place = across === down ? across : `${down} ${across}`;
  const at = (value) => Math.round(value * scale);
  return (
    `${place} of the picture` +
    ` (${at(patch.right - patch.left)}x${at(patch.bottom - patch.top)}` +
    ` at ${at(patch.left)},${at(patch.top)} in the art box)`
  );
}

function checkScenes() {
  const scenes = sceneFiles();
  const registered = registeredPictures();
  const grids = gridsInLevels();
  const shatters = shatterCountsInLevels();

  if (scenes.length === 0) {
    currentFile = "src/assets/scenes";
    report.section("\nscenes");
    check("there are scenes to cut up", false, `nothing in ${scenesDir}`);
    return;
  }

  for (const scene of scenes) {
    const svg = readFileSync(scene.path, "utf8");
    currentFile = `src/assets/scenes/${basename(scene.path)}`;
    report.section(`\n${scene.id} (scene)`);

    const viewBox = svg.match(/viewBox="([^"]*)"/)?.[1];
    const wanted = `0 0 ${PICTURE_WIDTH} ${PICTURE_HEIGHT}`;
    check(
      "uses the picture box",
      viewBox === wanted,
      `viewBox is "${viewBox}", wanted "${wanted}"`,
    );

    check(
      'wraps its drawing in <g id="scene">',
      /<g\s+id="scene"\s*>/.test(svg),
      "everything the picture draws goes inside that one group",
    );

    check(
      "is registered in PICTURE_IDS",
      registered.includes(scene.id),
      "add it to src/pictures.ts",
    );

    const raster = rasterise(scene.path, scratch, `scene-${scene.id}`);
    check(
      "paints its whole box",
      raster.opacity === 1,
      "a gap in the picture becomes a piece with a hole in it - " +
        "give the scene a background that covers the box",
    );

    for (const grid of grids) {
      const cells = scoreGrid(raster.pixels, raster.width, raster.height, grid);
      const empty = cells.filter((cell) => cell.feature < MIN_FEATURE);
      const thinnest = cells.reduce((worst, cell) => (cell.feature < worst.feature ? cell : worst));
      const named = empty
        .slice(0, 3)
        .map(
          (cell) =>
            `column ${cell.column + 1}, row ${cell.row + 1} is only ` +
            `${sharePercent(cell.feature)} something`,
        );
      if (empty.length > named.length) named.push(`and ${empty.length - named.length} more`);
      check(
        `every piece has something in it at ${gridName(grid)}` +
          ` (thinnest ${sharePercent(thinnest.feature)}` +
          ` at column ${thinnest.column + 1}, row ${thinnest.row + 1})`,
        empty.length === 0,
        `a piece needs ${sharePercent(MIN_FEATURE)}: ${named.join("; ")}` +
          ` - run \`npm run art -- ${scene.id}\` and look at the ${gridName(grid)} grid`,
      );
    }

    // And the same promise for the kind with no grid to score. A shatter's
    // shards are dealt fresh, so what is checked is the picture rather than a
    // partition: nowhere in it is there a patch the size of the smallest shard
    // allowed with nothing in it. See docs/decisions/Cut a picture into shards
    // that are things to hold.md.
    for (const count of shatters) {
      const side = shardWindow(count);
      const worst = worstWindow(raster.pixels, raster.width, raster.height, side);
      check(
        `nowhere is empty at the size of a shard of ${count}` +
          ` (emptiest ${sharePercent(worst.feature)})`,
        worst.feature >= MIN_FEATURE,
        `a shard needs ${sharePercent(MIN_FEATURE)}: the emptiest patch is ` +
          `${sharePercent(worst.feature)} something, in the ` +
          `${whereIs(worst, raster.width, raster.height)}` +
          ` - run \`npm run art -- ${scene.id}\` and put something there`,
      );
    }
  }

  report.detail("");
  currentFile = "src/pictures.ts";
  const ids = scenes.map((scene) => scene.id);
  const undrawn = registered.filter((id) => !ids.includes(id));
  check(
    "every registered scene has artwork",
    undrawn.length === 0,
    `missing: ${undrawn.join(", ")}`,
  );

  // The level table is allowed to run ahead of the code, but not ahead of the
  // art: a level naming a scene nobody drew is a level that cannot be played.
  const unknown = scenesInLevels().filter((id) => !ids.includes(id));
  check(
    "every scene the level table names has artwork",
    unknown.length === 0,
    `levels ask for: ${unknown.join(", ")}`,
  );
}

checkScenes();

const orphans = registered.filter((id) => !files.includes(`${id}.svg`));
report.detail("");
currentFile = "src/assets.ts";
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
  report.section(`\n${theme} (${cast.length}: ${cast.join(", ")})`);
  const tooAlike = scored.filter((pair) => pair.score > SIMILARITY_LIMIT);
  for (const { a, b, score } of tooAlike) {
    currentFile = `src/assets/animals/${a}.svg, src/assets/animals/${b}.svg`;
    check(
      `${a} and ${b} read differently`,
      false,
      `silhouettes are ${percent(score)} alike at ${GLANCE}px, over the ` +
        `${percent(SIMILARITY_LIMIT)} limit - redraw one of them, or move it to another theme`,
    );
  }
  const closest = scored[0];
  if (tooAlike.length === 0) {
    currentFile = "src/assets.ts";
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

report.finish("\nAll art checks passed.");
