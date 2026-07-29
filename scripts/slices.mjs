/**
 * Where to cut an animal, measured from its pixels.
 *
 * A slice has to be three things at once, and none of them can be read off the
 * path data:
 *
 *   - **whole**: one connected piece. A cut that strands an ear or a foot as a
 *     second island is not a slice, it is two slices in one, and the child
 *     would be holding a piece with a gap in it;
 *   - **fair**: roughly the same size as its siblings, so a puzzle is not one
 *     big piece and three crumbs;
 *   - **grabbable**: fat somewhere, not a sliver. Measured as the largest
 *     circle that fits inside the slice, which is the closest thing to "could
 *     a two-year-old get hold of this" that a machine can measure.
 *
 * All three are questions about the rendered animal, so this works in pixels:
 * rasterise the silhouette, split it with straight lines, and score the halves.
 * Search here, judge here, and let `check-art.mjs` re-judge what was committed.
 *
 * Shared by `slice-recipes.mjs` (which searches and writes the table) and
 * `check-art.mjs` (which only judges what the table already says).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { format } from "prettier";

import { magick } from "./tools.mjs";

/**
 * The grid everything is measured on. One pixel per art unit: fine enough that
 * a cut is placed to within a unit, coarse enough that a search over thirty-six
 * angles is a second's work rather than a minute's.
 */
export const GRID = 240;

/** Candidate cut angles, in degrees. Five degrees apart, over a half turn. */
const ANGLE_STEP = 5;

/**
 * How far a cut is allowed to slide off the line that would split the area
 * exactly, in art units, and in what steps. Fairness is worth trading a little
 * of: sliding a cut a few units is often the difference between severing a leg
 * and going round it.
 */
const SLIDE = 12;
const SLIDE_STEP = 2;

/**
 * How far a slice's share of the animal may be from its fair share, as a
 * fraction of that fair share. A quarter of a duck may be a fifth or a third of
 * one; it may not be a tenth.
 *
 * Applied as an *absolute* slack of `AREA_TOLERANCE / count`, at every cut
 * rather than only at the leaves. A tolerance measured against each cut's own
 * parent would compound - a 60/40 first cut, halved twice, is a 30/30/20/20
 * puzzle every step of which was within tolerance of the step before - and the
 * child is holding the leaves, not the steps.
 */
export const AREA_TOLERANCE = 0.35;

/**
 * The smallest circle that has to fit inside a slice, in art units, out of 240.
 * A slice is drawn at up to 210 logical units for the whole animal, so 15 art
 * units of radius is around 26 logical units across at the tightest - about a
 * fingertip, and the point below which a slice stops being a thing and starts
 * being a splinter.
 */
export const MIN_INSCRIBED = 15;

/**
 * How far a slice's declared ink is pushed out past the pixels it was measured
 * from, in art units, and how far the checker will then let it sit from the
 * pixels it re-measures.
 *
 * Two rasterisers do not agree to the pixel. The mask is a 1920-pixel render
 * averaged down to 240 and then thresholded, so an edge whose eight-by-eight
 * block lands near half covered flips a whole art unit on a different
 * resampling filter - measured at up to two units on this animal set, and CI's
 * older librsvg and ImageMagick found exactly those two units on three recipes
 * that were exact here.
 *
 * So the box is not measured exactly, it is measured and then pushed out by
 * more than that disagreement, and the checker asks the two questions that
 * actually matter separately:
 *
 *   - does the declared box *contain* everything the slice draws? This is the
 *     one that matters to a child: the grab box is the declared box, and a
 *     drawing outside it is a piece of the animal that cannot be picked up. A
 *     pad makes it true on any rasteriser rather than on a lucky one;
 *   - is it still honestly a *slice's* box? Within `INK_SLACK` of the pixels,
 *     so it cannot quietly become the whole animal's box - which is what the
 *     check exists to catch, and which is wrong by fifty units, not by eight.
 *
 * The pad is twice the disagreement that was actually measured, and the slack
 * is twice the pad, so both halves have as much room again as the worst case
 * observed. Four units out of two hundred and forty is under two percent of the
 * animal, and it is spent on the forgiving side: a grab box a whisker larger
 * than the drawing is exactly the error this game prefers to make.
 */
export const INK_PAD = 4;
export const INK_SLACK = 8;

