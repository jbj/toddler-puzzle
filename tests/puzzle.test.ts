import { describe, expect, it } from "vitest";
import { ANIMAL_IDS } from "../src/assets";
import {
  boxCenter,
  clampToCanvas,
  distance,
  fitScale,
  isWithinSnapRadius,
  screenToLogical,
  shuffle,
} from "../src/geometry";
import {
  LAYOUTS,
  STAGES,
  STAGE_COUNT,
  chooseLayout,
  holeOf,
  nextStage,
} from "../src/layout";

const CANVAS = { width: 1000, height: 700 };
const PIECE = 190;

describe("fitScale", () => {
  it("uses the limiting axis so the canvas always fits", () => {
    expect(fitScale({ width: 2000, height: 700 }, CANVAS)).toBe(1);
    expect(fitScale({ width: 1000, height: 1400 }, CANVAS)).toBe(1);
    expect(fitScale({ width: 500, height: 350 }, CANVAS)).toBe(0.5);
  });
});

describe("screenToLogical", () => {
  it("is an identity map at 1:1 with no letterboxing", () => {
    const rect = { x: 0, y: 0, ...CANVAS };
    expect(screenToLogical({ x: 250, y: 100 }, rect, CANVAS)).toEqual({ x: 250, y: 100 });
  });

  it("accounts for the container's offset on the page", () => {
    const rect = { x: 40, y: 25, ...CANVAS };
    expect(screenToLogical({ x: 240, y: 125 }, rect, CANVAS)).toEqual({ x: 200, y: 100 });
  });

  it("accounts for horizontal letterboxing on a wide viewport", () => {
    // 2000x700 container at scale 1 leaves 500px of bar on each side.
    const wide = { x: 0, y: 0, width: 2000, height: 700 };
    expect(screenToLogical({ x: 500, y: 0 }, wide, CANVAS)).toEqual({ x: 0, y: 0 });
    expect(screenToLogical({ x: 1500, y: 700 }, wide, CANVAS)).toEqual({ x: 1000, y: 700 });
  });

  it("accounts for vertical letterboxing on a tall viewport", () => {
    // 1000x1400 container at scale 1 leaves 350px of bar top and bottom.
    const tall = { x: 0, y: 0, width: 1000, height: 1400 };
    expect(screenToLogical({ x: 0, y: 350 }, tall, CANVAS)).toEqual({ x: 0, y: 0 });
    expect(screenToLogical({ x: 1000, y: 1050 }, tall, CANVAS)).toEqual({ x: 1000, y: 700 });
  });

  it("maps the centre of any container to the centre of the canvas", () => {
    for (const layout of LAYOUTS) {
      for (const rect of [
        { x: 0, y: 0, width: 320, height: 900 },
        { x: 17, y: 3, width: 1440, height: 810 },
        { x: 0, y: 0, width: 768, height: 768 },
      ]) {
        const center = screenToLogical(
          { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
          rect,
          layout.canvas,
        );
        expect(center.x).toBeCloseTo(layout.canvas.width / 2);
        expect(center.y).toBeCloseTo(layout.canvas.height / 2);
      }
    }
  });
});

describe("clampToCanvas", () => {
  it("keeps a piece fully on screen so it can never be lost", () => {
    expect(clampToCanvas({ x: -500, y: -500 }, PIECE, CANVAS)).toEqual({ x: 0, y: 0 });
    expect(clampToCanvas({ x: 9999, y: 9999 }, PIECE, CANVAS)).toEqual({
      x: CANVAS.width - PIECE,
      y: CANVAS.height - PIECE,
    });
  });

  it("leaves in-bounds positions untouched", () => {
    expect(clampToCanvas({ x: 300, y: 200 }, PIECE, CANVAS)).toEqual({ x: 300, y: 200 });
  });
});

describe("snapping", () => {
  const layout = LAYOUTS[0]!;

  it("accepts a drop that is close but not exact", () => {
    const hole = boxCenter(holeOf(layout, "duck"), layout.pieceSize);
    const sloppy = { x: hole.x + 80, y: hole.y - 60 };
    expect(distance(sloppy, hole)).toBeLessThan(layout.snapRadius);
    expect(isWithinSnapRadius(sloppy, hole, layout.snapRadius)).toBe(true);
  });

  it("rejects a drop that is clearly somewhere else", () => {
    const hole = boxCenter(holeOf(layout, "duck"), layout.pieceSize);
    const tray = boxCenter(layout.traySlots[0]!, layout.pieceSize);
    expect(isWithinSnapRadius(tray, hole, layout.snapRadius)).toBe(false);
  });
});

describe("stages", () => {
  it("grows from three animals to four to six", () => {
    expect(STAGES.map((animals) => animals.length)).toEqual([3, 4, 6]);
    expect(STAGE_COUNT).toBe(3);
  });

  it("only uses animals that actually exist, with no repeats in a stage", () => {
    for (const animals of STAGES) {
      expect(new Set(animals).size).toBe(animals.length);
      for (const animal of animals) expect(ANIMAL_IDS).toContain(animal);
    }
  });

  it("uses every animal by the final stage", () => {
    expect(new Set(STAGES[STAGE_COUNT - 1]!)).toEqual(new Set(ANIMAL_IDS));
  });

  it("loops back to the first stage after the last", () => {
    expect(nextStage(1)).toBe(2);
    expect(nextStage(2)).toBe(3);
    expect(nextStage(STAGE_COUNT)).toBe(1);
  });

  it("has a landscape and a portrait layout for every stage", () => {
    expect(LAYOUTS).toHaveLength(STAGE_COUNT * 2);
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      expect(chooseLayout({ width: 1280, height: 800 }, stage).stage).toBe(stage);
      expect(chooseLayout({ width: 390, height: 844 }, stage).stage).toBe(stage);
    }
  });
});

