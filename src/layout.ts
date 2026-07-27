/**
 * Stages and layouts.
 *
 * The game is three stages long - three animals, then four, then six - so a
 * toddler starts with an easy win and the board fills up as they go. Each stage
 * has its own layout in each orientation, because the puzzle reflows rather than
 * just shrinking: a landscape screen gets rows of animals with the tray
 * underneath, a portrait screen gets narrower rows and a taller tray.
 * Letterboxing a landscape canvas into a phone held upright would leave the
 * pieces far too small to grab.
 *
 * Layouts are generated from the table below rather than placed by hand: a
 * stage says how many animals stand on each ground line and how many wait in
 * each tray row, and `spreadX` spaces them evenly. Which animals fill those
 * places is drawn at random when the puzzle starts, so layouts are built on
 * demand rather than up front. The unit tests then check every stage in both
 * orientations, for every cast the game could deal - holes on canvas, snap zones
 * apart, tray slots apart.
 *
 * All values are in logical canvas units; geometry.ts maps them to pixels.
 */
import { ANIMAL_IDS, ART_BOX, type AnimalId } from "./assets";
import { shuffle, type Point, type Size } from "./geometry";

/**
 * How close a piece's centre must get to its hole's centre to snap in, as a
 * fraction of the piece. Deliberately large - about two thirds of a piece -
 * because toddlers have poor fine motor control and near-misses should still
 * feel like a win.
 */
const SNAP_FRACTION = 0.68;

/**
 * While dragging, the piece is held slightly above the finger so a small hand
 * doesn't cover the very thing it's trying to place.
 */
export const FINGER_LIFT = 34;

/**
 * How many animals each stage holds. The cast itself is drawn at random from
 * `ANIMAL_IDS` every time a puzzle starts, so no two runs are quite the same;
 * only the *number* of animals is fixed, because the arrangements below are
 * tuned per count.
 */
export const STAGE_SIZES: readonly number[] = [3, 4, 6];

export const STAGE_COUNT = STAGE_SIZES.length;

/** How many animals stage `stage` (1-based) shows. */
export function stageSize(stage: number): number {
  const size = STAGE_SIZES[stage - 1];
  if (size === undefined) throw new Error(`No stage ${stage}.`);
  return size;
}

/**
 * Deal a stage's animals: a random subset of the cast, in a random order. Both
 * matter - which animals turn up keeps the puzzle fresh, and their order decides
 * which hole each one stands in, so the same animal isn't always on the left.
 */
export function pickStageAnimals(
  stage: number,
  random: () => number = Math.random,
): readonly AnimalId[] {
  const size = stageSize(stage);
  if (size > ANIMAL_IDS.length) {
    throw new Error(`Stage ${stage} needs ${size} animals but only ${ANIMAL_IDS.length} exist.`);
  }
  return shuffle(ANIMAL_IDS, random).slice(0, size);
}

/**
 * Where each animal's feet sit within its 240x240 art box, as a fraction.
 * Used to stand animals on the ground line instead of aligning their boxes.
 */
const FOOT_LEVEL: Record<AnimalId, number> = {
  giraffe: 226 / ART_BOX,
  elephant: 216 / ART_BOX,
  duck: 200 / ART_BOX,
  turtle: 184 / ART_BOX,
  rabbit: 212 / ART_BOX,
  butterfly: 204 / ART_BOX,
};

export interface GroundBand {
  readonly top: number;
  readonly fill: string;
}

export interface Layout {
  readonly id: "landscape" | "portrait";
  /** 1-based stage this layout belongs to. */
  readonly stage: number;
  /** The stage's animals, in layout order. */
  readonly animals: readonly AnimalId[];
  readonly canvas: Size;
  /** Rendered width/height of every animal, both as a piece and as a hole. */
  readonly pieceSize: number;
  readonly snapRadius: number;
  /** Top of the piece tray; scenery fills everything above it. */
  readonly trayTop: number;
  /** Where the ground starts, i.e. the horizon. */
  readonly horizon: number;
  readonly bands: readonly GroundBand[];
  /** Only the animals of this stage have holes. */
  readonly holes: Readonly<Partial<Record<AnimalId, Point>>>;
  readonly traySlots: readonly Point[];
  /** Ground lines that decorative tufts and flowers sit on. */
  readonly decorLines: readonly number[];
}