/** Push a measured box out by `INK_PAD`, without leaving the art box. */
export function padInk(rect) {
  const left = Math.max(0, rect.x - INK_PAD);
  const top = Math.max(0, rect.y - INK_PAD);
  const right = Math.min(GRID, rect.x + rect.width + INK_PAD);
  const bottom = Math.min(GRID, rect.y + rect.height + INK_PAD);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Whether a declared box covers `ink` and is no more than `INK_SLACK` bigger
 * than it on any edge. Both halves have to hold; see `INK_PAD`.
 */
export function inkFits(declared, ink) {
  if (ink === null) return false;
  const [x, y, width, height] = declared;
  const slack = (a, b) => a - b >= 0 && a - b <= INK_SLACK;
  return (
    slack(ink.x, x) &&
    slack(ink.y, y) &&
    slack(x + width, ink.x + ink.width) &&
    slack(y + height, ink.y + ink.height)
  );
}

/** A 0/1 mask of the rendered PNG, downsampled to the measuring grid. */
export function maskPixels(png, scratch, name) {
  const raw = join(scratch, `${name}.gray`);
  magick([png, "-resize", `${GRID}x${GRID}!`, "-threshold", "50%", "-depth", "8", `GRAY:${raw}`]);
  const bytes = readFileSync(raw);
  if (bytes.length !== GRID * GRID) {
    throw new Error(`Expected ${GRID * GRID} pixels from ${png}, got ${bytes.length}.`);
  }
  const mask = new Uint8Array(GRID * GRID);
  for (let index = 0; index < mask.length; index++) mask[index] = bytes[index] > 127 ? 1 : 0;
  return mask;
}

const areaOf = (mask) => {
  let count = 0;
  for (const on of mask) count += on;
  return count;
};

/**
 * Split a mask by a line, the same way `cellsFrom` in `src/slices.ts` splits a
 * polygon by it: `x·cos + y·sin <= at` is the near half. Pixels are sampled at
 * their centres.
 */
function splitBy(mask, angle, at) {
  const radians = (angle * Math.PI) / 180;
  const nx = Math.cos(radians);
  const ny = Math.sin(radians);
  const near = new Uint8Array(mask.length);
  const far = new Uint8Array(mask.length);
  for (let y = 0; y < GRID; y++) {
    const row = y * GRID;
    const along = ny * (y + 0.5);
    for (let x = 0; x < GRID; x++) {
      if (!mask[row + x]) continue;
      if (nx * (x + 0.5) + along <= at) near[row + x] = 1;
      else far[row + x] = 1;
    }
  }
  return [near, far];
}

/**
 * The cells of a recipe, as masks: the same replay `cellsFrom` does, in pixels.
 * A cut replaces its cell with the near half and appends the far half, so the
 * indices a later cut names mean the same thing here as they do at runtime.
 */
export function cellMasks(mask, cuts) {
  const cells = [mask];
  for (const [cell, angle, at] of cuts) {
    if (!cells[cell]) throw new Error(`Recipe cuts cell ${cell}, which does not exist yet.`);
    const [near, far] = splitBy(cells[cell], angle, at);
    cells[cell] = near;
    cells.push(far);
  }
  return cells;
}

/** Is every set pixel reachable from every other, moving up, down or across? */
export function isConnected(mask) {
  const start = mask.indexOf(1);
  if (start === -1) return false;
  const seen = new Uint8Array(mask.length);
  const stack = [start];
  seen[start] = 1;
  let reached = 0;
  while (stack.length > 0) {
    const index = stack.pop();
    reached++;
    const x = index % GRID;
    const y = (index - x) / GRID;
    if (x > 0 && mask[index - 1] && !seen[index - 1])
      ((seen[index - 1] = 1), stack.push(index - 1));
    if (x < GRID - 1 && mask[index + 1] && !seen[index + 1])
      ((seen[index + 1] = 1), stack.push(index + 1));
    if (y > 0 && mask[index - GRID] && !seen[index - GRID])
      ((seen[index - GRID] = 1), stack.push(index - GRID));
    if (y < GRID - 1 && mask[index + GRID] && !seen[index + GRID])
      ((seen[index + GRID] = 1), stack.push(index + GRID));
  }
  return reached === areaOf(mask);
}

/**
 * The radius of the largest circle that fits inside the mask, in art units.
 *
 * A two-pass chamfer distance transform with the usual 3-4 weights: near enough
 * to a Euclidean distance for a threshold, and a fraction of the cost. Anything
 * off the mask, including anything off the grid, counts as outside.
 */
export function inscribedRadius(mask) {
  const far = GRID * 8;
  const distance = new Int32Array(mask.length);
  for (let index = 0; index < mask.length; index++) distance[index] = mask[index] ? far : 0;

  const at = (x, y) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? 0 : distance[y * GRID + x]);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const index = y * GRID + x;
      if (distance[index] === 0) continue;
      distance[index] = Math.min(
        distance[index],
        at(x - 1, y) + 3,
        at(x, y - 1) + 3,
        at(x - 1, y - 1) + 4,
        at(x + 1, y - 1) + 4,
      );
    }
  }
  let best = 0;
  for (let y = GRID - 1; y >= 0; y--) {
    for (let x = GRID - 1; x >= 0; x--) {
      const index = y * GRID + x;
      if (distance[index] === 0) continue;
      distance[index] = Math.min(
        distance[index],
        at(x + 1, y) + 3,
        at(x, y + 1) + 3,
        at(x + 1, y + 1) + 4,
        at(x - 1, y + 1) + 4,
      );
      if (distance[index] > best) best = distance[index];
    }
  }
  return best / 3;
}

