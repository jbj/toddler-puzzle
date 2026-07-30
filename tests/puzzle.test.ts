import { describe, expect, it } from "vitest";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor } from "../src/assets";
import {
  boxCenter,
  clampInkToCanvas,
  clampToCanvas,
  distance,
  fitScale,
  isWithinSnapRadius,
  padWithin,
  screenToLogical,
  seededRandom,
  shuffle,
  type Point,
  type Rect,
} from "../src/geometry";
import {
  GRAB_PADDING,
  boxOf,
  buildLayout,
  buildLevelLayout,
  chooseLayout,
  holeOf,
  inkSnapRadius,
  trayHome,
  type Layout,
} from "../src/layout";
import { LEVELS, LEVEL_COUNT, dealPieces, levelSpec, type LevelSpec } from "../src/levels";
import { pieceId, type PieceShape } from "../src/piece";
import { SCENES, sceneShapes, scenesOf } from "../src/scenes";
import { jigsawShapes } from "../src/jigsaw";
import { loadPictures } from "../src/pictures";
import { shatterShapes } from "../src/shatter";
import { kindFor, loadAllKinds } from "../src/kinds/registry";
import type { Puzzle } from "../src/puzzle";

// The kinds that are chunks of their own are fetched during play in the running
// game; a test wants the lot before it starts.
await loadAllKinds();

/** The kinds that cut one picture up, as opposed to dealing a row of animals. */
const PICTURE_KINDS = new Set(["sliced", "polygon", "jigsaw", "shatter"]);

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
 * Every cast a level could be dealt is a subset of the shapes in some order,
 * which is far too many to enumerate. Rotating the list puts each shape in each
 * position at least once, which is what the layout actually depends on: a hole's
 * height comes from the anchor of whichever piece stands there.
 */
function castsFor(level: LevelSpec): PieceShape[][] {
  return SHAPES.map((_, offset) =>
    Array.from({ length: level.pieces }, (_, index) => SHAPES[(offset + index) % SHAPES.length]!),
  );
}

/** The levels shape-match itself plays, which are the ones a cast of animals fills. */
const ANIMAL_LEVELS = LEVELS.filter((level) => level.kind === "shape-match");

/**
 * The most forgiving level in the table. Snapping is the one promise a level
 * can stretch - `snapForgiveness` multiplies the radius - so the composition is
 * swept at the widest radius any level asks for rather than at a middling one.
 */
const MOST_FORGIVING = LEVELS.reduce((widest, level) =>
  level.snapForgiveness > widest.snapForgiveness ? level : widest,
);

/** The most pieces any of the thirty levels asks a layout to hold. */
const MAX_PIECES = Math.max(...LEVELS.map((level) => level.pieces));

/** The most pieces a level stands on the ground at once. */
const MAX_SCENE_PIECES = 6;

const COUNTS = Array.from({ length: MAX_PIECES }, (_, index) => index + 1);

/** How many casts each piece count is composed for. */
const RUNS = 6;

/** `count` animals in a random order, repeating the list if it runs short. */
function animalCast(count: number, random: () => number): PieceShape[] {
  const dealt = shuffle(SHAPES, random);
  return Array.from({ length: count }, (_, index) => {
    const shape = dealt[index % dealt.length] as PieceShape;
    // A repeat needs an identity of its own; two pieces may not share a hole.
    return index < dealt.length ? shape : { ...shape, id: pieceId(`${shape.id}-${index}`) };
  });
}

/**
 * A cast of `count` pieces of no particular shape: boxes of any proportions,
 * standing anywhere in the lower quarter of their box. Every animal is square
 * and stands near the foot of its box, so a cast of animals cannot tell whether
 * the composition reasons about each piece's own reach or merely assumes the
 * proportions of an animal.
 *
 * Pieces that hang further below their line than that are checked separately,
 * at the counts the game plays: twelve pieces that each want two slots of
 * height do not fit a landscape canvas at a size a toddler could grab, and the
 * composition is supposed to say so rather than lay them out anyway.
 */
function oddCast(count: number, random: () => number, sit = 0.75): PieceShape[] {
  return Array.from({ length: count }, (_, index) => {
    const box = {
      width: 60 + Math.round(random() * 240),
      height: 60 + Math.round(random() * 240),
    };
    return {
      id: pieceId(`test:piece-${index}`),
      outline: "",
      artwork: "",
      box,
      anchor: { x: box.width / 2, y: Math.round((sit + (1 - sit) * random()) * box.height) },
      label: `piece ${index}`,
    };
  });
}

const castFor = (count: number, run: number): PieceShape[] => {
  const random = seededRandom(count * 100 + run);
  return run % 2 === 0 ? animalCast(count, random) : oddCast(count, random);
};

/**
 * A cast where several pieces aim at one target: one or two animals, each dealt
 * as `slices` pieces that keep the animal's whole box - they have to, or they
 * would not assemble - and draw only their own part of it.
 *
 * The parts are a plain grid rather than the real recipes, which is what makes
 * this a layout check rather than a slicing one: a real slice's drawing sits
 * inside the grid cell it was cut from, so a grid is the worst case the
 * composition has to hold for.
 */
function slicedCast(
  animals: number,
  slices: number,
  random: () => number,
): { pieces: PieceShape[]; targets: PieceShape[] } {
  const targets = animalCast(animals, random);
  const columns = slices > 2 ? 2 : slices;
  const rows = Math.ceil(slices / columns);
  const pieces = targets.flatMap((animal) =>
    Array.from({ length: slices }, (_, index) => ({
      ...animal,
      id: pieceId(`slice:${animal.id}:${index}`),
      inked: {
        x: ((index % columns) * animal.box.width) / columns,
        y: (Math.floor(index / columns) * animal.box.height) / rows,
        width: animal.box.width / columns,
        height: animal.box.height / rows,
      },
    })),
  );
  return { pieces, targets };
}

/** Every shape of sliced level the table asks for, in both orientations. */
const SLICED: readonly Layout[] = ORIENTATIONS.flatMap((id) =>
  [1, 2].flatMap((animals) =>
    [2, 3, 4].flatMap((slices) =>
      Array.from({ length: RUNS }, (_, run) => {
        const { pieces, targets } = slicedCast(animals, slices, seededRandom(run + animals * 7));
        return buildLayout(id, MOST_FORGIVING, pieces, targets);
      }),
    ),
  ),
);

