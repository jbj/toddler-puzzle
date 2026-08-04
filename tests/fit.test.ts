/**
 * The sizing search, on its own.
 *
 * `tests/puzzle.test.ts` checks the promises a *composed board* makes, over
 * real animals and random deals. This checks the arithmetic underneath it, over
 * synthetic sizes: no animals, no SVG, no level table, so a failure here names
 * the rule that broke rather than the level that noticed.
 *
 * The limits are dialled here rather than imported, so a test can say "a tray
 * has to buy a fifth more" and mean it, and so `COMPOSITION` moving does not
 * quietly rewrite what these are asserting.
 */
import { describe, expect, it } from "vitest";
import {
  columnings,
  fitPicture,
  fitRows,
  idealRows,
  sceneRoom,
  shelvedDepth,
  shelvings,
  sideEdge,
  spanOf,
  splitRows,
  type Limits,
  type PictureDemand,
  type Reach,
  type RowsDemand,
  type RowsFit,
  type TrayPad,
} from "../src/fit";
import type { Size } from "../src/geometry";

/** The game's own numbers, so a fit here is the fit the game would have taken. */
const LIMITS: Limits = {
  rowGap: 0.3,
  footRoom: 0.28,
  skyShare: 0.15,
  controlRoom: 96,
  maxSlot: 0.3,
  trayShare: 0.32,
  sizeTolerance: 0.94,
  gutterGain: 1.1,
  minSlot: 0.105,
  minPieceInk: 0.065,
  minWaitingScale: 2 / 3,
  pictureMargin: 0.022,
};

const PAD: TrayPad = { margin: 0.2, gap: 0.12, pad: 0.08, inside: 0.06 };

/**
 * The width a size is measured against: the canvas width, but never more than
 * a reference-shaped board of this height would have had. `spanWidth` in
 * `layout.ts`, restated here so the floors bite where the game's do.
 */
const span = (canvas: Size): number => Math.min(canvas.width, canvas.height * (1000 / 700));

/** A piece that fills its box, which is what every animal in the game does. */
const square = (count: number): Size[] =>
  Array.from({ length: count }, () => ({ width: 1, height: 1 }));

/** A tall narrow piece - a slice of a picture, or a giraffe. */
const tall = (count: number): Size[] =>
  Array.from({ length: count }, () => ({ width: 0.4, height: 1 }));

/** A target that stands near the foot of its box, as an animal does. */
const standing = (count: number): Reach[] =>
  Array.from({ length: count }, () => ({ rise: 0.85, drop: 0.15 }));

const rowsDemand = (
  canvas: Size,
  targets: number,
  pieces: number,
  cast: (count: number) => Size[] = square,
): RowsDemand => ({
  canvas,
  span: span(canvas),
  reaches: standing(targets),
  grips: cast(pieces),
  drawn: cast(pieces),
  pad: PAD,
});

const playArea = (fit: RowsFit, canvas: Size): number => {
  const room = sceneRoom(fit.tray, canvas, fit.slotSize, PAD, 0);
  return room.width * room.height;
};

/** A ladder of screen shapes from tall to wide, the game's own range. */
const CANVASES: readonly Size[] = [
  { width: 700, height: 2100 },
  { width: 700, height: 1180 },
  { width: 700, height: 700 },
  { width: 1000, height: 700 },
  { width: 1244, height: 700 },
  { width: 2100, height: 700 },
];

