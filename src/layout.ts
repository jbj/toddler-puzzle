/**
 * Layouts.
 *
 * The puzzle reflows rather than just shrinking: a landscape screen gets one
 * row of animals with the tray underneath, a portrait screen gets two rows of
 * two with a two-row tray. Letterboxing a landscape canvas into a phone held
 * upright would leave the pieces far too small to grab.
 *
 * All values are in logical canvas units; geometry.ts maps them to pixels.
 */
import { ART_BOX, type AnimalId } from "./assets";
import type { Point, Size } from "./geometry";

/** Rendered width/height of every animal, both as a piece and as a hole. */
export const PIECE_SIZE = 190;

/**
 * How close a piece's centre must get to its hole's centre to snap in.
 * Deliberately large - about two thirds of a piece - because toddlers have poor
 * fine motor control and near-misses should still feel like a win.
 */
export const SNAP_RADIUS = 130;

/**
 * While dragging, the piece is held slightly above the finger so a small hand
 * doesn't cover the very thing it's trying to place.
 */
export const FINGER_LIFT = 34;

/**
 * Where each animal's feet sit within its 240x240 art box, as a fraction.
 * Used to stand animals on the ground line instead of aligning their boxes.
 */
const FOOT_LEVEL: Record<AnimalId, number> = {
  giraffe: 226 / ART_BOX,
  elephant: 216 / ART_BOX,
  duck: 200 / ART_BOX,
  turtle: 184 / ART_BOX,
};

/** Top-left of an animal's box such that its feet land on `groundY`. */
function standing(animal: AnimalId, x: number, groundY: number): Point {
  return { x, y: groundY - FOOT_LEVEL[animal] * PIECE_SIZE };
}

export interface GroundBand {
  readonly top: number;
  readonly fill: string;
}

export interface Layout {
  readonly id: "landscape" | "portrait";
  readonly canvas: Size;
  /** Top of the piece tray; scenery fills everything above it. */
  readonly trayTop: number;
  /** Where the ground starts, i.e. the horizon. */
  readonly horizon: number;
  readonly bands: readonly GroundBand[];
  readonly holes: Record<AnimalId, Point>;
  readonly traySlots: readonly Point[];
  /** Ground lines that decorative tufts and flowers sit on. */
  readonly decorLines: readonly number[];
}

const LANDSCAPE: Layout = {
  id: "landscape",
  canvas: { width: 1000, height: 700 },
  trayTop: 480,
  horizon: 320,
  bands: [
    { top: 320, fill: "#8ed76f" },
    { top: 386, fill: "url(#grass)" },
  ],
  holes: {
    giraffe: standing("giraffe", 60, 425),
    elephant: standing("elephant", 290, 425),
    duck: standing("duck", 530, 425),
    turtle: standing("turtle", 750, 425),
  },
  traySlots: [
    { x: 30, y: 495 },
    { x: 280, y: 495 },
    { x: 530, y: 495 },
    { x: 780, y: 495 },
  ],
  decorLines: [468],
};

const PORTRAIT: Layout = {
  id: "portrait",
  canvas: { width: 700, height: 1180 },
  trayTop: 770,
  horizon: 300,
  bands: [
    { top: 300, fill: "#8ed76f" },
    { top: 520, fill: "url(#grass)" },
  ],
  holes: {
    giraffe: standing("giraffe", 60, 430),
    elephant: standing("elephant", 370, 430),
    duck: standing("duck", 60, 745),
    turtle: standing("turtle", 370, 745),
  },
  traySlots: [
    { x: 75, y: 780 },
    { x: 385, y: 780 },
    { x: 75, y: 975 },
    { x: 385, y: 975 },
  ],
  decorLines: [500, 758],
};

export const LAYOUTS = [LANDSCAPE, PORTRAIT] as const;

/** Portrait reflow kicks in once the viewport is taller than it is wide. */
export function chooseLayout(viewport: Size): Layout {
  return viewport.height > viewport.width ? PORTRAIT : LANDSCAPE;
}
