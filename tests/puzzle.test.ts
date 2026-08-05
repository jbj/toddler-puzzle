import { describe, expect, it } from "vitest";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor, animalInk } from "../src/assets";
import {
  boxCenter,
  clampGripToCanvas,
  clampToCanvas,
  covers,
  fitScale,
  growAboutCentre,
  rectAt,
  screenToLogical,
  seededRandom,
  shuffle,
  thickenTo,
  type Point,
  type Rect,
} from "../src/geometry";
import {
  REFERENCE_VIEWS,
  boxOf,
  buildLayout,
  buildLevelLayout,
  chooseLayout,
  gripCentre,
  holeOf,
  onTarget,
  spanWidth,
  trayHome,
  viewFor,
  waitingInk,
  type Layout,
} from "../src/layout";
import { LEVELS, LEVEL_COUNT, dealPieces, levelSpec, type LevelSpec } from "../src/levels";
import {
  GRAB_PADDING,
  GRIP_MIN_RATIO,
  gripOf,
  inkOf,
  pieceId,
  type PieceShape,
} from "../src/piece";
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
  inked: animalInk(id),
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
      inked: { x: 0, y: 0, ...box },
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

/**
 * Each piece waiting in the tray, with the cell that was cut for it.
 *
 * `drawn` is what the child can see there, and is the honest end of every
 * promise about the tray: on a picture board a piece waits smaller than it
 * lands, so its box and its full-size ink both reach outside the cell while the
 * drawing sits neatly inside it.
 */
const waitingOf = (layout: Layout) =>
  layout.pieces.map((shape) => {
    const home = trayHome(layout, shape.id);
    const ink = waitingInk(layout, shape.id);
    return {
      shape,
      box: boxOf(layout, shape.id),
      cell: cellFor(layout, shape.id),
      home,
      drawn: { x: home.x + ink.x, y: home.y + ink.y, width: ink.width, height: ink.height },
    };
  });

/** Is `inner` wholly inside `outer`? Half a unit of slack for the rounding. */
const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Where `piece` would have to be let go for its drawing to sit squarely over
 * `over`'s, given `over` is standing at `hole`.
 *
 * Two pieces of different sizes have their boxes in different places inside
 * them, so comparing the top-lefts of two holes compares nothing a child can
 * see. What a child does is put one drawing where another one is.
 */
const dropOver = (
  layout: Layout,
  piece: PieceShape["id"],
  over: PieceShape["id"],
  hole: Point,
): Point => {
  const { grip } = boxOf(layout, piece);
  const centre = gripCentre(layout, over, hole);
  return { x: centre.x - (grip.x + grip.width / 2), y: centre.y - (grip.y + grip.height / 2) };
};

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
        // A piece stands on a line the layout drew, never between two of them:
        // anything else is a piece floating or sinking rather than standing.
        // Landscape uses a second line once the cast is big enough that one row
        // of them would be small, so what is checked is that every animal is on
        // one of the lines, not that there is only ever one.
        const layout = buildLevelLayout("landscape", level, cast);
        expect(layout.groundLines.length).toBeGreaterThanOrEqual(1);
        for (const shape of layout.pieces) {
          const ground = groundOf(layout, shape);
          const nearest = Math.min(...layout.groundLines.map((line) => Math.abs(line - ground)));
          expect(nearest).toBeLessThan(0.5);
        }
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

