import { describe, expect, it } from "vitest";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor } from "../src/assets";
import {
  boxCenter,
  clampToCanvas,
  distance,
  fitScale,
  isWithinSnapRadius,
  padWithin,
  screenToLogical,
  seededRandom,
  shuffle,
} from "../src/geometry";
import {
  GRAB_PADDING,
  STAGE_COUNT,
  STAGE_SIZES,
  boxOf,
  buildStageLayout,
  chooseLayout,
  holeOf,
  nextStage,
  pickStagePieces,
  stageSize,
  type Layout,
} from "../src/layout";
import { pieceId, type PieceShape } from "../src/piece";

const CANVAS = { width: 1000, height: 700 };
const PIECE = { width: 190, height: 190 };

const ORIENTATIONS = ["landscape", "portrait"] as const;

/**
 * The animals as the layout sees them. Only the identity and the anchor matter
 * here, and the artwork needs a DOM to parse, so these carry no markup: layout
 * is deliberately blind to what a piece looks like.
 */
const SHAPES: readonly PieceShape[] = ANIMAL_IDS.map((id) => ({
  id: pieceId(id),
  outline: "",
  artwork: "",
  box: ANIMAL_BOX,
  anchor: animalAnchor(id),
  label: id,
}));

/**
 * Every cast a stage could be dealt is a subset of the shapes in some order,
 * which is far too many to enumerate. Rotating the list puts each shape in each
 * position at least once, which is what the layout actually depends on: a hole's
 * height comes from the anchor of whichever piece stands there.
 */
function castsFor(stage: number): PieceShape[][] {
  const size = stageSize(stage);
  return SHAPES.map((_, offset) =>
    Array.from({ length: size }, (_, index) => SHAPES[(offset + index) % SHAPES.length]!),
  );
}

/** Every stage, both orientations, across a representative spread of casts. */
const LAYOUTS: Layout[] = [];
for (let stage = 1; stage <= STAGE_COUNT; stage++) {
  for (const id of ORIENTATIONS) {
    for (const cast of castsFor(stage)) LAYOUTS.push(buildStageLayout(id, stage, cast));
  }
}

/** Where a piece's anchor lands once it is standing in its hole. */
const groundOf = (layout: Layout, shape: PieceShape): number =>
  holeOf(layout, shape.id).y + shape.anchor.y * boxOf(layout, shape.id).scale;

describe("anchors", () => {
  it("stands every piece on one ground line, whatever its anchor", () => {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      for (const cast of castsFor(stage)) {
        // Landscape puts a stage's whole cast on a single ground line, so any
        // difference here is a piece floating or sinking rather than standing.
        const layout = buildStageLayout("landscape", stage, cast);
        const grounds = layout.pieces.map((shape) => groundOf(layout, shape));
        for (const ground of grounds) expect(ground).toBeCloseTo(grounds[0]!);
      }
    }
  });
});

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
      x: CANVAS.width - PIECE.width,
      y: CANVAS.height - PIECE.height,
    });
  });

  it("leaves in-bounds positions untouched", () => {
    expect(clampToCanvas({ x: 300, y: 200 }, PIECE, CANVAS)).toEqual({ x: 300, y: 200 });
  });

  it("clamps each axis by the piece's own extent, not by one square", () => {
    // A wide piece treated as a square would stop 300 units short of the bottom
    // and hang 200 off the right - out of reach on one axis, off canvas on the
    // other. Its own bounds put it flush against both edges instead.
    const wide = { width: 300, height: 100 };
    expect(clampToCanvas({ x: 9999, y: 9999 }, wide, CANVAS)).toEqual({ x: 700, y: 600 });
    const tall = { width: 100, height: 300 };
    expect(clampToCanvas({ x: 9999, y: 9999 }, tall, CANVAS)).toEqual({ x: 900, y: 400 });
  });
});

describe("boxCenter", () => {
  it("halves each side separately, so the centre is inside the piece", () => {
    expect(boxCenter({ x: 10, y: 20 }, { width: 300, height: 100 })).toEqual({ x: 160, y: 70 });
    expect(boxCenter({ x: 10, y: 20 }, { width: 100, height: 300 })).toEqual({ x: 60, y: 170 });
  });
});

