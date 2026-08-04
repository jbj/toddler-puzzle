/**
 * Before changing this file, read docs/layout.md.
 *
 * Pure geometry helpers.
 *
 * Everything the game reasons about happens in a "logical" coordinate space
 * which is then scaled to whatever screen we're on. That space is composed for
 * the screen rather than fixed - always 700 logical units across its shorter
 * side, and as long on the other as the screen's ratio asks for, so the board
 * fills the screen instead of letterboxing inside it (see `layout.ts`). Keeping
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
 * largest uniform scale that still fits the logical canvas in the container.
 * A canvas composed for this container has the container's ratio to within
 * rounding, so in play this is very nearly `container short side / 700` and
 * there is nothing left over to letterbox. */
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

/** Does `rect` cover `point`? Edges count, because a near miss should. */
export function covers(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Grow a rectangle by up to `padding` on every side, staying inside `bounds`
 * and staying centred where it was: each axis takes the smaller of the room it
 * has on either side, so a drawing that already reaches one edge of its box
 * gets no margin on that axis rather than a lopsided one.
 *
 * Centred is the load-bearing half. The centre of a piece's box is the point
 * the whole game aims at, so a margin that moved it would move the target.
 */
export function padWithin(rect: Rect, padding: number, bounds: Rect): Rect {
  const room = (low: number, high: number): number => Math.max(0, Math.min(padding, low, high));
  const across = room(rect.x - bounds.x, bounds.x + bounds.width - (rect.x + rect.width));
  const down = room(rect.y - bounds.y, bounds.y + bounds.height - (rect.y + rect.height));
  return {
    x: rect.x - across,
    y: rect.y - down,
    width: rect.width + 2 * across,
    height: rect.height + 2 * down,
  };
}

/**
 * Thicken a rectangle until its narrow side is at least `ratio` of its long
 * one, growing it about its own centre.
 *
 * This is what stops a long thin piece being punished twice. A sliver is hard
 * to aim *and*, measured by its narrow side, would be given the least room to
 * be aimed at; thickened, it asks for about as much accuracy as a square piece
 * of the same length does. Growing about the centre is load-bearing: the
 * centre of a piece's box has to stay the centre of what it draws, because
 * that is the point the whole game aims at and sparkles on.
 */
export function thickenTo(rect: Rect, ratio: number): Rect {
  const width = Math.max(rect.width, rect.height * ratio);
  const height = Math.max(rect.height, rect.width * ratio);
  return {
    x: rect.x - (width - rect.width) / 2,
    y: rect.y - (height - rect.height) / 2,
    width,
    height,
  };
}

/** `rect` grown about its own centre by `factor`, e.g. a level's forgiveness. */
export function growAboutCentre(rect: Rect, factor: number): Rect {
  return {
    x: rect.x - (rect.width * (factor - 1)) / 2,
    y: rect.y - (rect.height * (factor - 1)) / 2,
    width: rect.width * factor,
    height: rect.height * factor,
  };
}

/** `rect` moved so its own origin is measured from `at`. */
export function rectAt(at: Point, rect: Rect): Rect {
  return { x: at.x + rect.x, y: at.y + rect.y, width: rect.width, height: rect.height };
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
 * The same, for a piece whose box is smaller than the box it carries. `grip` is
 * the piece's own box - what it draws, thickened, in box units - so what is
 * held on canvas is the part a child reaches for rather than the empty space
 * around it. A slice cut from the corner of an animal would otherwise be
 * stopped a whole animal short of the edge it was being dragged to.
 *
 * Identical to `clampToCanvas` for a piece whose grip fills its box.
 */
export function clampGripToCanvas(topLeft: Point, grip: Rect, logical: Size): Point {
  // The `+ 0` is not a no-op: `-grip.x` is negative zero when the grip starts
  // at the box's own edge, and a negative zero would reach the transform string.
  return {
    x: Math.min(Math.max(topLeft.x, -grip.x), logical.width - grip.x - grip.width) + 0,
    y: Math.min(Math.max(topLeft.y, -grip.y), logical.height - grip.y - grip.height) + 0,
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
