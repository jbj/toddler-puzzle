/**
 * The measure that decides whether a picture may be cut up.
 *
 * "Every piece needs something in it" is the one rule of the scene contract
 * that cannot be read off the file, so it is measured from the pixels - and a
 * measure nobody checks is a measure that quietly starts passing everything.
 * This holds it to pictures whose answer is known by construction: a flat
 * wash, a piece that is half one thing and half another, a wash with a speck
 * in it, and two shades of the same colour, which is the case a variance would
 * get wrong and this one is built to reject.
 *
 * Plain Node rather than TypeScript, because the thing under test is a check
 * script: it takes a raw pixel buffer and gives back numbers, and typing that
 * buffer at the boundary would only mean maintaining a declaration of it.
 */
import { describe, expect, it } from "vitest";

import {
  cellFeature,
  cellsOf,
  DISTINCT,
  MIN_FEATURE,
  scoreGrid,
  SHARD_AREA_SHARE,
  shardWindow,
  worstWindow,
} from "../scripts/pictures.mjs";
import { MIN_AREA_SHARE } from "../src/shatter";

const WIDTH = 40;
const HEIGHT = 30;

/** A picture, painted by asking a function what colour each pixel is. */
function paint(colourAt, width = WIDTH, height = HEIGHT) {
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colourAt(x, y);
      const at = (y * width + x) * 3;
      pixels[at] = r;
      pixels[at + 1] = g;
      pixels[at + 2] = b;
    }
  }
  return pixels;
}

const whole = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };
const featureOf = (pixels, cell = whole) => cellFeature(pixels, WIDTH, HEIGHT, cell).feature;

describe("how much of a piece is something", () => {
  it("finds nothing in a flat wash", () => {
    expect(featureOf(paint(() => [190, 230, 255]))).toBe(0);
  });

  it("finds half of a piece that is half one thing and half another", () => {
    const pixels = paint((x) => (x < WIDTH / 2 ? [190, 230, 255] : [40, 120, 60]));
    expect(featureOf(pixels)).toBeCloseTo(0.5, 2);
  });

  it("finds a speck, and calls it a speck", () => {
    // A tenth of the piece, which is exactly what the floor is set at: a piece
    // with less than this in it is a wash, whatever is floating in the corner.
    const speck = (x) => x < WIDTH / 10;
    expect(featureOf(paint((x) => (speck(x) ? [255, 220, 60] : [190, 230, 255])))).toBeCloseTo(
      MIN_FEATURE,
      2,
    );
  });

  it("counts the background as background however many shades it comes in", () => {
    // Four bands of near-identical blue. A variance would score this; a child
    // cannot see a boundary in it, so neither may the measure.
    const shades = [
      [190, 230, 255],
      [186, 226, 251],
      [194, 234, 255],
      [182, 222, 247],
    ];
    expect(featureOf(paint((x, y) => shades[y % shades.length]))).toBe(0);
  });

  it("draws the line where a colour becomes a different colour", () => {
    const half = (apart) =>
      featureOf(paint((x) => (x < WIDTH / 2 ? [100, 100, 100] : [100 + apart, 100, 100])));
    expect(half(DISTINCT - 10)).toBe(0);
    expect(half(DISTINCT + 10)).toBeCloseTo(0.5, 2);
  });

  it("takes the background from the biggest thing, not the first", () => {
    // Two thirds sand, one third a boat: the boat is the feature even though
    // it is drawn over the middle of the piece.
    const pixels = paint((x, y) =>
      y >= HEIGHT / 3 && y < (2 * HEIGHT) / 3 ? [30, 60, 140] : [240, 225, 180],
    );
    const { feature, background } = cellFeature(pixels, WIDTH, HEIGHT, whole);
    expect(feature).toBeCloseTo(1 / 3, 2);
    expect(background[0]).toBeGreaterThan(200);
  });
});

describe("where the pieces fall", () => {
  it("covers every pixel exactly once", () => {
    for (const grid of [
      { columns: 2, rows: 2 },
      { columns: 3, rows: 2 },
      { columns: 3, rows: 3 },
      { columns: 4, rows: 3 },
    ]) {
      const seen = new Uint8Array(WIDTH * HEIGHT);
      const cells = cellsOf(WIDTH, HEIGHT, grid);
      expect(cells).toHaveLength(grid.columns * grid.rows);
      for (const cell of cells) {
        for (let y = cell.top; y < cell.bottom; y++) {
          for (let x = cell.left; x < cell.right; x++) seen[y * WIDTH + x]++;
        }
      }
      expect([...seen].every((count) => count === 1)).toBe(true);
    }
  });

  it("scores a piece by what is in that piece alone", () => {
    // Sky above, ground below, and one yellow sun in the top left cell. Only
    // that cell has anything; the rest of the top row is the empty sky the
    // whole check exists to catch.
    const pixels = paint((x, y) => {
      if (x < 8 && y < 8) return [255, 220, 60];
      return y < HEIGHT / 2 ? [190, 230, 255] : [40, 120, 60];
    });
    const scores = scoreGrid(pixels, WIDTH, HEIGHT, { columns: 4, rows: 3 });
    const at = (column, row) =>
      scores.find((cell) => cell.column === column && cell.row === row).feature;
    expect(at(0, 0)).toBeGreaterThan(MIN_FEATURE);
    expect(at(1, 0)).toBe(0);
    expect(at(3, 0)).toBe(0);
    // The middle row straddles the horizon, so every piece of it has both.
    expect(at(2, 1)).toBeGreaterThan(MIN_FEATURE);
  });
});

describe("the emptiest patch a shard could land on", () => {
  it("agrees with the partition about how small a shard may be", () => {
    // The check script cannot import the game's source, so it carries its own
    // copy of the floor. This is the thing that stops the copy drifting.
    expect(SHARD_AREA_SHARE).toBe(MIN_AREA_SHARE);
  });

  it("measures a window the size of the smallest shard allowed", () => {
    // Half the art box across, six shards: an even shard is a fifteenth of the
    // measured area, the floor is 0.7 of that, and the window is its side.
    const side = shardWindow(6);
    expect(side).toBeGreaterThan(60);
    expect(side).toBeLessThan(90);
    // More shards, smaller window.
    expect(shardWindow(12)).toBeLessThan(side);
  });

  it("finds the empty corner of a picture with one thing in it", () => {
    const pixels = paint((x, y) => (x < 8 && y < 8 ? [255, 220, 60] : [190, 230, 255]));
    const worst = worstWindow(pixels, WIDTH, HEIGHT, 10, 2);
    expect(worst.feature).toBe(0);
    expect(worst.left).toBeGreaterThanOrEqual(8);
  });

  it("passes a picture with something everywhere", () => {
    // Stripes: every window of ten straddles a boundary.
    const pixels = paint((x, y) => (Math.floor(y / 5) % 2 ? [190, 230, 255] : [40, 120, 60]));
    expect(worstWindow(pixels, WIDTH, HEIGHT, 10, 2).feature).toBeGreaterThan(MIN_FEATURE);
  });

  it("refuses a window that does not fit", () => {
    const pixels = paint(() => [190, 230, 255]);
    expect(() => worstWindow(pixels, WIDTH, HEIGHT, HEIGHT + 1)).toThrow(/does not fit/);
  });
});