describe("padWithin", () => {
  // The animals' box; a grab area is measured in these units before it is
  // scaled into a slot.
  const BOX = { width: 240, height: 240 };
  const padding = GRAB_PADDING * BOX.width;

  it("gives a measured drawing a margin on every side", () => {
    expect(padWithin({ x: 60, y: 50, width: 100, height: 120 }, 10, BOX)).toEqual({
      x: 50,
      y: 40,
      width: 120,
      height: 140,
    });
  });

  it("never reaches outside the box, however big the padding", () => {
    const grown = padWithin({ x: 4, y: 8, width: 232, height: 200 }, 999, BOX);
    expect(grown).toEqual({ x: 0, y: 0, width: BOX.width, height: BOX.height });
  });

  /**
   * The reason grab areas cannot become ambiguous: a piece's box is exactly the
   * slot it was laid out in, and no two slots overlap (see the layout suite),
   * so an area held inside the box cannot reach into the next piece's.
   */
  it("keeps a padded drawing inside the piece's own box", () => {
    for (const drawn of [
      { x: 0, y: 0, width: 240, height: 240 },
      { x: 2, y: 220, width: 236, height: 20 },
      { x: 200, y: 0, width: 40, height: 240 },
    ]) {
      const grab = padWithin(drawn, padding, BOX);
      expect(grab.x).toBeGreaterThanOrEqual(0);
      expect(grab.y).toBeGreaterThanOrEqual(0);
      expect(grab.x + grab.width).toBeLessThanOrEqual(BOX.width);
      expect(grab.y + grab.height).toBeLessThanOrEqual(BOX.height);
    }
  });

  it("stays harmless when there is nothing to measure", () => {
    const grab = padWithin({ x: 0, y: 0, width: 0, height: 0 }, padding, BOX);
    expect(grab.width).toBeCloseTo(padding);
    expect(grab.height).toBeCloseTo(padding);
  });
});

describe("snapping", () => {
  const layout = LAYOUTS[0]!;
  const piece = layout.pieces[0]!.id;
  const { size, snapRadius } = boxOf(layout, piece);

  it("accepts a drop that is close but not exact", () => {
    const hole = boxCenter(holeOf(layout, piece), size);
    const sloppy = { x: hole.x + 80, y: hole.y - 60 };
    expect(distance(sloppy, hole)).toBeLessThan(snapRadius);
    expect(isWithinSnapRadius(sloppy, hole, snapRadius)).toBe(true);
  });

  it("rejects a drop that is clearly somewhere else", () => {
    const hole = boxCenter(holeOf(layout, piece), size);
    const tray = boxCenter(layout.traySlots[0]!, size);
    expect(isWithinSnapRadius(tray, hole, snapRadius)).toBe(false);
  });
});

describe("stages", () => {
  it("grows from three animals to four to six", () => {
    expect([...STAGE_SIZES]).toEqual([3, 4, 6]);
    expect(STAGE_COUNT).toBe(3);
  });

  it("loops back to the first stage after the last", () => {
    expect(nextStage(1)).toBe(2);
    expect(nextStage(2)).toBe(3);
    expect(nextStage(STAGE_COUNT)).toBe(1);
  });

  it("has a landscape and a portrait layout for every stage", () => {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      const cast = pickStagePieces(stage, SHAPES);
      expect(chooseLayout({ width: 1280, height: 800 }, stage, cast).stage).toBe(stage);
      expect(chooseLayout({ width: 390, height: 844 }, stage, cast).stage).toBe(stage);
    }
  });
});