/** The levels a polygon scene is built for. */
const POLYGON_LEVELS = LEVELS.filter((level) => level.kind === "polygon");

/**
 * Every polygon scene at every polygon level, in both orientations - the real
 * shapes rather than stand-ins, because a scene is authored by hand and it is
 * the authoring that could put a part in it too small to grab.
 */
const POLYGON: readonly Layout[] = ORIENTATIONS.flatMap((id) =>
  POLYGON_LEVELS.flatMap((level) =>
    scenesOf(level.pieces).map((scene) => {
      const { picture, parts } = sceneShapes(scene);
      return buildLevelLayout(id, level, parts, [picture]);
    }),
  ),
);

/** The levels a picture is cut into jigsaw pieces for. */
const JIGSAW_LEVELS = LEVELS.filter((level) => level.kind === "jigsaw");

/**
 * Every grid the table cuts a picture at, over every scene in the library, in
 * both orientations - the real cut rather than a stand-in, because a jigsaw
 * piece's drawing is its cell plus whatever tabs happened to point outwards,
 * and it is the tabs that decide how big a tray cell has to be.
 */
const JIGSAW: readonly Layout[] = ORIENTATIONS.flatMap((id) =>
  JIGSAW_LEVELS.flatMap((level) =>
    loadPictures().map((picture) => {
      const grid = level.options?.grid as { columns: number; rows: number };
      const { frame, pieces } = jigsawShapes(picture, grid, seededRandom(level.level));
      return buildLevelLayout(id, level, pieces, [frame]);
    }),
  ),
);

/** The levels a picture is shattered for. */
const SHATTER_LEVELS = LEVELS.filter((level) => level.kind === "shatter");

/** How many deals of a shattered level the sweep composes. */
const SHATTER_DEALS = 8;

/**
 * Every shatter level, over every scene in the library, dealt several times in
 * both orientations - the real cut rather than a stand-in, because no two
 * shatters are alike and it is the largest shard of a deal that decides how big
 * a tray cell has to be. One layout of one lucky deal would prove nothing.
 */
const SHATTER: readonly Layout[] = ORIENTATIONS.flatMap((id) =>
  SHATTER_LEVELS.flatMap((level) =>
    loadPictures().flatMap((picture) =>
      Array.from({ length: SHATTER_DEALS }, (_, deal) => {
        const { frame, pieces } = shatterShapes(picture, level.pieces, seededRandom(deal));
        return buildLevelLayout(id, level, pieces, [frame]);
      }),
    ),
  ),
);

/**
 * Every composition the thirty levels could ask for: each piece count, in both
 * orientations, over a spread of casts of both kinds. Layouts are composed
 * rather than tabulated, so what is worth checking is the properties they
 * promise for any cast, not the coordinates of one lucky deal.
 */
const COMPOSED: readonly Layout[] = ORIENTATIONS.flatMap((id) =>
  COUNTS.flatMap((count) =>
    Array.from({ length: RUNS }, (_, run) => buildLayout(id, MOST_FORGIVING, castFor(count, run))),
  ),
);

/** A representative handful, for checks that do not need all of them. */
const LAYOUTS: readonly Layout[] = COMPOSED.filter((_, index) => index % 17 === 0);

/** Each target standing in a layout's scene, with its hole and its bounds. */
const placementsOf = (layout: Layout) =>
  layout.targets.map((shape) => ({
    shape,
    hole: holeOf(layout, shape.id),
    box: boxOf(layout, shape.id),
  }));

/**
 * The cell cut for a piece. A missing one is a broken layout rather than a
 * failed promise, and saying which piece here is the difference between that
 * and an undefined turning up as a NaN three checks later.
 */
const cellFor = (layout: Layout, id: PieceShape["id"]): Rect => {
  const cell = layout.trayCells.get(id);
  if (!cell) throw new Error(`The layout cut no tray cell for "${id}".`);
  return cell;
};

/** Each piece waiting in the tray, with the cell that was cut for it. */
const waitingOf = (layout: Layout) =>
  layout.pieces.map((shape) => ({
    shape,
    box: boxOf(layout, shape.id),
    cell: cellFor(layout, shape.id),
    home: trayHome(layout, shape.id),
  }));

/** Is `inner` wholly inside `outer`? Half a unit of slack for the rounding. */
const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Report every layout in `layouts` that breaks `promise`, rather than only the
 * first: a composition that fails at nine pieces and not at three has a lot
 * more to say than one failure does.
 */
function complaintsFrom(
  layouts: readonly Layout[],
  promise: (layout: Layout) => string | null,
): string[] {
  return layouts.flatMap((layout) => {
    const complaint = promise(layout);
    return complaint === null ? [] : [`${layout.id} of ${layout.pieces.length}: ${complaint}`];
  });
}

/** The first complaint from a per-piece check, or null when every piece is fine. */
const firstComplaint = (complaints: (string | null)[]): string | null =>
  complaints.find((complaint) => complaint !== null) ?? null;

/** Where a piece's anchor lands once it is standing in its hole. */
const groundOf = (layout: Layout, shape: PieceShape): number =>
  holeOf(layout, shape.id).y + shape.anchor.y * boxOf(layout, shape.id).scale;