describe("clampGripToCanvas", () => {
  const BOX = { x: 0, y: 0, width: 190, height: 190 };

  it("matches the plain clamp for a piece that fills its box", () => {
    for (const corner of [
      { x: -500, y: -500 },
      { x: 9999, y: 9999 },
      { x: 300, y: 200 },
    ]) {
      const gripped = clampGripToCanvas(corner, BOX, CANVAS);
      expect(gripped).toEqual(clampToCanvas(corner, PIECE, CANVAS));
    }
  });

  it("lets a piece drawn in a corner of its box reach the far corner", () => {
    // A slice cut from the bottom-right of an animal. Clamped by its box it
    // would stop a whole animal short of the top-left corner - out of reach of
    // the very hole it belongs in.
    const corner = { x: 120, y: 120, width: 120, height: 120 };
    expect(clampGripToCanvas({ x: -999, y: -999 }, corner, CANVAS)).toEqual({ x: -120, y: -120 });
    expect(clampGripToCanvas({ x: 9999, y: 9999 }, corner, CANVAS)).toEqual({
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

describe("a piece's own box", () => {
  // The animals' box; a piece's box is measured in these units before it is
  // scaled into a slot.
  const BOX = { width: 240, height: 240 };
  const drawing = (inked: Rect): PieceShape => ({
    id: pieceId("drawn"),
    outline: "",
    artwork: "",
    box: BOX,
    inked,
    anchor: { x: 120, y: 240 },
    label: "a drawing",
  });

  it("gives a drawing a margin on every side, measured from the drawing", () => {
    const grip = gripOf(drawing({ x: 60, y: 50, width: 100, height: 120 }));
    // Square enough that the thickening has nothing to do: the margin is all of
    // the difference, and it is the same on every side. It is a share of the
    // drawing rather than of the box around it, so a piece that draws a corner
    // of a big picture is not given a margin the size of a neighbouring piece.
    expect(grip.x).toBeCloseTo(60 - 4);
    expect(grip.y).toBeCloseTo(50 - 4);
    expect(grip.width).toBeCloseTo(100 + 8);
    expect(grip.height).toBeCloseTo(120 + 8);
  });

  /**
   * The whole point of the box. A sliver is hard to aim, and a box the shape of
   * the sliver would give it the least room to be aimed at - the same piece
   * punished twice. Thickened, it asks about as much accuracy as a square piece
   * of the same length does.
   */
  it("thickens a sliver until no side is under half the other", () => {
    for (const drawn of [
      { x: 10, y: 100, width: 200, height: 25 },
      { x: 100, y: 10, width: 25, height: 200 },
      { x: 0, y: 0, width: 240, height: 1 },
    ]) {
      const grip = gripOf(drawing(drawn));
      const short = Math.min(grip.width, grip.height);
      const long = Math.max(grip.width, grip.height);
      expect(short / long).toBeGreaterThanOrEqual(GRIP_MIN_RATIO - 1e-9);
    }
  });

  it("leaves a square drawing the shape it was", () => {
    const grip = gripOf(drawing({ x: 20, y: 20, width: 200, height: 200 }));
    expect(grip.width).toBeCloseTo(grip.height);
  });

  /**
   * Load-bearing: the centre of a piece's box is the centre of what it draws,
   * which is the point the whole game aims at, sparkles on, and measures a drop
   * against. Thickening about anything but the centre would move the target
   * away from the drawing.
   */
  it("never moves the middle of the drawing", () => {
    for (const drawn of [
      { x: 10, y: 100, width: 200, height: 25 },
      { x: 0, y: 0, width: 40, height: 240 },
      { x: 60, y: 50, width: 100, height: 120 },
    ]) {
      const grip = gripOf(drawing(drawn));
      expect(boxCenter(grip, grip)).toEqual(boxCenter(drawn, drawn));
    }
  });

  /**
   * The bug this rule was written to stop, in one test. An animal is nowhere
   * near the size of its art box - a pig draws a little over half its box's
   * height - and while animals were the one kind that declared nothing, they
   * were taken to fill it, so a whole animal was placed by a box about twice
   * its own size. Every animal now says where it draws, and this insists the
   * box is measured from the drawing rather than from the box around it.
   */
  it("measures an animal by its drawing, not by its art box", () => {
    for (const shape of SHAPES) {
      const drawn = inkOf(shape);
      expect(drawn.width).toBeLessThan(BOX.width);
      expect(drawn.height).toBeLessThan(BOX.height);

      // The box is the drawing plus its margin, thickened about the drawing's
      // own middle - so it holds the drawing, keeps its centre, and is nowhere
      // near the art box that used to stand in for it.
      const grip = gripOf(shape);
      const margin = GRAB_PADDING * Math.min(drawn.width, drawn.height);
      expect(grip.x).toBeLessThanOrEqual(drawn.x);
      expect(grip.x + grip.width).toBeGreaterThanOrEqual(drawn.x + drawn.width);
      expect(boxCenter(grip, grip)).toEqual(boxCenter(drawn, drawn));
      expect(grip.width * grip.height).toBeLessThan(BOX.width * BOX.height);
      expect(Math.max(grip.width - drawn.width, grip.height - drawn.height)).toBeLessThan(
        Math.max(2 * margin, (1 / GRIP_MIN_RATIO - 1) * Math.max(drawn.width, drawn.height)) + 1e-9,
      );
    }
  });

  it("stays harmless when there is nothing to measure", () => {
    // Nothing drawn is nothing to grab, and the arithmetic has to say so rather
    // than divide by it: a box of no size, where the drawing would have been.
    const grip = gripOf(drawing({ x: 120, y: 120, width: 0, height: 0 }));
    expect(grip).toEqual({ x: 120, y: 120, width: 0, height: 0 });
  });

  /**
   * The margin stops at the edge of the piece's own box, and an animal drawn to
   * its edges gets none. It would be room nobody could use: the tray reserves a
   * cell from this box, and a margin outside the authored box would ask for
   * space around every animal that no finger has ever been able to grab it by.
   */
  /**
   * The other half of the rule above, and the one that looks like a bug: the
   * *thickening* is not clamped, so a sliver lying along an edge of its box
   * ends up with a box that runs outside it. That is the right way round.
   * Clamping would push the box off the centre of the drawing, and the centre
   * being the drawing's centre is what the placement rule is built on. Nothing
   * downstream wants the authored box: the tray cuts its cell from this box,
   * and the canvas holds a piece by this box.
   */
  it("lets the thickening leave the box rather than move off the drawing", () => {
    const sliver = { x: 0, y: 220, width: 240, height: 20 };
    const grip = gripOf(drawing(sliver));
    expect(grip.height / grip.width).toBeGreaterThanOrEqual(GRIP_MIN_RATIO - 1e-9);
    expect(grip.y + grip.height).toBeGreaterThan(BOX.height);
    expect(boxCenter(grip, grip)).toEqual(boxCenter(sliver, sliver));
  });

  it("keeps the margin inside the piece's own box", () => {
    expect(gripOf(drawing({ x: 0, y: 0, width: 240, height: 240 }))).toEqual({
      x: 0,
      y: 0,
      width: 240,
      height: 240,
    });
  });

  it("thickens about the centre, whatever it is handed", () => {
    expect(thickenTo({ x: 0, y: 100, width: 200, height: 20 }, 0.5)).toEqual({
      x: 0,
      y: 60,
      width: 200,
      height: 100,
    });
  });
});

describe("the rule a drop is placed by", () => {
  const layout = LAYOUTS[0]!;
  const piece = layout.pieces[0]!.id;
  const { grip, reach } = boxOf(layout, piece);
  const home = holeOf(layout, piece);

  it("takes a drop that covers the middle of the hole", () => {
    expect(onTarget(layout, piece, home, home)).toBe(true);
    // Most of the way to the edge of the box, on both axes at once.
    const sloppy = { x: home.x + reach.width * 0.45, y: home.y - reach.height * 0.45 };
    expect(onTarget(layout, piece, sloppy, home)).toBe(true);
  });

  it("refuses a drop whose box falls short of the middle", () => {
    const past = { x: home.x + reach.width / 2 + 2, y: home.y };
    expect(onTarget(layout, piece, past, home)).toBe(false);
    expect(onTarget(layout, piece, trayHome(layout, piece), home)).toBe(false);
  });

  it("is the box itself: covering the middle is the whole of it", () => {
    const centre = gripCentre(layout, piece, home);
    for (const at of [
      home,
      { x: home.x + 30, y: home.y - 20 },
      { x: home.x + reach.width, y: home.y },
      trayHome(layout, piece),
    ]) {
      expect(onTarget(layout, piece, at, home)).toBe(covers(rectAt(at, reach), centre));
    }
  });

  it("reaches exactly as far as the level is forgiving", () => {
    // `reach` is the piece's own box, grown about its centre by the level's
    // `snapForgiveness`. At forgiveness 1 they are the same box.
    const factor = layout.level.snapForgiveness;
    expect(reach.width).toBeCloseTo(grip.width * factor);
    expect(reach.height).toBeCloseTo(grip.height * factor);
    const reachCentre = boxCenter(reach, reach);
    const gripMiddle = boxCenter(grip, grip);
    expect(reachCentre.x).toBeCloseTo(gripMiddle.x, 10);
    expect(reachCentre.y).toBeCloseTo(gripMiddle.y, 10);
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

  // Asked the way the game asks it: put a piece's drawing squarely over
  // somebody else's, which is what a child aiming at the wrong hole does, and
  // the rule has to refuse it. A box generous enough to reach the neighbouring
  // target would let a piece appear to jump across the board.
  "keeps one target's reach off another's": (layout) => {
    const targets = placementsOf(layout);
    for (const mine of targets) {
      for (const other of targets) {
        if (other.shape.id === mine.shape.id) continue;
        const at = dropOver(layout, mine.shape.id, other.shape.id, other.hole);
        if (onTarget(layout, mine.shape.id, at, mine.hole)) {
          return `${mine.shape.id} reaches ${other.shape.id}'s target`;
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
      waitingOf(layout).map(({ shape, drawn }) => {
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

  "keeps every tray cell out of every target's reach": (layout) => {
    // A cell belongs to one piece rather than holding whichever was shuffled
    // into it, so this asks the question that is actually on the board: could
    // the piece waiting there be placed from where it stands?
    //
    // `trayHome` is the right end of it even where a piece waits drawn smaller
    // than it lands: it shrinks about its own centre, so it grows back into
    // exactly this position the moment it is picked up.
    for (const { shape, home } of waitingOf(layout)) {
      for (const target of placementsOf(layout)) {
        if (onTarget(layout, shape.id, home, target.hole)) {
          return `${shape.id} would settle home from its tray cell`;
        }
      }
    }
    return null;
  },

  // The reason a grab box needs no clamp of its own. Two boxes that overlapped
  // would make a press ambiguous, and the piece that moved would be whichever
  // happened to be drawn on top.
  //
  // Measured on the box as it is *drawn* in the tray: the grab rectangle lives
  // inside the artwork, so on a picture board it shrinks with it. Shrinking is
  // about the drawing's centre, which is the box's centre too.
  "keeps the pieces' own boxes apart in the tray": (layout) => {
    const boxes = waitingOf(layout).map(({ shape, box, home }) => ({
      piece: shape.id,
      rect: growAboutCentre(rectAt(home, box.grip), layout.waitingScale),
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (overlaps(a.rect, b.rect)) return `${a.piece} and ${b.piece} overlap in the tray`;
      }
    }
    return null;
  },

  // A piece narrower than a tenth of the canvas is a fiddly target for a small
  // hand, however many pieces the level asks for.
  //
  // Measured against the canvas's *nominal* width rather than its real one, for
  // the reason `spanWidth` exists: a canvas is composed for the screen, so on a
  // very wide one the real width is mostly extra meadow and a share of it would
  // shrink as the screen got roomier. On either reference canvas the two are
  // the same number, so this is the check it has always been.
  "keeps every piece big enough for a toddler to grab": (layout) => {
    const span = spanWidth(layout.canvas);
    if (layout.slotSize / span <= 0.1) {
      return `a ${layout.slotSize} slot on a ${span} canvas is too small to grab`;
    }
    // The slot is what a target is drawn to; what a hand has to find is the
    // piece's own drawing, which for a slice is a fraction of that.
    return firstComplaint(
      waitingOf(layout).map(({ shape, drawn }) => {
        const share = Math.max(drawn.width, drawn.height) / span;
        return share > 0.08 ? null : `${shape.id} draws ${(share * 100).toFixed(1)}% of the canvas`;
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
    // The sweep above uses the most forgiving level in the table at every count.
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

  it("stands about as big an animal as a board of that many whole ones", () => {
    // Cutting an animal up must not shrink it. Every tray is packed by what a
    // piece *draws* rather than by the box around it, so a board of slices and
    // a board of the same number of whole animals reserve about the same room -
    // which is what leaves a quarter of an animal worth grabbing.
    //
    // A slice used to come out strictly bigger, back when a whole animal was
    // the one piece measured by its whole art box; measuring the animal too
    // took that unearned advantage away rather than taking anything from a
    // slice. See docs/decisions/One box measures a piece, and one rule places
    // it.md.
    for (const id of ORIENTATIONS) {
      for (const slices of [2, 3, 4]) {
        const { pieces, targets } = slicedCast(2, slices, seededRandom(slices));
        const sliced = buildLayout(id, MOST_FORGIVING, pieces, targets);
        const whole = buildLayout(id, MOST_FORGIVING, animalCast(pieces.length, seededRandom(1)));
        expect(sliced.slotSize).toBeGreaterThan(whole.slotSize * 0.95);
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

  it("measures a shape by what it draws, not by the picture it carries", () => {
    // The box a part carries is the whole picture, so a reach taken from it
    // would put a roof into a wall. What a piece is measured by is its own
    // drawing - thickened, so a thin wedge is still worth aiming at, and never
    // wider than the picture, which is as much as any part draws.
    for (const layout of POLYGON) {
      let tightest = Infinity;
      for (const part of layout.pieces) {
        const { ink, grip, size } = boxOf(layout, part.id);
        expect(grip.width).toBeLessThanOrEqual(size.width);
        expect(grip.height).toBeLessThanOrEqual(size.height);
        expect(grip.width).toBeGreaterThanOrEqual(ink.width);
        expect(grip.height).toBeGreaterThanOrEqual(ink.height);
        const short = Math.min(grip.width, grip.height);
        const long = Math.max(grip.width, grip.height);
        expect(short / long).toBeGreaterThanOrEqual(GRIP_MIN_RATIO - 1e-9);
        tightest = Math.min(tightest, Math.max(grip.width / size.width, grip.height / size.height));
      }
      // Some part of every picture is a good deal smaller than the picture: if
      // they were all the size of the whole thing, the boxes would say nothing.
      expect(tightest).toBeLessThan(0.9);
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
 * Every row was remeasured when the touch chapter went and the thirty levels
 * became five chapters of six: each level moved, and a level's deals come from
 * its number, so no row could be carried across. The whole table is one
 * measurement of the ramp as it now stands.
 *
 * `slot` is `slotSize / canvas.width`, which for a picture kind is also the
 * assembled picture's width as a share of the canvas, because a picture is
 * drawn exactly one slot across its longer side. `ink` is the smallest piece's
 * longer side over the same width, measured *as it waits* - on a picture board
 * that is two thirds of what it lands at, and what the child has to grab is the
 * one they can see.
 *
 * Raising a number here is a good day. *Lowering* one is a decision, and the
 * pull request that does it has to say which invariant bought the loss.
 *
 * The `ink` column for levels 1-6 fell on 2026-07-31 without anything getting
 * smaller. Those levels stand whole animals, and an animal used to be the one
 * piece that did not say where it drew, so it was taken to fill its 240x240
 * art box and this column measured the box. It now measures the drawing, which
 * is between a half and three quarters of it. Every `slot` on those rows went
 * *up* at the same time, because a tray packed by the drawing reserves less
 * room than one packed by the box around it: the animal a child sees is bigger
 * than it was, and the number beside it is smaller because it is finally
 * counting the animal. See
 * docs/decisions/One box measures a piece, and one rule places it.md.
 *
 * Level 14 is the one row that has been lowered on purpose. It used to deal a
 * four-piece picture and now stands the boat, which is three, and a three-part
 * picture is drawn in a smaller slot than a four-part one. The loss bought a
 * chapter whose six levels are six different pictures, named in the table
 * rather than dealt at random - and the slot it drops to is one the whole
 * opening chapter already plays at. See
 * docs/decisions/A level names what it is made of.md.
 */
const BOARD_FLOORS: readonly (readonly [number, "landscape" | "portrait", number, number])[] = [
  [1, "landscape", 0.212, 0.191],
  [1, "portrait", 0.303, 0.29],
  [2, "landscape", 0.212, 0.167],
  [2, "portrait", 0.303, 0.239],
  [3, "landscape", 0.212, 0.158],
  [3, "portrait", 0.282, 0.218],
  [4, "landscape", 0.203, 0.15],
  [4, "portrait", 0.285, 0.214],
  [5, "landscape", 0.164, 0.121],
  [5, "portrait", 0.266, 0.196],
  [6, "landscape", 0.15, 0.111],
  [6, "portrait", 0.266, 0.196],
  [7, "landscape", 0.226, 0.122],
  [7, "portrait", 0.324, 0.181],
  [8, "landscape", 0.245, 0.177],
  [8, "portrait", 0.35, 0.253],
  [9, "landscape", 0.245, 0.136],
  [9, "portrait", 0.346, 0.191],
  [10, "landscape", 0.226, 0.107],
  [10, "portrait", 0.315, 0.15],
  [11, "landscape", 0.303, 0.128],
  [11, "portrait", 0.433, 0.19],
  [12, "landscape", 0.209, 0.091],
  [12, "portrait", 0.35, 0.153],
  [13, "landscape", 0.203, 0.101],
  [13, "portrait", 0.291, 0.145],
  [14, "landscape", 0.203, 0.095],
  [14, "portrait", 0.291, 0.135],
  [15, "landscape", 0.244, 0.097],
  [15, "portrait", 0.349, 0.139],
  [16, "landscape", 0.404, 0.114],
  [16, "portrait", 0.573, 0.162],
  [17, "landscape", 0.26, 0.086],
  [17, "portrait", 0.388, 0.129],
  [18, "landscape", 0.388, 0.109],
  [18, "portrait", 0.537, 0.152],
  [19, "landscape", 0.558, 0.186],
  [19, "portrait", 0.927, 0.309],
  [20, "landscape", 0.558, 0.186],
  [20, "portrait", 0.927, 0.309],
  [21, "landscape", 0.516, 0.133],
  [21, "portrait", 0.927, 0.238],
  [22, "landscape", 0.516, 0.133],
  [22, "portrait", 0.927, 0.238],
  [23, "landscape", 0.516, 0.133],
  [23, "portrait", 0.927, 0.238],
  [24, "landscape", 0.512, 0.113],
  [24, "portrait", 0.927, 0.206],
  [25, "landscape", 0.432, 0.119],
  [25, "portrait", 0.812, 0.217],
  [26, "landscape", 0.451, 0.123],
  [26, "portrait", 0.818, 0.228],
  [27, "landscape", 0.215, 0.082],
  [27, "portrait", 0.364, 0.133],
  [28, "landscape", 0.426, 0.093],
  [28, "portrait", 0.85, 0.184],
  [29, "landscape", 0.512, 0.113],
  [29, "portrait", 0.927, 0.206],
  [30, "landscape", 0.521, 0.1],
  [30, "portrait", 0.927, 0.179],
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
          const ink = waitingInk(layout, piece.id);
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
 * The board on a real device, driven at the viewport sizes rather than reasoned
 * about. The canvas is composed for the box it is drawn in, so what this checks
 * is that nothing is left over: the board covers the screen it was given, is
 * never cropped by it, and a piece is still grabbably large in *device* pixels
 * once the scale is applied. Split View and Slide Over are the narrow widths a
 * multitasking iPad can hand the game, and the case most likely to break a
 * layout, so they are swept too.
 *
 * This suite used to measure the letterbox instead: an iPad is nearer 1:1.4
 * than the old portrait canvas's 1:1.7, so a fifth of the screen was bar. The
 * floors were 0.61 to 0.99 of the screen covered. They are all but 1 now, and
 * that difference is the whole change. See
 * docs/decisions/The board is composed for the screen it is on.md.
 */
describe("on a real screen", () => {
  const dealt = (level: LevelSpec, run: number): Puzzle =>
    kindFor(level).deal({ level, shapes: SHAPES }, seededRandom(level.level * 101 + run));

  const DEALS = 8;

  /**
   * `name`, the viewport in CSS points, and the orientation the game must pick.
   *
   * Coverage is not tabulated any more because there is nothing left to
   * tabulate: the canvas has the viewport's own ratio to within the half unit
   * the long side is rounded to, so every one of these covers essentially all
   * of its screen and the floor below is one number for the lot.
   */
  const VIEWPORTS: readonly (readonly [
    string,
    { width: number; height: number },
    "landscape" | "portrait",
  ])[] = [
    ["mini portrait", { width: 768, height: 1024 }, "portrait"],
    ["mini landscape", { width: 1024, height: 768 }, "landscape"],
    ['11" portrait', { width: 834, height: 1194 }, "portrait"],
    ['11" landscape', { width: 1194, height: 834 }, "landscape"],
    ['13" portrait', { width: 1024, height: 1366 }, "portrait"],
    ['13" landscape', { width: 1366, height: 1024 }, "landscape"],
    // Split View one-third and Slide Over: far narrower than the device, and
    // always taller than wide, so the game reflows to portrait.
    ["split view narrow", { width: 375, height: 1024 }, "portrait"],
    ["slide over", { width: 320, height: 768 }, "portrait"],
    // A phone and a laptop, which are the two shapes furthest from either of
    // the canvases the game used to have.
    ["phone portrait", { width: 390, height: 844 }, "portrait"],
    ["laptop", { width: 1440, height: 900 }, "landscape"],
  ];

  /** A board may leave this little of the screen uncovered: rounding, and no more. */
  const COVERAGE_FLOOR = 0.998;

  for (const [name, viewport, orientation] of VIEWPORTS) {
    it(`fills ${name} with a grabbable board`, () => {
      const level = levelSpec(1);
      const chosen = chooseLayout(viewport, level, dealt(level, 0).pieces);
      expect(chosen.id).toBe(orientation);

      let worstCoverage = Infinity;
      for (const spec of LEVELS) {
        for (let run = 0; run < DEALS; run++) {
          const puzzle = dealt(spec, run);
          if (puzzle.pieces.length === 0) continue;
          const layout = chooseLayout(viewport, spec, puzzle.pieces, puzzle.targets);
          expect(layout.id).toBe(orientation);
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
          // scale is applied - the "large things for small hands" invariant,
          // measured in device pixels rather than canvas units.
          const shortSide = Math.min(viewport.width, viewport.height);
          expect(layout.slotSize * scale).toBeGreaterThanOrEqual(0.1 * shortSide);

          worstCoverage = Math.min(
            worstCoverage,
            (shown.width * shown.height) / (viewport.width * viewport.height),
          );
        }
      }
      expect(worstCoverage).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    });
  }
});

/**
 * Every shape of screen, which is the claim the composition now makes: not two
 * canvases and a border, but a canvas for whatever the screen is.
 *
 * Three things are asked of every ratio from 1:3 to 3:1, across all thirty
 * levels and several deals. That the board composes at all - `arrange` throws
 * when no plan clears the piece floors, and a refusal is a child looking at a
 * level that will not open. That every promise a composition makes still holds,
 * so a strange ratio is not quietly a different game. And that a piece is never
 * *smaller in device pixels* than the two fixed canvases would have drawn it on
 * that same screen: "no worse than today" as a measurement rather than a hope,
 * with the old arrangement computed from the reference views rather than
 * remembered.
 *
 * Ratios past these are not special-cased anywhere and are not swept here; the
 * rule simply goes on running, and a 1:4 screen gets a very long thin board.
 */
describe("on a screen of any shape", () => {
  const dealt = (level: LevelSpec, run: number): Puzzle =>
    kindFor(level).deal({ level, shapes: SHAPES }, seededRandom(level.level * 101 + run));

  const RATIOS = [1, 4 / 3, 1000 / 700, 16 / 9, 2.4, 3];
  const DEALS = 2;
  /** The screen's short side in device pixels; the long side follows the ratio. */
  const SHORT = 800;

  /**
   * How much of a piece's size, in device pixels, a screen-shaped board has to
   * keep against the letterboxed one it replaces. It only bites near square:
   *
   * - Between 1:1 and 4:3 *wide*, a tray stops winning its place down the
   *   gutters (`gutterGain`) and moves to a band across the top, which is a
   *   step down of up to a tenth wherever it lands near the threshold. The
   *   letterboxed board was on the lucky side of the same rule.
   * - Between 1:1.33 and 1:1.6 *tall*, a two-row board on a squarer canvas has
   *   less height per unit of width than the old 7:11.8 one did, and the extra
   *   scale does not quite pay for the row.
   *
   * Bought with a quarter to a third more screen covered, a tray at the edge of
   * the device rather than the edge of a bar, and the scenery filling the
   * screen. Anything past 16:9 in either direction keeps its size exactly.
   * Lowering this number is a decision: it is a piece getting smaller.
   *
   * It read 0.93 until the touch chapter went, and that number was measured
   * from the two deals this test plays rather than from the rule. A sweep of
   * twenty-four deals at every ratio finds the true edge at 0.9069, on a board
   * of six animals at 4:3 wide, where six across will not fit the narrower
   * canvas and the extra scale pays back only half of what the row costs. The
   * same board reaches the same 0.9069 on the table this replaced - it was
   * level 10 there and is level 6 here - so nothing has got smaller; the deals
   * this test happens to play have moved onto the edge that was always there.
   * Shaded to 0.9, and measured rather than chosen.
   */
  const KEPT_SIZE = 0.9;

  const screens = RATIOS.flatMap((ratio) => [
    { name: `wide ${ratio.toFixed(2)}:1`, ratio, width: Math.round(SHORT * ratio), height: SHORT },
    { name: `tall 1:${ratio.toFixed(2)}`, ratio, width: SHORT, height: Math.round(SHORT * ratio) },
  ]);

  /** Every level and deal composed for one screen, which most checks below share. */
  const boardsOn = (screen: { width: number; height: number }): Layout[] =>
    LEVELS.flatMap((spec) =>
      Array.from({ length: DEALS }, (_, run) => dealt(spec, run))
        .filter((puzzle) => puzzle.pieces.length > 0)
        .map((puzzle) => buildLevelLayout(viewFor(screen), spec, puzzle.pieces, puzzle.targets)),
    );

  const smallestInk = (layout: Layout): number =>
    Math.min(
      ...layout.pieces.map((piece) => {
        const ink = waitingInk(layout, piece.id);
        return Math.max(ink.width, ink.height);
      }),
    );

  /**
   * The fault this rule was written for. Level 19 is one butterfly in a square
   * box with five parts waiting: past about 10:7 both placements draw it at the
   * same size, because the cap on how big a piece may be drawn has them both,
   * and the only thing left to tell a playable board from a letterbox is how
   * much of the canvas the tray is taking. A band across the top of a 3:1
   * screen is a third of the scarce dimension; two columns are a fifth of the
   * plentiful one. It used to stand on the top all the way out to 3:1.
   */
  it("stands a wide screen's tray down the sides, where the board is", () => {
    for (const ratio of [2.4, 3]) {
      const screen = { width: Math.round(SHORT * ratio), height: SHORT };
      const spec = levelSpec(19);
      for (let run = 0; run < DEALS; run++) {
        const puzzle = dealt(spec, run);
        const layout = buildLevelLayout(viewFor(screen), spec, puzzle.pieces, puzzle.targets);
        expect(layout.sceneBox.x, `${ratio}:1`).toBeGreaterThan(0);
        expect(layout.sceneTop, `${ratio}:1`).toBe(0);
      }
    }
  });

  for (const screen of screens) {
    it(`composes every level on a ${screen.name} screen`, () => {
      // The refusal is a throw, so composing the lot without one is the check.
      expect(boardsOn(screen).length).toBeGreaterThan(0);
    });

    it(`keeps every promise on a ${screen.name} screen`, () => {
      const complaints = boardsOn(screen).flatMap((layout) =>
        PROMISED.flatMap(([name, promise]) => {
          const complaint = promise(layout);
          return complaint === null ? [] : [`${screen.name} ${layout.id}: ${name}: ${complaint}`];
        }),
      );
      expect(complaints).toEqual([]);
    });

    it(`fills a ${screen.name} screen with no border`, () => {
      for (const layout of boardsOn(screen)) {
        const scale = fitScale(screen, layout.canvas);
        expect(layout.canvas.width * scale).toBeGreaterThanOrEqual(screen.width - 1);
        expect(layout.canvas.height * scale).toBeGreaterThanOrEqual(screen.height - 1);
      }
    });

    it(`draws nothing smaller on a ${screen.name} screen than the two canvases did`, () => {
      const before = REFERENCE_VIEWS[screen.height > screen.width ? "portrait" : "landscape"];
      for (const spec of LEVELS) {
        for (let run = 0; run < DEALS; run++) {
          const puzzle = dealt(spec, run);
          if (puzzle.pieces.length === 0) continue;
          const now = buildLevelLayout(viewFor(screen), spec, puzzle.pieces, puzzle.targets);
          const was = buildLevelLayout(before, spec, puzzle.pieces, puzzle.targets);
          const nowScale = fitScale(screen, now.canvas);
          const wasScale = fitScale(screen, was.canvas);
          const where = `level ${spec.level} on ${screen.name}`;
          // Device pixels on both sides: canvas units are not comparable
          // between two differently shaped canvases, but what a hand has to
          // find is.
          expect(now.slotSize * nowScale, where).toBeGreaterThanOrEqual(
            was.slotSize * wasScale * KEPT_SIZE,
          );
          expect(smallestInk(now) * nowScale, where).toBeGreaterThanOrEqual(
            smallestInk(was) * wasScale * KEPT_SIZE,
          );
        }
      }
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
  inked: { x: 0, y: 0, width: 300, height: 100 },
  anchor: { x: 150, y: 100 },
  label: "plank",
};

const POLE: PieceShape = {
  id: pieceId("test:pole"),
  outline: "",
  artwork: "",
  box: { width: 100, height: 300 },
  inked: { x: 0, y: 0, width: 100, height: 300 },
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

      it("thickens a thin piece rather than giving it less to aim at", () => {
        // The plank draws three times wider than it is tall. Measured by its
        // narrow side it would be the hardest piece on the board to place; its
        // box is thickened to twice, so it asks about what the square one does.
        for (const box of boxes) {
          const short = Math.min(box.grip.width, box.grip.height);
          const long = Math.max(box.grip.width, box.grip.height);
          expect(short / long).toBeGreaterThanOrEqual(GRIP_MIN_RATIO - 1e-9);
        }
        expect(boxes[0]!.grip.height).toBeGreaterThan(boxes[0]!.size.height);
        expect(boxes[1]!.grip.width).toBeGreaterThan(boxes[1]!.size.width);
        // The animal is left the shape it *draws*, which is not the square it
        // is authored in: an animal fills between a half and three quarters of
        // its art box, and the box follows the drawing.
        const drawn = gripOf(cast[2]!);
        expect(boxes[2]!.grip.width / boxes[2]!.grip.height).toBeCloseTo(
          drawn.width / drawn.height,
        );
      });

      it("grows the box by the level's forgiveness and nothing else", () => {
        for (const box of boxes) {
          expect(box.reach.width).toBeCloseTo(box.grip.width * THREE_PIECE_LEVEL.snapForgiveness);
          expect(box.reach.height).toBeCloseTo(box.grip.height * THREE_PIECE_LEVEL.snapForgiveness);
        }
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

  it("fills the viewport, whatever shape it is", () => {
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
        // Letterboxing a landscape canvas into a phone would score ~0.4 here,
        // and the two fixed canvases scored 0.75 to 0.93 on these three. What
        // is left now is the half unit the canvas's long side rounds to.
        expect(used).toBeGreaterThan(0.998);
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