describe("pickStagePieces", () => {
  const idsOf = (cast: readonly PieceShape[]): string[] => cast.map((shape) => shape.id);

  it("deals the right number of pieces for each stage", () => {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      expect(pickStagePieces(stage, SHAPES)).toHaveLength(stageSize(stage));
    }
  });

  it("only uses pieces that actually exist, with no repeats in a stage", () => {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      for (let run = 0; run < 50; run++) {
        const cast = pickStagePieces(stage, SHAPES);
        expect(new Set(idsOf(cast)).size).toBe(cast.length);
        for (const shape of cast) expect(SHAPES).toContain(shape);
      }
    }
  });

  it("rejects shapes whose piece ids are not unique", () => {
    const duplicateId = SHAPES[0]!.id;
    const duplicateIds = [SHAPES[0]!, { ...SHAPES[1]!, id: duplicateId }];
    expect(() => pickStagePieces(1, duplicateIds, seededRandom(7))).toThrow(
      new RegExp(`duplicate .*"${duplicateId}"`, "i"),
    );
  });

  it("rejects building a layout from duplicate piece ids", () => {
    const duplicateId = SHAPES[0]!.id;
    const duplicateIds = [SHAPES[0]!, { ...SHAPES[1]!, id: duplicateId }, SHAPES[2]!];
    expect(() => buildStageLayout("landscape", 1, duplicateIds)).toThrow(
      new RegExp(`duplicate .*"${duplicateId}"`, "i"),
    );
  });

  it("can deal any piece into the final stage", () => {
    // There are more animals than the biggest stage holds, so a single deal is
    // a sample rather than the whole list; over enough deals none may be shut
    // out of the last stage.
    const seen = new Set<string>();
    for (let run = 0; run < 200; run++) {
      for (const shape of pickStagePieces(STAGE_COUNT, SHAPES)) seen.add(shape.id);
    }
    expect(seen.size).toBe(SHAPES.length);
  });

  it("varies which pieces turn up in the shorter stages", () => {
    const seen = new Set<string>();
    for (let run = 0; run < 200; run++) {
      for (const shape of pickStagePieces(1, SHAPES)) seen.add(shape.id);
    }
    // Given enough deals a three-piece stage should have shown every animal.
    expect(seen.size).toBe(SHAPES.length);
  });

  it("varies the order the pieces are laid out in", () => {
    const orders = new Set<string>();
    for (let run = 0; run < 200; run++) {
      orders.add(idsOf(pickStagePieces(STAGE_COUNT, SHAPES)).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("repeats exactly when given the same seed, so a run can be replayed", () => {
    expect(pickStagePieces(2, SHAPES, seededRandom(7))).toEqual(
      pickStagePieces(2, SHAPES, seededRandom(7)),
    );
    expect(pickStagePieces(2, SHAPES, seededRandom(7))).not.toEqual(
      pickStagePieces(2, SHAPES, seededRandom(8)),
    );
  });

  it("rejects a stage that does not exist", () => {
    expect(() => pickStagePieces(0, SHAPES)).toThrow();
    expect(() => pickStagePieces(STAGE_COUNT + 1, SHAPES)).toThrow();
  });

  it("rejects a stage bigger than the shapes on offer", () => {
    expect(() => pickStagePieces(STAGE_COUNT, SHAPES.slice(0, 2))).toThrow();
  });
});

const CASES = LAYOUTS.map((layout) => ({
  layout,
  cast: layout.pieces.map((shape) => shape.id).join(" "),
}));

describe.each(CASES)("stage $layout.stage, $layout.id layout of $cast", ({ layout }) => {
  const { width, height } = layout.canvas;
  const { slotSize } = layout;
  /** Each piece with the hole it stands in and the bounds it stands there at. */
  const placed = layout.pieces.map((shape) => ({
    shape,
    hole: holeOf(layout, shape.id),
    box: boxOf(layout, shape.id),
  }));

  it("gives exactly this stage's pieces a hole", () => {
    expect(layout.pieces).toHaveLength(stageSize(layout.stage));
    expect([...layout.holes.keys()].sort()).toEqual(layout.pieces.map((s) => s.id).sort());
  });

  it("measures exactly this stage's pieces, each inside the stage's slot", () => {
    expect([...layout.boxes.keys()].sort()).toEqual(layout.pieces.map((s) => s.id).sort());
    for (const { shape, box } of placed) {
      // Fitting every piece inside one slot is what keeps the checks below true
      // for a piece of any proportions, not just for a square animal.
      expect(box.size.width).toBeLessThanOrEqual(slotSize);
      expect(box.size.height).toBeLessThanOrEqual(slotSize);
      expect(Math.max(box.size.width, box.size.height)).toBeCloseTo(slotSize);
      expect(box.size).toEqual({
        width: shape.box.width * box.scale,
        height: shape.box.height * box.scale,
      });
    }
  });

  it("keeps every hole inside the scenery, above the tray", () => {
    for (const { hole, box } of placed) {
      expect(hole.x).toBeGreaterThanOrEqual(0);
      expect(hole.x + box.size.width).toBeLessThanOrEqual(width);
      expect(hole.y).toBeGreaterThanOrEqual(0);
      expect(hole.y + box.size.height).toBeLessThanOrEqual(layout.trayTop + box.size.height);
    }
  });

  it("keeps snap zones from overlapping each other", () => {
    const zones = placed.map(({ hole, box }) => ({
      center: boxCenter(hole, box.size),
      radius: box.snapRadius,
    }));
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i]!;
        const b = zones[j]!;
        // Neither centre may sit inside the other's zone, whichever of the two
        // pieces is the more forgiving one.
        expect(distance(a.center, b.center)).toBeGreaterThan(Math.max(a.radius, b.radius));
      }
    }
  });

  it("provides one tray slot per animal, all on canvas and below the tray line", () => {
    expect(layout.traySlots).toHaveLength(placed.length);
    for (const slot of layout.traySlots) {
      // A slot holds whichever piece is shuffled into it, so it is checked at
      // the full slot size rather than at any one piece's bounds.
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x + slotSize).toBeLessThanOrEqual(width);
      expect(slot.y).toBeGreaterThanOrEqual(layout.trayTop);
      expect(slot.y + slotSize).toBeLessThanOrEqual(height);
    }
  });

  it("does not overlap tray slots with each other", () => {
    const slots = layout.traySlots;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i]!;
        const b = slots[j]!;
        const overlaps = Math.abs(a.x - b.x) < slotSize && Math.abs(a.y - b.y) < slotSize;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("does not let a tray slot sit inside a hole's snap zone", () => {
    for (const slot of layout.traySlots) {
      for (const { hole, box } of placed) {
        // Measured with the piece's own bounds at both ends: this is where that
        // piece would sit if it were left in that slot.
        const gap = distance(boxCenter(slot, box.size), boxCenter(hole, box.size));
        expect(gap).toBeGreaterThan(box.snapRadius);
      }
    }
  });

  it("keeps pieces big enough for a toddler to grab", () => {
    // A piece narrower than a tenth of the canvas would be a fiddly target on a
    // small screen, however many animals the stage has.
    expect(slotSize / width).toBeGreaterThan(0.1);
  });
});