describe("anchors", () => {
  it("stands every piece on one ground line, whatever its anchor", () => {
    for (const level of ANIMAL_LEVELS) {
      for (const cast of castsFor(level)) {
        // Landscape spreads a level's whole cast along one ground line, so any
        // difference here is a piece floating or sinking rather than standing.
        const layout = buildLevelLayout("landscape", level, cast);
        expect(layout.groundLines).toHaveLength(1);
        const grounds = layout.pieces.map((shape: PieceShape) => groundOf(layout, shape));
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

describe("clampInkToCanvas", () => {
  const BOX = { x: 0, y: 0, width: 190, height: 190 };

  it("matches the plain clamp for a piece that fills its box", () => {
    for (const corner of [
      { x: -500, y: -500 },
      { x: 9999, y: 9999 },
      { x: 300, y: 200 },
    ]) {
      const inked = clampInkToCanvas(corner, BOX, CANVAS);
      expect(inked).toEqual(clampToCanvas(corner, PIECE, CANVAS));
    }
  });

  it("lets a piece drawn in a corner of its box reach the far corner", () => {
    // A slice cut from the bottom-right of an animal. Clamped by its box it
    // would stop a whole animal short of the top-left corner - out of reach of
    // the very hole it belongs in.
    const corner = { x: 120, y: 120, width: 120, height: 120 };
    expect(clampInkToCanvas({ x: -999, y: -999 }, corner, CANVAS)).toEqual({ x: -120, y: -120 });
    expect(clampInkToCanvas({ x: 9999, y: 9999 }, corner, CANVAS)).toEqual({
      x: CANVAS.width - 240,
      y: CANVAS.height - 240,
    });
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
  const padding = GRAB_PADDING * Math.min(BOX.width, BOX.height);

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
    const tray = boxCenter(trayHome(layout, piece), size);
    expect(isWithinSnapRadius(tray, hole, snapRadius)).toBe(false);
  });
});

describe("buildLevelLayout", () => {
  it("composes a landscape and a portrait layout for every level", () => {
    for (const level of ANIMAL_LEVELS) {
      const cast = dealPieces(level, SHAPES);
      expect(chooseLayout({ width: 1280, height: 800 }, level, cast).level).toBe(level);
      expect(chooseLayout({ width: 390, height: 844 }, level, cast).level).toBe(level);
    }
  });

  it("rejects building a layout from duplicate piece ids", () => {
    const duplicateId = SHAPES[0]!.id;
    const duplicateIds = [SHAPES[0]!, { ...SHAPES[1]!, id: duplicateId }];
    expect(() => buildLayout("landscape", levelSpec(1), duplicateIds)).toThrow(
      new RegExp(`duplicate .*"${duplicateId}"`, "i"),
    );
  });
});

/**
 * What a composition promises, whatever the cast and whatever the count. The
 * layout is generated rather than tabulated, so these are what is worth
 * checking: not the coordinates of one lucky deal, but the properties every
 * deal has to have. Each returns what is wrong with a layout, or null.
 */
const PROMISES = {
  "gives every piece a target, a box and a tray cell": (layout) => {
    const wanted = layout.pieces.length;
    const aimed = layout.targets.length;
    if (layout.holes.size !== aimed) return `${layout.holes.size} holes for ${aimed} targets`;
    const measured = new Set([...layout.pieces, ...layout.targets].map((shape) => shape.id));
    if (layout.boxes.size !== measured.size) {
      return `${layout.boxes.size} boxes for ${measured.size} pieces and targets`;
    }
    if (layout.trayCells.size !== wanted) {
      return `${layout.trayCells.size} tray cells for ${wanted} pieces`;
    }
    return null;
  },

  // Fitting every piece inside one square slot is what keeps the rest of these
  // true for a piece of any proportions, not only for a square animal.
  "fits every piece inside the slot, whatever its proportions": (layout) =>
    firstComplaint(
      [...placementsOf(layout), ...waitingOf(layout)].map(({ shape, box }) => {
        const { width, height } = box.size;
        if (width > layout.slotSize + 0.5 || height > layout.slotSize + 0.5) {
          return `${shape.id} is ${width}x${height} in a ${layout.slotSize} slot`;
        }
        if (Math.abs(Math.max(width, height) - layout.slotSize) > 0.5) {
          return `${shape.id} does not fill its slot on its longer side`;
        }
        if (Math.abs(width / height - shape.box.width / shape.box.height) > 1e-9) {
          return `${shape.id} is drawn out of proportion`;
        }
        return null;
      }),
    ),

  "keeps every target fully on canvas and clear of the tray": (layout) =>
    firstComplaint(
      placementsOf(layout).map(({ shape, hole, box }) => {
        const right = hole.x + box.size.width;
        const bottom = hole.y + box.size.height;
        if (hole.x < 0 || right > layout.canvas.width) {
          return `${shape.id} runs off the side of the canvas`;
        }
        if (hole.y < 0) return `${shape.id} runs off the top of the canvas`;
        // Box and all, not just the anchor: a target the tray covers is a
        // target a piece cannot be dropped into.
        if (hole.y < layout.sceneTop) return `${shape.id} reaches into the tray`;
        if (bottom > layout.canvas.height) return `${shape.id} runs off the bottom of the canvas`;
        return null;
      }),
    ),

  // The ground line is the whole idea of the composition: a row of pieces
  // stands on a line of ground, however differently each one sits in its box.
  "stands every piece on one of the ground lines": (layout) =>
    firstComplaint(
      placementsOf(layout).map(({ shape, hole, box }) => {
        const ground = hole.y + shape.anchor.y * box.scale;
        const nearest = Math.min(...layout.groundLines.map((line) => Math.abs(line - ground)));
        return nearest > 0.5 ? `${shape.id} stands at ${Math.round(ground)}, off any line` : null;
      }),
    ),

  "keeps snap zones from reaching each other": (layout) => {
    const zones = placementsOf(layout).map(({ shape, hole, box }) => ({
      piece: shape.id,
      center: boxCenter(hole, box.size),
      radius: box.snapRadius,
    }));
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i]!;
        const b = zones[j]!;
        // Whichever of the two is the more forgiving: a generous radius may not
        // reach its neighbour's target, or a piece could snap into the wrong one.
        if (distance(a.center, b.center) <= Math.max(a.radius, b.radius)) {
          return `${a.piece} and ${b.piece} have snap zones that reach each other`;
        }
      }
    }
    return null;
  },

  "keeps every tray cell on canvas, on one of the tray's bands": (layout) => {
    const canvas = { x: 0, y: 0, ...layout.canvas };
    for (const { shape, cell } of waitingOf(layout)) {
      if (!inside(cell, canvas)) return `${shape.id}'s cell runs off the canvas`;
      // The tray is a band across the top, or a pair of columns down the sides
      // where a solitary picture leaves the middle of the board to itself. A
      // cell has to be wholly on one of them either way: what the promise is
      // about is a piece waiting somewhere that reads as shelved rather than
      // dropped, not the shape of the shelving.
      if (!layout.trayBands.some((band) => inside(cell, band.rect))) {
        return `${shape.id}'s cell is not on any tray band`;
      }
    }
    return null;
  },

  // Where a piece actually ends up, which for a piece smaller than its box is
  // not the cell's own corner: the ink is centred in the cell and the empty
  // part of the box hangs outside it.
  "keeps every waiting piece's drawing inside the tray": (layout) =>
    firstComplaint(
      waitingOf(layout).map(({ shape, box, home }) => {
        const drawn = {
          x: home.x + box.ink.x,
          y: home.y + box.ink.y,
          width: box.ink.width,
          height: box.ink.height,
        };
        if (!inside(drawn, { x: 0, y: 0, ...layout.canvas })) {
          return `${shape.id} waits off the canvas`;
        }
        if (!layout.trayBands.some((band) => inside(drawn, band.rect))) {
          return `${shape.id} waits outside the tray`;
        }
        return null;
      }),
    ),

  "keeps tray cells from overlapping each other": (layout) => {
    const waiting = waitingOf(layout);
    for (let i = 0; i < waiting.length; i++) {
      for (let j = i + 1; j < waiting.length; j++) {
        const a = waiting[i]!;
        const b = waiting[j]!;
        if (overlaps(a.cell, b.cell)) return `${a.shape.id} and ${b.shape.id} overlap in the tray`;
      }
    }
    return null;
  },

  "keeps every tray cell out of every target's snap zone": (layout) => {
    // Measured from what each piece *draws* at both ends, which is what a kind
    // whose pieces share one big box snaps by, and the same circle as the box
    // for a piece that fills it. A cell now belongs to one piece rather than
    // holding whichever was shuffled into it, so this asks the question that is
    // actually on the board: could the piece waiting there snap from where it
    // stands?
    for (const { shape, box, home } of waitingOf(layout)) {
      const drawn = (at: Point): Point =>
        boxCenter({ x: at.x + box.ink.x, y: at.y + box.ink.y }, box.ink);
      const radius = Math.max(inkSnapRadius(layout, shape.id), 0);
      for (const target of placementsOf(layout)) {
        if (distance(drawn(home), drawn(target.hole)) <= radius) {
          return `${shape.id} would snap home from its tray cell`;
        }
      }
    }
    return null;
  },

  // A piece narrower than a tenth of the canvas is a fiddly target for a small
  // hand, however many pieces the level asks for.
  "keeps every piece big enough for a toddler to grab": (layout) => {
    if (layout.slotSize / layout.canvas.width <= 0.1) {
      return `a ${layout.slotSize} slot on a ${layout.canvas.width} canvas is too small to grab`;
    }
    // The slot is what a target is drawn to; what a hand has to find is the
    // piece's own drawing, which for a slice is a fraction of that.
    return firstComplaint(
      waitingOf(layout).map(({ shape, box }) => {
        const drawn = Math.max(box.ink.width, box.ink.height) / layout.canvas.width;
        return drawn > 0.08 ? null : `${shape.id} draws ${(drawn * 100).toFixed(1)}% of the canvas`;
      }),
    );
  },
} satisfies Record<string, (layout: Layout) => string | null>;

const PROMISED = Object.entries(PROMISES);

describe("composed layouts", () => {
  it("composes every piece count the levels ask for, in both orientations", () => {
    expect(COMPOSED).toHaveLength(ORIENTATIONS.length * COUNTS.length * RUNS);
  });

  it.each(PROMISED)("%s, at every count in both orientations", (_name, promise) => {
    expect(complaintsFrom(COMPOSED, promise)).toEqual([]);
  });

  it("keeps every promise for pieces that hang below their line", () => {
    // An anchor is where a piece sits, which need not be at its feet: anchored
    // at the top of its box, a piece hangs its whole self below its line and
    // wants two slots of height. Checked at the counts a scene plays, because
    // twelve of those do not fit a landscape canvas at a size worth having.
    const hanging = ORIENTATIONS.flatMap((id) =>
      COUNTS.filter((count) => count <= MAX_SCENE_PIECES).flatMap((count) =>
        Array.from({ length: RUNS }, (_, run) =>
          buildLayout(id, MOST_FORGIVING, oddCast(count, seededRandom(count * 31 + run), 0)),
        ),
      ),
    );
    for (const [name, promise] of PROMISED) {
      expect(complaintsFrom(hanging, promise), name).toEqual([]);
    }
  });

  it("keeps every promise for every level of the thirty, as it is played", () => {
    // The sweep above uses the widest snap radius in the table at every count.
    // This is the other way round: each level exactly as a child meets it, at
    // its own forgiveness, over a spread of casts. A level whose numbers the
    // composition cannot honour is a level that must not be in the table.
    const levels = ORIENTATIONS.flatMap((id) =>
      LEVELS.flatMap((level) => {
        return Array.from({ length: RUNS }, (_, run) =>
          buildLayout(id, level, castFor(level.pieces, run)),
        );
      }),
    );
    for (const [name, promise] of PROMISED) {
      expect(complaintsFrom(levels, promise), name).toEqual([]);
    }
  });

  it("shrinks the pieces as the board fills up", () => {
    // Not step by step: three pieces leave a row ragged where four fill it, so
    // a board of four can compose a shade better than a board of three. The
    // ramp is what holds - twice as many pieces are never bigger ones.
    for (const id of ORIENTATIONS) {
      for (let run = 0; run < RUNS; run++) {
        const cast = castFor(MAX_PIECES, run);
        const slots = COUNTS.map(
          (count) => buildLayout(id, MOST_FORGIVING, cast.slice(0, count)).slotSize,
        );
        for (const count of COUNTS) {
          const doubled = slots[count * 2 - 1];
          if (doubled !== undefined) expect(doubled).toBeLessThanOrEqual(slots[count - 1]!);
        }
      }
    }
  });

  it("reflows rather than shrinking: portrait stacks what landscape spreads", () => {
    // Letterboxing the landscape composition onto an upright phone would leave
    // the pieces too small to grab, so portrait spends the height it has: never
    // fewer rows of ground than landscape, and always a bigger piece for the
    // width it has to play with. The share is the point rather than the row
    // count - the same cast can want two rows on either canvas and still be
    // drawn half again as large on the narrow one.
    for (const count of COUNTS.filter((one) => one >= 3)) {
      for (let run = 0; run < RUNS; run++) {
        const cast = castFor(count, run);
        const landscape = buildLayout("landscape", MOST_FORGIVING, cast);
        const portrait = buildLayout("portrait", MOST_FORGIVING, cast);
        expect(portrait.groundLines.length).toBeGreaterThanOrEqual(landscape.groundLines.length);
        expect(portrait.slotSize / portrait.canvas.width).toBeGreaterThan(
          landscape.slotSize / landscape.canvas.width,
        );
      }
    }
  });

  it("composes the same layout twice for the same cast", () => {
    for (const count of COUNTS) {
      const cast = castFor(count, 0);
      expect(buildLayout("portrait", MOST_FORGIVING, cast)).toEqual(
        buildLayout("portrait", MOST_FORGIVING, cast),
      );
    }
  });

  it("refuses a cast too big to compose rather than shrinking it away", () => {
    // Nothing stops a level asking for sixty pieces. What the composition must
    // not do is answer with pieces no toddler could pick up.
    for (const id of ORIENTATIONS) {
      expect(() => buildLayout(id, MOST_FORGIVING, animalCast(60, seededRandom(3)))).toThrow(
        /too small/i,
      );
      expect(() => buildLayout(id, MOST_FORGIVING, [])).toThrow(/at least one piece/i);
    }
  });
});

describe("layouts where several pieces fill one target", () => {
  it("composes every sliced level shape, in both orientations", () => {
    expect(SLICED).toHaveLength(ORIENTATIONS.length * 2 * 3 * RUNS);
  });

  it.each(PROMISED)("%s, for one or two animals in two to four slices", (_name, promise) => {
    expect(complaintsFrom(SLICED, promise)).toEqual([]);
  });

  it("cuts one hole per animal, not one per slice", () => {
    for (const layout of SLICED) {
      expect(layout.holes.size).toBe(layout.targets.length);
      expect(layout.holes.size).toBeLessThan(layout.pieces.length);
      expect(layout.trayCells.size).toBe(layout.pieces.length);
    }
  });

  it("draws every slice at its own animal's scale", () => {
    // The whole reason a slice keeps the animal's box: assembled at one scale
    // on one origin, the slices are the animal again, without any arithmetic.
    for (const layout of SLICED) {
      for (const target of layout.targets) {
        const whole = boxOf(layout, target.id);
        const slices = layout.pieces.filter((piece) => piece.id.startsWith(`slice:${target.id}:`));
        expect(slices.length).toBeGreaterThan(1);
        for (const slice of slices) {
          expect(boxOf(layout, slice.id).scale).toBe(whole.scale);
          expect(boxOf(layout, slice.id).size).toEqual(whole.size);
        }
      }
    }
  });

  it("stands a bigger animal than a board of that many whole animals would", () => {
    // A tray of slices is packed by what each slice draws, not by the animal's
    // box around it, which is what leaves the animal room to be big enough that
    // a quarter of it is still worth grabbing.
    for (const id of ORIENTATIONS) {
      for (const slices of [2, 3, 4]) {
        const { pieces, targets } = slicedCast(2, slices, seededRandom(slices));
        const sliced = buildLayout(id, MOST_FORGIVING, pieces, targets);
        const whole = buildLayout(id, MOST_FORGIVING, animalCast(pieces.length, seededRandom(1)));
        // Never smaller, and strictly bigger once the board is busy enough for
        // the tray to have been what held the animals down.
        expect(sliced.slotSize).toBeGreaterThanOrEqual(whole.slotSize);
        if (pieces.length >= 6) expect(sliced.slotSize).toBeGreaterThan(whole.slotSize);
      }
    }
  });

  it("caps how big a piece is drawn rather than how big its box is", () => {
    // A board of one whole animal is the biggest anything is ever drawn: with
    // one piece nothing else is competing for the canvas, so the ceiling is the
    // only thing holding it, and it is holding it exactly.
    for (const id of ORIENTATIONS) {
      const alone = buildLayout(
        id,
        MOST_FORGIVING,
        animalCast(1, () => 0.5),
      );
      for (const layout of SLICED.filter((one) => one.id === id)) {
        for (const piece of layout.pieces) {
          const { ink } = boxOf(layout, piece.id);
          expect(Math.max(ink.width, ink.height)).toBeLessThanOrEqual(alone.slotSize);
        }
      }
      // And the ceiling is on the drawing, so a cast that draws a corner of its
      // box goes past it: the animal a quarter-slice belongs to is drawn bigger
      // than a whole animal alone on the board, which is the point - a quarter
      // of a big animal is worth picking up and a quarter of a small one is not.
      const { pieces, targets } = slicedCast(1, 4, seededRandom(3));
      const sliced = buildLayout(id, MOST_FORGIVING, pieces, targets);
      expect(sliced.slotSize).toBeGreaterThan(alone.slotSize);
    }
  });

  it("centres each piece's drawing in the cell cut for it", () => {
    for (const layout of SLICED) {
      for (const piece of layout.pieces) {
        const home = trayHome(layout, piece.id);
        const { ink } = boxOf(layout, piece.id);
        const cell = layout.trayCells.get(piece.id)!;
        expect(home.x + ink.x + ink.width / 2).toBeCloseTo(cell.x + cell.width / 2);
        expect(home.y + ink.y + ink.height / 2).toBeCloseTo(cell.y + cell.height / 2);
      }
    }
  });

  it("refuses a level whose cast does not match its targets", () => {
    const level = LEVELS.find((one) => one.targets !== one.pieces)!;
    const { pieces, targets } = slicedCast(level.targets, level.pieces / level.targets, () => 0.5);
    expect(() => buildLevelLayout("landscape", level, pieces, targets)).not.toThrow();
    expect(() => buildLevelLayout("landscape", level, pieces, targets.slice(1))).toThrow(
      /targets/i,
    );
    expect(() => buildLevelLayout("landscape", level, pieces.slice(1), targets)).toThrow(/pieces/i);
  });
});

describe("layouts for a picture built out of shapes", () => {
  it("composes every scene at every polygon level, in both orientations", () => {
    const scenes = POLYGON_LEVELS.reduce(
      (total, level) => total + scenesOf(level.pieces).length,
      0,
    );
    expect(POLYGON).toHaveLength(ORIENTATIONS.length * scenes);
    expect(POLYGON.length).toBeGreaterThanOrEqual(ORIENTATIONS.length * SCENES.length);
  });

  it.each(PROMISED)("%s, for every scene in the catalogue", (_name, promise) => {
    expect(complaintsFrom(POLYGON, promise)).toEqual([]);
  });

  it("cuts one hole for the whole picture, not one per shape", () => {
    for (const layout of POLYGON) {
      expect(layout.holes.size).toBe(1);
      expect(layout.trayCells.size).toBe(layout.pieces.length);
      expect(layout.pieces.length).toBeGreaterThan(1);
    }
  });

  it("draws every shape of a picture at the picture's own scale", () => {
    // The reason a part carries the whole scene box: at one scale on one
    // origin, the parts are the picture, without any arithmetic.
    for (const layout of POLYGON) {
      const whole = boxOf(layout, layout.targets[0]!.id);
      for (const part of layout.pieces) {
        expect(boxOf(layout, part.id).scale).toBe(whole.scale);
        expect(boxOf(layout, part.id).size).toEqual(whole.size);
      }
    }
  });

  it("reaches two thirds of what a shape draws, not two thirds of the picture", () => {
    // The box is the whole picture, so the box's own radius would put a roof
    // into a wall. What a piece is measured by is what it draws.
    for (const layout of POLYGON) {
      for (const part of layout.pieces) {
        const { ink, snapRadius } = boxOf(layout, part.id);
        const reach = inkSnapRadius(layout, part.id);
        expect(reach).toBeLessThanOrEqual(snapRadius);
        expect(reach).toBeCloseTo(
          Math.round(Math.min(ink.width, ink.height) * 0.68 * layout.level.snapForgiveness),
        );
      }
    }
  });
});

describe("layouts for a picture cut into jigsaw pieces", () => {
  it("composes every scene at every grid the table cuts at, in both orientations", () => {
    expect(JIGSAW).toHaveLength(ORIENTATIONS.length * JIGSAW_LEVELS.length * loadPictures().length);
  });

  it.each(PROMISED)("%s, for every grid in the level table", (_name, promise) => {
    expect(complaintsFrom(JIGSAW, promise)).toEqual([]);
  });

  it("cuts one hole for the whole picture, not one per piece", () => {
    for (const layout of JIGSAW) {
      expect(layout.holes.size).toBe(1);
      expect(layout.trayCells.size).toBe(layout.pieces.length);
      expect(layout.pieces.length).toBeGreaterThan(1);
    }
  });

  it("draws every piece of a picture at the picture's own scale", () => {
    // The reason a piece carries the whole picture box: at one scale on one
    // origin, the pieces are the picture, without any arithmetic.
    for (const layout of JIGSAW) {
      const whole = boxOf(layout, layout.targets[0]!.id);
      for (const piece of layout.pieces) {
        expect(boxOf(layout, piece.id).scale).toBe(whole.scale);
        expect(boxOf(layout, piece.id).size).toEqual(whole.size);
      }
    }
  });

  it("stands a picture big enough that a piece of it is worth grabbing", () => {
    // The busiest grid is the one to watch: twelve pieces of one picture, each
    // a twelfth of the box the tray is packing by. A picture too small here is
    // a level a child cannot see, and the screenshot run is the only other
    // place it would show up.
    for (const layout of JIGSAW) {
      const drawn = layout.pieces.map((piece) => {
        const { ink } = boxOf(layout, piece.id);
        return Math.max(ink.width, ink.height) / layout.canvas.width;
      });
      expect(Math.min(...drawn), `level ${layout.level.level} ${layout.id}`).toBeGreaterThan(0.09);
    }
  });
});

describe("layouts for a picture shattered into irregular shards", () => {
  it("composes every scene at every shatter level, in both orientations", () => {
    expect(SHATTER).toHaveLength(
      ORIENTATIONS.length * SHATTER_LEVELS.length * loadPictures().length * SHATTER_DEALS,
    );
  });

  it.each(PROMISED)("%s, for every shatter in the level table", (_name, promise) => {
    expect(complaintsFrom(SHATTER, promise)).toEqual([]);
  });

  it("cuts one hole for the whole picture, not one per shard", () => {
    for (const layout of SHATTER) {
      expect(layout.holes.size).toBe(1);
      expect(layout.trayCells.size).toBe(layout.pieces.length);
      expect(layout.pieces.length).toBeGreaterThan(1);
    }
  });

  it("draws every shard of a picture at the picture's own scale", () => {
    for (const layout of SHATTER) {
      const whole = boxOf(layout, layout.targets[0]!.id);
      for (const piece of layout.pieces) {
        expect(boxOf(layout, piece.id).scale).toBe(whole.scale);
        expect(boxOf(layout, piece.id).size).toEqual(whole.size);
      }
    }
  });

  it("stands a picture big enough that the smallest shard is worth grabbing", () => {
    // The trap this kind sets that a jigsaw does not: the shards of one deal
    // are different sizes, the tray packs by the biggest, and the smallest is
    // what a small hand has to find. The floors in `shatter.ts` are what hold
    // them close enough together for this to pass, so lowering one lowers this.
    // The bar is above the composition's own floor of `minPieceInk` rather than
    // at it, so a shard is not merely legal but comfortably grabbable.
    for (const layout of SHATTER) {
      const drawn = layout.pieces.map((piece) => {
        const { ink } = boxOf(layout, piece.id);
        return Math.max(ink.width, ink.height) / layout.canvas.width;
      });
      expect(Math.min(...drawn), `level ${layout.level.level} ${layout.id}`).toBeGreaterThan(0.085);
    }
  });
});

/**
 * How big the board gets, level by level, and the floor under it.
 *
 * This is a *ceiling* test read backwards. A piece a two-year-old can see and
 * grab is the whole point of the layout, and the size of one is an emergent
 * property of a dozen interacting limits in `planFor`: it is very easy to make
 * a piece smaller by accident and impossible to notice from a green suite. So
 * every level's board is measured and held above where it stands today.
 *
 * The numbers are measured, not chosen: the worst of twenty-four deals per
 * level and orientation, shaded down 3% for deals this table has not seen.
 * Three per cent and no more - a floor with room in it is decoration.
 *
 * `slot` is `slotSize / canvas.width`, which for a picture kind is also the
 * assembled picture's width as a share of the canvas, because a picture is
 * drawn exactly one slot across its longer side. `ink` is the smallest piece's
 * longer side over the same width.
 *
 * Raising a number here is a good day. *Lowering* one is a decision, and the
 * pull request that does it has to say which invariant bought the loss.
 *
 * The four sliced numbers at levels 12 and 13 came down when the cow, the pig
 * and the parrot were withdrawn, and they are the exception that proves the
 * rule: no board got smaller. A deal draws from thirteen animals now rather
 * than sixteen, so the same seeds reach casts that were always possible and
 * had simply not come up - a butterfly cut into three, a rabbit beside a
 * giraffe. Each of the four is the worst that cast draws, so what moved is
 * what the sample sees, not what a child gets.
 */
const BOARD_FLOORS: readonly (readonly [number, "landscape" | "portrait", number, number])[] = [
  [1, "landscape", 0.203, 0.203],
  [1, "portrait", 0.291, 0.291],
  [2, "landscape", 0.203, 0.203],
  [2, "portrait", 0.291, 0.291],
  [3, "landscape", 0.203, 0.203],
  [3, "portrait", 0.291, 0.291],
  [4, "landscape", 0.203, 0.203],
  [4, "portrait", 0.291, 0.291],
  [5, "landscape", 0.203, 0.203],
  [5, "portrait", 0.265, 0.265],
  [6, "landscape", 0.203, 0.203],
  [6, "portrait", 0.265, 0.265],
  [7, "landscape", 0.203, 0.203],
  [7, "portrait", 0.274, 0.274],
  [8, "landscape", 0.203, 0.203],
  [8, "portrait", 0.278, 0.278],
  [9, "landscape", 0.164, 0.164],
  [9, "portrait", 0.265, 0.265],
  [10, "landscape", 0.137, 0.137],
  [10, "portrait", 0.265, 0.265],
  [11, "landscape", 0.226, 0.166],
  [11, "portrait", 0.323, 0.239],
  [12, "landscape", 0.245, 0.138],
  [12, "portrait", 0.35, 0.197],
  [13, "landscape", 0.226, 0.107],
  [13, "portrait", 0.323, 0.154],
  [14, "landscape", 0.266, 0.128],
  [14, "portrait", 0.406, 0.19],
  [15, "landscape", 0.214, 0.089],
  [15, "portrait", 0.35, 0.143],
  [16, "landscape", 0.203, 0.095],
  [16, "portrait", 0.291, 0.135],
  [17, "landscape", 0.244, 0.097],
  [17, "portrait", 0.349, 0.139],
  [18, "landscape", 0.244, 0.097],
  [18, "portrait", 0.349, 0.139],
  [19, "landscape", 0.262, 0.087],
  [19, "portrait", 0.388, 0.129],
  [20, "landscape", 0.408, 0.115],
  [20, "portrait", 0.556, 0.158],
  [21, "landscape", 0.336, 0.167],
  [21, "portrait", 0.517, 0.258],
  [22, "landscape", 0.336, 0.167],
  [22, "portrait", 0.517, 0.258],
  [23, "landscape", 0.377, 0.145],
  [23, "portrait", 0.553, 0.214],
  [24, "landscape", 0.377, 0.145],
  [24, "portrait", 0.553, 0.214],
  [25, "landscape", 0.311, 0.103],
  [25, "portrait", 0.562, 0.187],
  [26, "landscape", 0.341, 0.137],
  [26, "portrait", 0.471, 0.201],
  [27, "landscape", 0.193, 0.074],
  [27, "portrait", 0.364, 0.137],
  [28, "landscape", 0.262, 0.085],
  [28, "portrait", 0.491, 0.166],
  [29, "landscape", 0.311, 0.103],
  [29, "portrait", 0.562, 0.187],
  [30, "landscape", 0.311, 0.09],
  [30, "portrait", 0.515, 0.149],
];

describe("how big the board gets", () => {
  /**
   * Dealt for real, kind by kind, rather than assembled from a cast of animals:
   * a jigsaw piece's shape is what decides how much room the tray asks for, and
   * a stand-in square would measure a board nobody plays.
   */
  const dealt = (level: LevelSpec, run: number): Puzzle =>
    kindFor(level).deal({ level, shapes: SHAPES }, seededRandom(level.level * 101 + run));

  const DEALS = 12;

  for (const [number, orientation, slotFloor, inkFloor] of BOARD_FLOORS) {
    const level = levelSpec(number);
    it(`keeps level ${number} in ${orientation} at ${slotFloor} of the canvas (${level.kind})`, () => {
      let worstSlot = Infinity;
      let worstInk = Infinity;
      for (let run = 0; run < DEALS; run++) {
        const puzzle = dealt(level, run);
        if (puzzle.pieces.length === 0) continue;
        const layout = buildLevelLayout(orientation, level, puzzle.pieces, puzzle.targets);
        worstSlot = Math.min(worstSlot, layout.slotSize / layout.canvas.width);
        for (const piece of layout.pieces) {
          const { ink } = boxOf(layout, piece.id);
          worstInk = Math.min(worstInk, Math.max(ink.width, ink.height) / layout.canvas.width);
        }
      }
      expect(worstSlot).toBeGreaterThanOrEqual(slotFloor);
      expect(worstInk).toBeGreaterThanOrEqual(inkFloor);
    });
  }

  /**
   * The assembled picture and the slot are the same measurement for a picture
   * kind, and this is what says so - so the floors above can be read as what
   * the child is rebuilding rather than as an internal unit.
   */
  it("draws a picture one slot across, so the floors above are the picture's own size", () => {
    for (const level of LEVELS.filter((one) => PICTURE_KINDS.has(one.kind))) {
      const puzzle = dealt(level, 0);
      for (const orientation of ORIENTATIONS) {
        const layout = buildLevelLayout(orientation, level, puzzle.pieces, puzzle.targets);
        const target = layout.targets[0] as { id: PieceShape["id"] };
        const picture = boxOf(layout, target.id).size;
        expect(Math.max(picture.width, picture.height)).toBeCloseTo(layout.slotSize, 6);
      }
    }
  });
});

/**
 * The board on an iPad, driven at the real viewport sizes rather than reasoned
 * about. `chooseLayout` picks an orientation from the viewport and then composes
 * on one of two fixed canvases; the canvas letterboxes into the viewport with
 * `xMidYMid meet`. An iPad is nearer 1:1.4 than the portrait canvas's 1:1.7, so
 * portrait pillarboxes - the floors are canvas-relative and still hold, but the
 * board does not fill the screen. This measures that waste as a number rather
 * than letting it drift, and proves a piece stays grabbably large in *device*
 * pixels once the letterbox scale is applied. Split View and Slide Over are the
 * narrow widths a multitasking iPad can hand the game, and the case most likely
 * to break a layout, so they are swept too.
 */
describe("on an iPad", () => {
  const dealt = (level: LevelSpec, run: number): Puzzle =>
    kindFor(level).deal({ level, shapes: SHAPES }, seededRandom(level.level * 101 + run));

  const DEALS = 8;

  /**
   * `name`, the viewport in CSS points, the orientation the game must pick, and
   * the least of the screen the board may cover once it has letterboxed. The
   * coverage floors are measured from this suite, shaded down a hair; a smaller
   * number than the one measured is a finding to look at, not to paper over.
   */
  const IPAD_VIEWPORTS: readonly (readonly [
    string,
    { width: number; height: number },
    "landscape" | "portrait",
    number,
  ])[] = [
    ["mini portrait", { width: 768, height: 1024 }, "portrait", 0.785],
    ["mini landscape", { width: 1024, height: 768 }, "landscape", 0.93],
    ['11" portrait', { width: 834, height: 1194 }, "portrait", 0.845],
    ['11" landscape', { width: 1194, height: 834 }, "landscape", 0.99],
    ['13" portrait', { width: 1024, height: 1366 }, "portrait", 0.785],
    ['13" landscape', { width: 1366, height: 1024 }, "landscape", 0.93],
    // Split View one-third and Slide Over: far narrower than the device, and
    // always taller than wide, so the game reflows to portrait.
    ["split view narrow", { width: 375, height: 1024 }, "portrait", 0.61],
    ["slide over", { width: 320, height: 768 }, "portrait", 0.7],
  ];

  for (const [name, viewport, orientation, coverageFloor] of IPAD_VIEWPORTS) {
    it(`picks ${orientation} for ${name} and keeps a grabbable board`, () => {
      const level = levelSpec(1);
      const chosen = chooseLayout(viewport, level, dealt(level, 0).pieces);
      expect(chosen.id).toBe(orientation);

      let worstCoverage = Infinity;
      for (const spec of LEVELS) {
        for (let run = 0; run < DEALS; run++) {
          const puzzle = dealt(spec, run);
          if (puzzle.pieces.length === 0) continue;
          const layout = buildLevelLayout(orientation, spec, puzzle.pieces, puzzle.targets);
          const scale = fitScale(viewport, layout.canvas);
          const shown = {
            width: layout.canvas.width * scale,
            height: layout.canvas.height * scale,
          };

          // The whole board is on screen: `meet` never crops, so a piece can
          // never be scrolled to or hidden behind the address bar.
          expect(shown.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(shown.height).toBeLessThanOrEqual(viewport.height + 1);

          // A piece stays over a tenth of the short side of the screen once the
          // letterbox scale is applied - the "large things for small hands"
          // invariant, measured in device pixels rather than canvas units.
          const shortSide = Math.min(viewport.width, viewport.height);
          expect(layout.slotSize * scale).toBeGreaterThanOrEqual(0.1 * shortSide);

          worstCoverage = Math.min(
            worstCoverage,
            (shown.width * shown.height) / (viewport.width * viewport.height),
          );
        }
      }
      expect(worstCoverage).toBeGreaterThanOrEqual(coverageFloor);
    });
  }
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

/**
 * The shape-match level that deals this many pieces. Several checks below
 * assemble a cast by hand rather than dealing one, so they need a level of a
 * particular size to hang it on. Retuning the table can take that size away -
 * which is fine, but it has to say so here rather than handing on `undefined`
 * and failing somewhere else entirely.
 */
function animalLevelOf(pieces: number): LevelSpec {
  const level = ANIMAL_LEVELS.find((one) => one.pieces === pieces);
  if (!level) {
    throw new Error(
      `No shape-match level deals ${pieces} pieces. These tests need one; ` +
        `pick a count LEVELS still has, or add a level that deals ${pieces}.`,
    );
  }
  return level;
}

/** A level of three pieces, for casts assembled here rather than dealt. */
const THREE_PIECE_LEVEL = animalLevelOf(3);

describe("pieces that are not square", () => {
  const cast = [PLANK, POLE, SHAPES[0]!];

  it("stands them on the same ground line as a square piece", () => {
    // Landscape puts a level's whole cast on one ground line, so a piece that
    // is not square floating or sinking shows up as a difference here.
    const layout = buildLevelLayout("landscape", THREE_PIECE_LEVEL, cast);
    const grounds = cast.map((shape) => groundOf(layout, shape));
    for (const ground of grounds) expect(ground).toBeCloseTo(grounds[0]!);
  });

  for (const id of ORIENTATIONS) {
    const layout = buildLevelLayout(id, THREE_PIECE_LEVEL, cast);
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
          expect(box.snapRadius).toBe(
            Math.round(
              Math.min(box.size.width, box.size.height) * 0.68 * THREE_PIECE_LEVEL.snapForgiveness,
            ),
          );
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
  const cast = (level: LevelSpec) => dealPieces(level, SHAPES);
  // Three sizes, so a cast dealt for one of them cannot accidentally fit
  // another - which is what the "does not fill the level" check rests on.
  const one = animalLevelOf(1);
  const two = animalLevelOf(2);
  const three = animalLevelOf(3);

  it("uses the portrait reflow only when taller than wide", () => {
    expect(chooseLayout({ width: 1280, height: 800 }, one, cast(one)).id).toBe("landscape");
    expect(chooseLayout({ width: 1024, height: 1024 }, two, cast(two)).id).toBe("landscape");
    expect(chooseLayout({ width: 390, height: 844 }, three, cast(three)).id).toBe("portrait");
  });

  it("rejects a level the table does not describe rather than showing it", () => {
    // Both halves matter. A number outside the thirty is the obvious one; a
    // copy of a real level with its difficulty edited is the one worth
    // catching, because it would otherwise put a board on screen whose
    // forgiveness came from somewhere other than the table.
    const viewport = { width: 1280, height: 800 };
    for (const number of [0, LEVEL_COUNT + 1]) {
      const invented = { ...one, level: number };
      expect(() => chooseLayout(viewport, invented, cast(one))).toThrow();
    }
    const forged = { ...one, snapForgiveness: 9 };
    expect(() => chooseLayout(viewport, forged, cast(one))).toThrow(/not one of the thirty/);
  });

  it("rejects a cast that does not fill the level rather than leaving a gap", () => {
    expect(() => chooseLayout({ width: 1280, height: 800 }, two, cast(one))).toThrow();
    expect(() => chooseLayout({ width: 390, height: 844 }, one, cast(three))).toThrow();
  });

  it("fills a decent share of the viewport in both orientations", () => {
    const cases = [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
    ];
    for (const level of ANIMAL_LEVELS) {
      for (const viewport of cases) {
        const layout = chooseLayout(viewport, level, cast(level));
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
