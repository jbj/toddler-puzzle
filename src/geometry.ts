/**
 * Pure geometry helpers.
 *
 * Everything the game reasons about happens in a fixed "logical" coordinate
 * space (1000x700) which is then scaled to whatever screen we're on. Keeping
 * these functions pure and side-effect free means the fiddly bits - coordinate
 * mapping and snap detection - can be unit tested without a browser.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Point, Size {}

/** Scale factor used by SVG's `preserveAspectRatio="xMidYMid meet"`: the
 * largest uniform scale that still fits the logical canvas in the container. */
export function fitScale(container: Size, logical: Size): number {
  return Math.min(container.width / logical.width, container.height / logical.height);
}

/**
 * Convert a client/screen point into logical canvas coordinates, mirroring the
 * letterboxing that `xMidYMid meet` applies.
 */
export function screenToLogical(client: Point, containerRect: Rect, logical: Size): Point {
  const scale = fitScale(containerRect, logical);
  const offsetX = (containerRect.width - logical.width * scale) / 2;
  const offsetY = (containerRect.height - logical.height * scale) / 2;
  return {
    x: (client.x - containerRect.x - offsetX) / scale,
    y: (client.y - containerRect.y - offsetY) / scale,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** `size` scaled by `scale`, e.g. an authored box in logical units. */
export function scaleSize(size: Size, scale: number): Size {
  return { width: size.width * scale, height: size.height * scale };
}

/** `rect` scaled by `scale`, origin and all. */
export function scaleRect(rect: Rect, scale: number): Rect {
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** Centre of a box of `size` whose top-left corner is `topLeft`. */
export function boxCenter(topLeft: Point, size: Size): Point {
  return { x: topLeft.x + size.width / 2, y: topLeft.y + size.height / 2 };
}

/**
 * Deliberately forgiving hit test: a piece counts as "in" its hole if the two
 * centres are within `radius`, which is roughly two thirds of the piece - see
 * `pieceBox` in layout.ts for what that means for a piece that is not square.
 */
export function isWithinSnapRadius(a: Point, b: Point, radius: number): boolean {
  return distance(a, b) <= radius;
}

/**
 * Grow a measured rectangle by `padding` on every side, then keep it inside
 * `bounds`. Used for the area a piece can be grabbed by: the artwork is
 * measured, given a little margin, and held inside the piece's authored box.
 *
 * The clamp is the load-bearing half. A piece's authored box is exactly the
 * slot it was laid out in, and no two slots overlap, so a grab area that stays
 * inside the box cannot reach into a neighbour's and make a press ambiguous.
 */
export function padWithin(rect: Rect, padding: number, bounds: Size): Rect {
  const left = Math.max(rect.x - padding, 0);
  const top = Math.max(rect.y - padding, 0);
  const right = Math.min(rect.x + rect.width + padding, bounds.width);
  const bottom = Math.min(rect.y + rect.height + padding, bounds.height);
  return {
    x: left,
    y: top,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  };
}

/**
 * Keep a piece fully on the canvas so it can never be dragged out of reach.
 * Each axis is clamped against that piece's own extent: clamping a wide piece
 * as though it were as tall as it is wide would let it hang off the bottom and
 * lock it out of reach at the side.
 */
export function clampToCanvas(topLeft: Point, size: Size, logical: Size): Point {
  return {
    x: Math.min(Math.max(topLeft.x, 0), logical.width - size.width),
    y: Math.min(Math.max(topLeft.y, 0), logical.height - size.height),
  };
}

/**
 * The same, for a piece whose drawing is smaller than its box. `ink` is where
 * the drawing sits inside the box, so what is held on canvas is the part a
 * child can see and grab rather than the empty box around it. A slice cut from
 * the corner of an animal would otherwise be stopped a whole animal short of
 * the edge it was being dragged to.
 *
 * Identical to `clampToCanvas` for a piece that fills its box.
 */
export function clampInkToCanvas(topLeft: Point, ink: Rect, logical: Size): Point {
  // The `+ 0` is not a no-op: `-ink.x` is negative zero when the ink starts at
  // the box's own edge, and a negative zero would reach the transform string.
  return {
    x: Math.min(Math.max(topLeft.x, -ink.x), logical.width - ink.x - ink.width) + 0,
    y: Math.min(Math.max(topLeft.y, -ink.y), logical.height - ink.y - ink.height) + 0,
  };
}

/**
 * A deterministic stand-in for `Math.random` (mulberry32), so a run with a
 * given seed always deals the same animals in the same order. Used by the tests
 * and by `?seed=` in the browser; the game itself is random by default.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