describe("splitting a cast into rows", () => {
  it("shares the pieces out as evenly as it can, fullest row first", () => {
    expect(splitRows(7, 3)).toEqual([3, 2, 2]);
    expect(splitRows(6, 3)).toEqual([2, 2, 2]);
    expect(splitRows(1, 1)).toEqual([1]);
  });

  it("never loses or invents a piece, at any count and any number of rows", () => {
    for (let count = 1; count <= 12; count++) {
      for (let rows = 1; rows <= count; rows++) {
        const split = splitRows(count, rows);
        expect(split).toHaveLength(rows);
        expect(split.reduce((sum, one) => sum + one, 0)).toBe(count);
        expect(Math.max(...split) - Math.min(...split)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("how many rows suit a region", () => {
  it("spreads a wide region into one row and stacks a tall one", () => {
    expect(idealRows(6, 200, 2000)).toBe(1);
    expect(idealRows(6, 1400, 500)).toBe(4);
  });

  it("never asks for more rows than there are pieces", () => {
    expect(idealRows(2, 5000, 100)).toBe(2);
  });
});

describe("packing a tray", () => {
  it("keeps every piece exactly once, in the order it was dealt", () => {
    const cast: Size[] = [
      { width: 1, height: 0.4 },
      { width: 0.3, height: 1 },
      { width: 0.7, height: 0.7 },
      { width: 0.5, height: 0.2 },
      { width: 0.9, height: 0.6 },
    ];
    for (let rows = 1; rows <= cast.length; rows++) {
      for (const shelves of shelvings(cast, rows, PAD)) {
        const placed = shelves.flatMap((shelf) => shelf.pieces);
        expect([...placed].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
        for (const shelf of shelves) {
          expect([...shelf.pieces]).toEqual([...shelf.pieces].sort((a, b) => a - b));
        }
      }
    }
    const columns = columnings(cast, PAD);
    expect(columns).toHaveLength(2);
    expect(columns.flatMap((column) => column.pieces).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it("prices a shelf at what stands on it, margins and gaps counted", () => {
    expect(spanOf([1, 1, 1], PAD)).toBeCloseTo(3 + 2 * 0.12 + 2 * 0.2);
    expect(spanOf([], PAD)).toBeCloseTo(2 * 0.2 - 0.12);
  });

  it("stacks the two columns to much the same depth", () => {
    const columns = columnings(square(6), PAD);
    const depths = columns.map((column) => column.depth);
    expect(Math.abs((depths[0] as number) - (depths[1] as number))).toBeLessThanOrEqual(1);
  });
});

describe("where the tray goes", () => {
  /** How much bigger the sides draw the puzzle than the top, for this cast. */
  const gainOf = (canvas: Size, targets: number, pieces: number): number => {
    const demand = rowsDemand(canvas, targets, pieces);
    const sides = fitRows(demand, { ...LIMITS, gutterGain: 0 });
    expect(sides.tray.place).toBe("sides");
    return sides.slotSize / fitRows(demand, { ...LIMITS, gutterGain: Infinity }).slotSize;
  };

  it("keeps the tray at the top when the sides would buy nothing", () => {
    // An upright canvas: the height a band costs is the height there is most
    // of, so columns down the sides do not make the puzzle any bigger.
    const canvas = { width: 700, height: 1600 };
    expect(gainOf(canvas, 1, 4)).toBeLessThan(LIMITS.gutterGain);
    expect(fitRows(rowsDemand(canvas, 1, 4), LIMITS).tray.place).toBe("top");
  });

  it("moves the tray to the sides once they draw the puzzle a tenth bigger", () => {
    const canvas = { width: 700, height: 700 };
    expect(gainOf(canvas, 1, 4)).toBeGreaterThan(LIMITS.gutterGain);
    expect(fitRows(rowsDemand(canvas, 1, 4), LIMITS).tray.place).toBe("sides");
  });

  it("holds the bar where the limit says, rather than wherever it happens to fall", () => {
    const canvas = { width: 700, height: 700 };
    const demand = rowsDemand(canvas, 1, 4);
    const gain = gainOf(canvas, 1, 4);
    // Just above the measured gain the sides are refused; just below it, taken.
    expect(fitRows(demand, { ...LIMITS, gutterGain: gain * 1.01 }).tray.place).toBe("top");
    expect(fitRows(demand, { ...LIMITS, gutterGain: gain * 0.99 }).tray.place).toBe("sides");
  });

  it("never takes the sides at the cost of a smaller puzzle", () => {
    let taken = 0;
    for (const canvas of CANVASES) {
      for (let targets = 1; targets <= 4; targets++) {
        for (let pieces = 2; pieces <= 8; pieces++) {
          const demand = rowsDemand(canvas, targets, pieces);
          const chosen = fitRows(demand, LIMITS);
          if (chosen.tray.place !== "sides") continue;
          taken++;
          expect(chosen.slotSize).toBeGreaterThanOrEqual(
            fitRows(demand, { ...LIMITS, gutterGain: Infinity }).slotSize,
          );
        }
      }
    }
    expect(taken, "no board in the sweep took the sides, so nothing was checked").toBeGreaterThan(
      0,
    );
  });

  it("takes the sides for the room when the puzzle cannot be drawn any bigger", () => {
    // A letterbox screen: both placements are pinned at the cap on how big a
    // piece may draw, so the only thing left to tell them apart is the board.
    const canvas = { width: 2400, height: 800 };
    const demand = rowsDemand(canvas, 1, 4, tall);
    const top = fitRows(demand, { ...LIMITS, gutterGain: Infinity });
    const sides = fitRows(demand, LIMITS);
    expect(sides.tray.place).toBe("sides");
    expect(sides.slotSize).toBe(top.slotSize);
    expect(playArea(sides, canvas)).toBeGreaterThanOrEqual(
      playArea(top, canvas) * LIMITS.gutterGain ** 2,
    );
  });

  it("lets a board of several targets stand its pieces at the sides", () => {
    const canvas = { width: 2400, height: 800 };
    expect(fitRows(rowsDemand(canvas, 3, 4, tall), LIMITS).tray.place).toBe("sides");
  });

  it("stands more than one column a side when one would be too deep to fill", () => {
    // Six pieces in a single column each side would reach further down than a
    // short canvas has, and cap the slot at what that column could hold; two
    // columns a side are half as deep and draw the puzzle a fifth bigger.
    const tray = fitRows(rowsDemand({ width: 1400, height: 800 }, 1, 6), LIMITS).tray;
    expect(tray.place).toBe("sides");
    if (tray.place !== "sides") return;
    expect(tray.columns).toHaveLength(4);
  });

  it("stands the same number of columns each side, so the scene keeps the middle", () => {
    for (const canvas of CANVASES) {
      for (let pieces = 2; pieces <= 9; pieces++) {
        const tray = fitRows(rowsDemand(canvas, 1, pieces), LIMITS).tray;
        if (tray.place !== "sides") continue;
        expect(tray.columns.length % 2).toBe(0);
        expect(tray.columns.flatMap((column) => column.pieces)).toHaveLength(pieces);
      }
    }
  });
});

describe("how big a board comes out", () => {
  it("gives the same cast the same fit twice", () => {
    const demand = rowsDemand({ width: 1244, height: 700 }, 4, 4);
    expect(fitRows(demand, LIMITS)).toEqual(fitRows(demand, LIMITS));
  });

  it("never draws a fuller board bigger than an emptier one", () => {
    const canvas = { width: 1244, height: 700 };
    let last = Infinity;
    for (let count = 1; count <= 8; count++) {
      const fit = fitRows(rowsDemand(canvas, count, count), LIMITS);
      expect(fit.slotSize).toBeLessThanOrEqual(last);
      last = fit.slotSize;
    }
  });

  it("never draws a board smaller on a bigger screen", () => {
    let last = 0;
    for (const height of [700, 900, 1100, 1400]) {
      const fit = fitRows(rowsDemand({ width: height * 2, height }, 4, 4), LIMITS);
      expect(fit.slotSize).toBeGreaterThanOrEqual(last);
      last = fit.slotSize;
    }
  });

  it("stacks more rows on an upright screen than it spreads on a wide one", () => {
    const tall = fitRows(rowsDemand({ width: 700, height: 1600 }, 6, 6), LIMITS);
    const wide = fitRows(rowsDemand({ width: 1600, height: 700 }, 6, 6), LIMITS);
    expect(tall.sceneCounts.length).toBeGreaterThan(wide.sceneCounts.length);
  });

  it("never lets a piece draw larger than the cap on the shorter side", () => {
    for (const canvas of [
      { width: 700, height: 2100 },
      { width: 1244, height: 700 },
      { width: 2100, height: 700 },
    ]) {
      const fit = fitRows(rowsDemand(canvas, 1, 2), LIMITS);
      expect(fit.slotSize).toBeLessThanOrEqual(
        LIMITS.maxSlot * Math.min(canvas.width, canvas.height),
      );
    }
  });

  it("leaves the scene room below whatever the tray took", () => {
    const canvas = { width: 1244, height: 700 };
    const fit = fitRows(rowsDemand(canvas, 3, 6), LIMITS);
    const room = sceneRoom(fit.tray, canvas, fit.slotSize, PAD, 0);
    expect(room.width).toBeGreaterThan(0);
    expect(room.height).toBeGreaterThan(0);
    expect(room.width).toBeLessThanOrEqual(canvas.width);
    expect(room.y + room.height).toBeLessThanOrEqual(canvas.height);
  });

  it("refuses a cast it cannot draw big enough to grab, rather than shrinking it away", () => {
    expect(() => fitRows(rowsDemand({ width: 700, height: 700 }, 40, 40), LIMITS)).toThrow(
      /too small for a toddler to grab/,
    );
  });

  it("refuses an empty cast rather than composing a board with nothing on it", () => {
    const canvas = { width: 1244, height: 700 };
    expect(() => fitRows({ ...rowsDemand(canvas, 1, 1), grips: [], drawn: [] }, LIMITS)).toThrow(
      /at least one piece/,
    );
    expect(() => fitRows({ ...rowsDemand(canvas, 1, 1), reaches: [] }, LIMITS)).toThrow(
      /at least one target/,
    );
  });
});

describe("what a tray costs the board", () => {
  it("prices a band by its shelves and columns by their width", () => {
    const shelves = shelvings(square(4), 2, PAD)[0] as ReturnType<typeof shelvings>[number];
    expect(shelvedDepth(shelves, 100, PAD)).toBe(Math.round((1 + 1 + 3 * 0.08) * 100));
    const columns = columnings(square(4), PAD);
    expect(sideEdge(columns, 100, PAD)).toBe(Math.round(0.2 * 100) + 100 + Math.round(0.06 * 100));
  });

  it("takes height for a band and width for columns, and never both", () => {
    const canvas = { width: 2100, height: 700 };
    const shelves = shelvings(square(4), 1, PAD)[0] as ReturnType<typeof shelvings>[number];
    const band = sceneRoom({ place: "top", shelves }, canvas, 100, PAD, 0);
    expect(band.x).toBe(0);
    expect(band.y).toBeGreaterThan(0);
    const sides = sceneRoom(
      { place: "sides", columns: columnings(square(4), PAD) },
      canvas,
      100,
      PAD,
      0,
    );
    expect(sides.y).toBe(0);
    expect(sides.x).toBeGreaterThan(0);
  });
});

describe("a picture board", () => {
  /** A cut-up picture: the shards tile it, so each one is a fraction of it. */
  const shards = (count: number): Size[] => {
    const across = Math.ceil(Math.sqrt(count));
    return Array.from({ length: count }, () => ({ width: 1 / across, height: 1 / across }));
  };

  const pictureDemand = (canvas: Size, count: number, box: Size): PictureDemand => {
    const drawn = shards(count);
    const largest = Math.max(...drawn.map((one) => Math.max(one.width, one.height)));
    return {
      canvas,
      span: span(canvas),
      box,
      grips: drawn,
      drawn,
      pad: {
        margin: 0.13 * largest,
        gap: 0.2 * largest,
        pad: 0.13 * largest,
        inside: 0.13 * largest,
      },
    };
  };

  it("never draws a waiting piece larger than the one that has landed", () => {
    for (const canvas of [
      { width: 700, height: 1244 },
      { width: 1244, height: 700 },
      { width: 2100, height: 700 },
    ]) {
      for (const count of [4, 6, 9]) {
        const plan = fitPicture(pictureDemand(canvas, count, { width: 4, height: 3 }), LIMITS);
        expect(plan.traySlot).toBeLessThanOrEqual(plan.sceneSlot);
      }
    }
  });

  it("never draws a waiting piece below the floor it is allowed", () => {
    for (const count of [4, 6, 9, 12]) {
      const plan = fitPicture(
        pictureDemand({ width: 1244, height: 700 }, count, { width: 4, height: 3 }),
        LIMITS,
      );
      expect(plan.traySlot / plan.sceneSlot).toBeGreaterThanOrEqual(LIMITS.minWaitingScale - 1e-9);
    }
  });

  it("gives the picture the room the tray leaves it, and no more", () => {
    const canvas = { width: 1244, height: 700 };
    const box = { width: 4, height: 3 };
    const plan = fitPicture(pictureDemand(canvas, 6, box), LIMITS);
    const pad = pictureDemand(canvas, 6, box).pad;
    const room = sceneRoom(plan.tray, canvas, plan.traySlot, pad, LIMITS.pictureMargin * 700);
    const scale = Math.min(room.width / box.width, room.height / box.height);
    // Drawn to fill the room on one axis, within the rounding down to a whole
    // slot - or held back by the waiting floor, which is the other cap.
    expect(plan.sceneSlot).toBeLessThanOrEqual(Math.max(box.width, box.height) * scale + 1);
  });

  it("gives the same picture the same plan twice", () => {
    const demand = pictureDemand({ width: 1244, height: 700 }, 6, { width: 4, height: 3 });
    expect(fitPicture(demand, LIMITS)).toEqual(fitPicture(demand, LIMITS));
  });

  it("keeps the same plan at the last square cut this board can hold", () => {
    const plan = fitPicture(
      pictureDemand({ width: 700, height: 700 }, 36, { width: 1, height: 1 }),
      LIMITS,
    );
    // This pins the last fitting cut so an early refusal cannot quietly move
    // the boundary; a changed plan means that boundary must be justified again.
    expect(plan).toEqual({
      tray: {
        place: "top",
        shelves: [
          { pieces: [0, 4, 8, 12, 16, 20, 24, 28, 32], span: 1.81, height: 1 / 6 },
          { pieces: [1, 5, 9, 13, 17, 21, 25, 29, 33], span: 1.81, height: 1 / 6 },
          { pieces: [2, 6, 10, 14, 18, 22, 26, 30, 34], span: 1.81, height: 1 / 6 },
          { pieces: [3, 7, 11, 15, 19, 23, 27, 31, 35], span: 1.81, height: 1 / 6 },
        ],
      },
      sceneSlot: 441,
      traySlot: 294,
      room: 295251.04000000004,
    });
  });

  it("refuses the first square cut past that boundary", () => {
    expect(() =>
      fitPicture(pictureDemand({ width: 700, height: 700 }, 37, { width: 1, height: 1 }), LIMITS),
    ).toThrow(/a size a toddler could grab/);
  });

  it("refuses when the grips alone cannot share the canvas", () => {
    const count = 474;
    const demand = pictureDemand({ width: 700, height: 700 }, count, { width: 1, height: 1 });
    const drawn = Array.from({ length: count }, () => ({ width: 0.1, height: 0.01 }));
    const grips = Array.from({ length: count }, () => ({ width: 0.1, height: 0.05 }));
    expect(() => fitPicture({ ...demand, drawn, grips }, LIMITS)).toThrow(
      /a size a toddler could grab/,
    );
  });

  it("refuses a picture cut into more pieces than the board can hold", () => {
    expect(() =>
      fitPicture(pictureDemand({ width: 700, height: 700 }, 400, { width: 1, height: 1 }), LIMITS),
    ).toThrow(/a size a toddler could grab/);
  });
});