/** The bounding box of a mask, in art units, or null if nothing is set. */
export function inkBounds(mask) {
  let left = GRID;
  let top = GRID;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < GRID; y++) {
    const row = y * GRID;
    for (let x = 0; x < GRID; x++) {
      if (!mask[row + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Every pixel of `whole` that falls inside `cell`. */
export function intersect(whole, cell) {
  const both = new Uint8Array(whole.length);
  for (let index = 0; index < whole.length; index++) both[index] = whole[index] & cell[index];
  return both;
}

/**
 * Judge one slice. Returns the numbers rather than a verdict, so the generator
 * can rank candidates on them and the checker can report them.
 */
export function judge(cell, share, total) {
  return {
    area: areaOf(cell) / total,
    want: share,
    connected: isConnected(cell),
    radius: inscribedRadius(cell),
  };
}

/** Is this slice acceptable on its own terms? `slack` is in area shares. */
export const isSliceGood = ({ area, want, connected, radius }, slack) =>
  connected && radius >= MIN_INSCRIBED && Math.abs(area - want) <= slack;

/**
 * Where to cut one mask so that `low` parts go one way and `high` the other.
 *
 * The line's direction is searched over a half turn; its offset starts where it
 * would divide the area in exactly that ratio and slides either way from there.
 * A candidate that strands anything is rejected outright, however fair it is,
 * and what is left is ranked by the fattest thin slice it produces - the piece
 * hardest to pick up is the one that decides whether a cut is any good.
 */
export function findCut(mask, low, high, total, count) {
  const wanted = low / (low + high);
  const points = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (mask[y * GRID + x]) points.push([x + 0.5, y + 0.5]);
    }
  }
  if (points.length === 0) return null;

  let best = null;
  for (let angle = 0; angle < 180; angle += ANGLE_STEP) {
    const radians = (angle * Math.PI) / 180;
    const nx = Math.cos(radians);
    const ny = Math.sin(radians);
    const projected = Float64Array.from(points, ([x, y]) => nx * x + ny * y).sort();
    const middle = projected[Math.min(projected.length - 1, Math.floor(wanted * projected.length))];

    for (let slide = -SLIDE; slide <= SLIDE; slide += SLIDE_STEP) {
      const at = Math.round((middle + slide) * 100) / 100;
      const [near, far] = splitBy(mask, angle, at);
      // Shares are of the whole animal, and so is the slack, so a cut that
      // drifted is pulled back by the next one rather than being built on.
      const slack = AREA_TOLERANCE / count;
      const scores = [judge(near, low / count, total), judge(far, high / count, total)];
      if (!scores.every((score) => isSliceGood(score, slack))) continue;
      const worst = Math.min(scores[0].radius, scores[1].radius);
      const unfair = Math.max(
        Math.abs(scores[0].area - scores[0].want),
        Math.abs(scores[1].area - scores[1].want),
      );
      const better =
        best === null ||
        worst > best.worst + 0.01 ||
        (worst > best.worst - 0.01 && unfair < best.unfair);
      if (better) best = { angle, at, near, far, worst, unfair };
    }
  }
  return best;
}

/**
 * Cut a mask into `count` slices, and return the cuts and the resulting cells.
 *
 * The tree is balanced rather than a chain - four slices are two halves each
 * halved, not one slice peeled off three times - because a balanced tree cuts
 * an animal the way a person would, across the middle and then across again,
 * and a chain drifts: every cut after the first works on what the last one left
 * over, and the last slice ends up an offcut.
 */
export function cutInto(mask, count, total) {
  const cells = [mask];
  const shares = [count];
  const cuts = [];

  const plan = (index) => {
    const share = shares[index];
    if (share === 1) return true;
    const low = Math.ceil(share / 2);
    const high = share - low;
    const found = findCut(cells[index], low, high, total, count);
    if (!found) return false;
    cuts.push([found.angle, found.at, index]);
    cells[index] = found.near;
    shares[index] = low;
    const far = cells.length;
    cells.push(found.far);
    shares.push(high);
    return plan(index) && plan(far);
  };

  if (!plan(0)) return null;
  // Stored as `[cell, angle, at]`, which is the order `Cut` reads in.
  return { cuts: cuts.map(([angle, at, cell]) => [cell, angle, at]), cells };
}

/** Round a rect's numbers, for a table a human has to read. */
const asTuple = (rect) => [rect.x, rect.y, rect.width, rect.height];

/**
 * Everything the committed table says about one animal cut one way, measured
 * from the two masks: the silhouette decides the cuts, the drawing decides the
 * ink, because a tail declared as an overhang is still something the child sees
 * and grabs.
 */
export function recipeFor(silhouette, drawn, count) {
  const total = areaOf(silhouette);
  const cut = cutInto(silhouette, count, total);
  if (!cut) return null;
  const boxes = cellMasks(new Uint8Array(GRID * GRID).fill(1), cut.cuts);
  const ink = boxes.map((cell) => inkBounds(intersect(drawn, cell)));
  if (ink.some((box) => box === null)) return null;
  return { cuts: cut.cuts, ink: ink.map((box) => asTuple(padInk(box))) };
}

/**
 * Write the table, formatted the way the repository formats everything else -
 * `npm run verify` checks the formatting of what is committed, and a generated
 * file is committed like any other.
 */
export async function writeTable(path, table) {
  const source = JSON.stringify(table, null, 2);
  writeFileSync(path, await format(source, { filepath: path }));
}