/**
 * Every animal is authored square, so the layout would happily go on assuming
 * one square piece size until the first jigsaw piece or triangle arrived. These
 * stand-ins are deliberately not square, in both directions.
 */
const PLANK: PieceShape = {
  id: pieceId("test:plank"),
  outline: "",
  artwork: "",
  box: { width: 300, height: 100 },
  anchor: { x: 150, y: 100 },
  label: "plank",
};

const POLE: PieceShape = {
  id: pieceId("test:pole"),
  outline: "",
  artwork: "",
  box: { width: 100, height: 300 },
  anchor: { x: 50, y: 300 },
  label: "pole",
};

describe("pieces that are not square", () => {
  const cast = [PLANK, POLE, SHAPES[0]!];

  it("stands them on the same ground line as a square piece", () => {
    // Landscape puts a stage's whole cast on one ground line, so a piece that
    // is not square floating or sinking shows up as a difference here.
    const layout = buildStageLayout("landscape", 1, cast);
    const grounds = cast.map((shape) => groundOf(layout, shape));
    for (const ground of grounds) expect(ground).toBeCloseTo(grounds[0]!);
  });

  for (const id of ORIENTATIONS) {
    const layout = buildStageLayout(id, 1, cast);
    const boxes = cast.map((shape) => boxOf(layout, shape.id));

    describe(`${id} layout`, () => {
      it("keeps each piece's own proportions", () => {
        for (const [index, shape] of cast.entries()) {
          const box = boxes[index]!;
          expect(box.size.width / box.size.height).toBeCloseTo(shape.box.width / shape.box.height);
        }
        expect(boxes[0]!.size.width).toBeCloseTo(layout.slotSize);
        expect(boxes[0]!.size.height).toBeCloseTo(layout.slotSize / 3);
        expect(boxes[1]!.size.width).toBeCloseTo(layout.slotSize / 3);
        expect(boxes[1]!.size.height).toBeCloseTo(layout.slotSize);
      });

      it("keeps every hole on canvas on both axes", () => {
        for (const [index, shape] of cast.entries()) {
          const hole = holeOf(layout, shape.id);
          const { size } = boxes[index]!;
          expect(hole.x).toBeGreaterThanOrEqual(0);
          expect(hole.y).toBeGreaterThanOrEqual(0);
          expect(hole.x + size.width).toBeLessThanOrEqual(layout.canvas.width);
          expect(hole.y + size.height).toBeLessThanOrEqual(layout.canvas.height);
        }
      });

      it("gives a thin piece a tighter radius than a square one", () => {
        // Two thirds of the piece, per piece: a radius taken from the plank's
        // width would reach three times further than the plank is tall, so a
        // drop nowhere near it vertically would still count as in.
        for (const box of boxes) {
          expect(box.snapRadius).toBe(Math.round(Math.min(box.size.width, box.size.height) * 0.68));
        }
        expect(boxes[0]!.snapRadius).toBeLessThan(boxes[2]!.snapRadius);
        expect(boxes[1]!.snapRadius).toBeLessThan(boxes[2]!.snapRadius);
      });

      it("clamps a thin piece to the canvas by its own bounds", () => {
        for (const box of boxes) {
          const corner = clampToCanvas({ x: 9999, y: 9999 }, box.size, layout.canvas);
          expect(corner).toEqual({
            x: layout.canvas.width - box.size.width,
            y: layout.canvas.height - box.size.height,
          });
          // Reachable: the far corner of the canvas is still inside the piece.
          expect(corner.x + box.size.width).toBe(layout.canvas.width);
          expect(corner.y + box.size.height).toBe(layout.canvas.height);
        }
      });
    });
  }
});