/** The hole an animal belongs in. Throws rather than silently misplacing it. */
export function holeOf(layout: Layout, animal: AnimalId): Point {
  const hole = layout.holes[animal];
  if (!hole) {
    throw new Error(
      `Animal "${animal}" has no hole in the stage ${layout.stage} ${layout.id} layout.`,
    );
  }
  return hole;
}

/** A line of animals standing on the ground at `groundY`. */
interface SceneRow {
  readonly groundY: number;
  readonly count: number;
}

/** A row of tray slots whose boxes start at `top`. */
interface TrayRow {
  readonly top: number;
  readonly count: number;
}

interface Arrangement {
  readonly canvas: Size;
  readonly pieceSize: number;
  readonly trayTop: number;
  readonly horizon: number;
  readonly bands: readonly GroundBand[];
  readonly sceneRows: readonly SceneRow[];
  /** Space kept clear at the left and right of every scene row. */
  readonly sceneMargin: number;
  readonly trayRows: readonly TrayRow[];
  readonly trayMargin: number;
  readonly decorLines: readonly number[];
}

/** Left edges of `count` evenly spaced boxes, inset by `margin` at both ends. */
function spreadX(count: number, size: number, width: number, margin: number): number[] {
  if (count === 1) return [(width - size) / 2];
  const step = (width - 2 * margin - size) / (count - 1);
  return Array.from({ length: count }, (_, index) => margin + index * step);
}

/** Top-left of an animal's box such that its feet land on `groundY`. */
function standing(animal: AnimalId, x: number, groundY: number, pieceSize: number): Point {
  return { x, y: groundY - FOOT_LEVEL[animal] * pieceSize };
}

const total = (rows: readonly { readonly count: number }[]): number =>
  rows.reduce((sum, row) => sum + row.count, 0);

function buildLayout(
  id: Layout["id"],
  stage: number,
  animals: readonly AnimalId[],
  arrangement: Arrangement,
): Layout {
  const { canvas, pieceSize, sceneRows, trayRows } = arrangement;
  if (total(sceneRows) !== animals.length || total(trayRows) !== animals.length) {
    throw new Error(
      `Stage ${stage} ${id} layout must hold ${animals.length} animals, but has ` +
        `${total(sceneRows)} holes and ${total(trayRows)} tray slots.`,
    );
  }

  const holes: Partial<Record<AnimalId, Point>> = {};
  let next = 0;
  for (const row of sceneRows) {
    for (const x of spreadX(row.count, pieceSize, canvas.width, arrangement.sceneMargin)) {
      const animal = animals[next++] as AnimalId;
      holes[animal] = standing(animal, x, row.groundY, pieceSize);
    }
  }

  const traySlots = trayRows.flatMap((row) =>
    spreadX(row.count, pieceSize, canvas.width, arrangement.trayMargin).map((x) => ({
      x,
      y: row.top,
    })),
  );

  return {
    id,
    stage,
    animals,
    canvas,
    pieceSize,
    snapRadius: Math.round(pieceSize * SNAP_FRACTION),
    trayTop: arrangement.trayTop,
    horizon: arrangement.horizon,
    bands: arrangement.bands,
    holes,
    traySlots,
    decorLines: arrangement.decorLines,
  };
}

const LANDSCAPE_CANVAS: Size = { width: 1000, height: 700 };
const PORTRAIT_CANVAS: Size = { width: 700, height: 1180 };

const LANDSCAPE_BANDS: readonly GroundBand[] = [
  { top: 320, fill: "#8ed76f" },
  { top: 386, fill: "url(#grass)" },
];

/**
 * One landscape arrangement per stage. Pieces shrink as the board fills up,
 * which is what lets six animals share a single row without their snap zones
 * running into each other.
 */