describe.each(LAYOUTS)("stage $stage, $id layout", (layout) => {
  const { width, height } = layout.canvas;
  const { pieceSize, snapRadius } = layout;
  const holes = layout.animals.map((animal) => holeOf(layout, animal));

  it("gives exactly this stage's animals a hole", () => {
    expect(layout.animals).toEqual(STAGES[layout.stage - 1]);
    expect(Object.keys(layout.holes).sort()).toEqual([...layout.animals].sort());
  });

  it("keeps every hole inside the scenery, above the tray", () => {
    for (const hole of holes) {
      expect(hole.x).toBeGreaterThanOrEqual(0);
      expect(hole.x + pieceSize).toBeLessThanOrEqual(width);
      expect(hole.y).toBeGreaterThanOrEqual(0);
      expect(hole.y + pieceSize).toBeLessThanOrEqual(layout.trayTop + pieceSize);
    }
  });

  it("keeps snap zones from overlapping each other", () => {
    const centers = holes.map((hole) => boxCenter(hole, pieceSize));
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        expect(distance(centers[i]!, centers[j]!)).toBeGreaterThan(snapRadius);
      }
    }
  });

  it("provides one tray slot per animal, all on canvas and below the tray line", () => {
    expect(layout.traySlots).toHaveLength(holes.length);
    for (const slot of layout.traySlots) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x + pieceSize).toBeLessThanOrEqual(width);
      expect(slot.y).toBeGreaterThanOrEqual(layout.trayTop);
      expect(slot.y + pieceSize).toBeLessThanOrEqual(height);
    }
  });

  it("does not overlap tray slots with each other", () => {
    const slots = layout.traySlots;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i]!;
        const b = slots[j]!;
        const overlaps = Math.abs(a.x - b.x) < pieceSize && Math.abs(a.y - b.y) < pieceSize;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("does not let a tray slot sit inside a hole's snap zone", () => {
    for (const slot of layout.traySlots) {
      for (const hole of holes) {
        const gap = distance(boxCenter(slot, pieceSize), boxCenter(hole, pieceSize));
        expect(gap).toBeGreaterThan(snapRadius);
      }
    }
  });

  it("keeps pieces big enough for a toddler to grab", () => {
    // A piece narrower than a tenth of the canvas would be a fiddly target on a
    // small screen, however many animals the stage has.
    expect(pieceSize / width).toBeGreaterThan(0.1);
  });
});

describe("chooseLayout", () => {
  it("uses the portrait reflow only when taller than wide", () => {
    expect(chooseLayout({ width: 1280, height: 800 }, 1).id).toBe("landscape");
    expect(chooseLayout({ width: 1024, height: 1024 }, 2).id).toBe("landscape");
    expect(chooseLayout({ width: 390, height: 844 }, 3).id).toBe("portrait");
  });

  it("rejects a stage that does not exist rather than showing an empty board", () => {
    expect(() => chooseLayout({ width: 1280, height: 800 }, 0)).toThrow();
    expect(() => chooseLayout({ width: 1280, height: 800 }, STAGE_COUNT + 1)).toThrow();
  });

  it("fills a decent share of the viewport in both orientations", () => {
    const cases = [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
    ];
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      for (const viewport of cases) {
        const layout = chooseLayout(viewport, stage);
        const scale = fitScale(viewport, layout.canvas);
        const used =
          (layout.canvas.width * scale * layout.canvas.height * scale) /
          (viewport.width * viewport.height);
        // Letterboxing a landscape canvas into a phone would score ~0.4 here.
        expect(used).toBeGreaterThan(0.75);
      }
    }
  });
});

describe("shuffle", () => {
  it("keeps every element exactly once", () => {
    const input = [1, 2, 3, 4, 5];
    expect([...shuffle(input, () => 0.42)].sort()).toEqual(input);
  });

  it("does not mutate the input", () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });
});