describe("chooseLayout", () => {
  const cast = (stage: number) => pickStagePieces(stage, SHAPES);

  it("uses the portrait reflow only when taller than wide", () => {
    expect(chooseLayout({ width: 1280, height: 800 }, 1, cast(1)).id).toBe("landscape");
    expect(chooseLayout({ width: 1024, height: 1024 }, 2, cast(2)).id).toBe("landscape");
    expect(chooseLayout({ width: 390, height: 844 }, 3, cast(3)).id).toBe("portrait");
  });

  it("rejects a stage that does not exist rather than showing an empty board", () => {
    expect(() => chooseLayout({ width: 1280, height: 800 }, 0, cast(1))).toThrow();
    expect(() => chooseLayout({ width: 1280, height: 800 }, STAGE_COUNT + 1, cast(1))).toThrow();
  });

  it("rejects a cast that does not fill the stage rather than leaving a gap", () => {
    expect(() => chooseLayout({ width: 1280, height: 800 }, 2, cast(1))).toThrow();
    expect(() => chooseLayout({ width: 390, height: 844 }, 1, cast(3))).toThrow();
  });

  it("fills a decent share of the viewport in both orientations", () => {
    const cases = [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
    ];
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      for (const viewport of cases) {
        const layout = chooseLayout(viewport, stage, cast(stage));
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

describe("seededRandom", () => {
  it("replays the same sequence for the same seed", () => {
    const draw = (seed: number) => Array.from({ length: 5 }, seededRandom(seed));
    expect(draw(99)).toEqual(draw(99));
    expect(draw(99)).not.toEqual(draw(100));
  });

  it("stays inside the range Math.random promises", () => {
    const next = seededRandom(1234);
    for (let i = 0; i < 500; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
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
