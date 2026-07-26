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

/** Centre of a square box whose top-left corner is `topLeft`. */
export function boxCenter(topLeft: Point, size: number): Point {
  return { x: topLeft.x + size / 2, y: topLeft.y + size / 2 };
}

/**
 * Deliberately forgiving hit test: a piece counts as "in" its hole if the two
 * centres are within `radius`, which is roughly two thirds of a piece width.
 */
export function isWithinSnapRadius(a: Point, b: Point, radius: number): boolean {
  return distance(a, b) <= radius;
}

/**
 * Keep a piece fully on the canvas so it can never be dragged out of reach.
 */
export function clampToCanvas(topLeft: Point, size: number, logical: Size): Point {
  return {
    x: Math.min(Math.max(topLeft.x, 0), logical.width - size),
    y: Math.min(Math.max(topLeft.y, 0), logical.height - size),
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