const LANDSCAPE: readonly Arrangement[] = [
  {
    canvas: LANDSCAPE_CANVAS,
    pieceSize: 210,
    trayTop: 465,
    horizon: 320,
    bands: LANDSCAPE_BANDS,
    sceneRows: [{ groundY: 420, count: 3 }],
    sceneMargin: 60,
    trayRows: [{ top: 482, count: 3 }],
    trayMargin: 40,
    decorLines: [452],
  },
  {
    canvas: LANDSCAPE_CANVAS,
    pieceSize: 190,
    trayTop: 480,
    horizon: 320,
    bands: LANDSCAPE_BANDS,
    sceneRows: [{ groundY: 425, count: 4 }],
    sceneMargin: 60,
    trayRows: [{ top: 495, count: 4 }],
    trayMargin: 30,
    decorLines: [468],
  },
  {
    canvas: LANDSCAPE_CANVAS,
    pieceSize: 145,
    trayTop: 480,
    horizon: 320,
    bands: LANDSCAPE_BANDS,
    sceneRows: [{ groundY: 428, count: 6 }],
    sceneMargin: 28,
    trayRows: [{ top: 505, count: 6 }],
    trayMargin: 20,
    decorLines: [468],
  },
];

/**
 * Portrait stacks the animals into shallower rows and gives the tray the height
 * it saves, so pieces stay just as grabbable on a phone held upright.
 */
const PORTRAIT: readonly Arrangement[] = [
  {
    canvas: PORTRAIT_CANVAS,
    pieceSize: 200,
    trayTop: 900,
    horizon: 300,
    bands: [
      { top: 300, fill: "#8ed76f" },
      { top: 560, fill: "url(#grass)" },
    ],
    sceneRows: [
      { groundY: 500, count: 2 },
      { groundY: 830, count: 1 },
    ],
    sceneMargin: 55,
    trayRows: [{ top: 930, count: 3 }],
    trayMargin: 20,
    decorLines: [540, 862],
  },
  {
    canvas: PORTRAIT_CANVAS,
    pieceSize: 190,
    trayTop: 770,
    horizon: 300,
    bands: [
      { top: 300, fill: "#8ed76f" },
      { top: 520, fill: "url(#grass)" },
    ],
    sceneRows: [
      { groundY: 430, count: 2 },
      { groundY: 745, count: 2 },
    ],
    sceneMargin: 60,
    trayRows: [
      { top: 780, count: 2 },
      { top: 975, count: 2 },
    ],
    trayMargin: 75,
    decorLines: [500, 758],
  },
  {
    canvas: PORTRAIT_CANVAS,
    pieceSize: 170,
    trayTop: 800,
    horizon: 300,
    bands: [
      { top: 300, fill: "#8ed76f" },
      { top: 520, fill: "url(#grass)" },
    ],
    sceneRows: [
      { groundY: 440, count: 3 },
      { groundY: 770, count: 3 },
    ],
    sceneMargin: 45,
    trayRows: [
      { top: 810, count: 3 },
      { top: 995, count: 3 },
    ],
    trayMargin: 40,
    decorLines: [478, 788],
  },
];

/**
 * Build one stage's layout for one orientation around a given cast. Layouts are
 * built on demand rather than up front because the cast is random: the holes
 * depend on which animal stands where, since each animal's feet sit at a
 * different height in its art box.
 */
export function buildStageLayout(
  id: Layout["id"],
  stage: number,
  animals: readonly AnimalId[],
): Layout {
  const arrangements = id === "landscape" ? LANDSCAPE : PORTRAIT;
  const arrangement = arrangements[stage - 1];
  if (!arrangement) throw new Error(`No ${id} arrangement for stage ${stage}.`);
  return buildLayout(id, stage, animals, arrangement);
}

/** Stages are numbered from 1; the stage after the last one is the first again. */
export function nextStage(stage: number): number {
  return (stage % STAGE_COUNT) + 1;
}

/** Portrait reflow kicks in once the viewport is taller than it is wide. */
export function chooseLayout(viewport: Size, stage: number, animals: readonly AnimalId[]): Layout {
  return buildStageLayout(
    viewport.height > viewport.width ? "portrait" : "landscape",
    stage,
    animals,
  );
}
