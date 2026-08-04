/**
 * Before changing this file, read docs/puzzle-kinds.md.
 *
 * The polygon scenes: a house, a boat, a rocket, drawn out of plain shapes.
 *
 * Every shape here is *generated* from a form and a size rather than drawn by
 * hand, which is why this chapter costs no artwork: a square is a square, and a
 * ring of five petals is a loop. It also buys the thing the kind needs most.
 * Two parts are interchangeable exactly when their form and size match, so
 * congruence is a string comparison rather than a geometric one, and a scene
 * cannot accidentally contain two shapes that are *nearly* the same.
 *
 * A scene is authored inside one 240x240 box, and every part carries that whole
 * box (`kinds/polygon.ts` explains why). Three rules hold for all of them, and
 * `tests/polygon.test.ts` holds them to it:
 *
 *  - **parts never overlap.** They may touch and they may leave gaps - the sky
 *    showing between a sail and a hull is fine - but two pieces on top of each
 *    other would fight over which is drawn on top;
 *  - **parts are of a size with each other.** The layout packs the tray by what
 *    a piece draws, so the smallest part of a scene is what decides how big the
 *    whole scene may be. A window-sized piece in a house-sized scene would
 *    shrink the house until nothing in it was worth grabbing. Nothing here is
 *    smaller than a third of the box, and for a six-part scene nothing is much
 *    bigger than half of it either;
 *  - **parts a child cannot tell apart are identical.** A target is a shadow,
 *    and a shadow has no colour: two same-shaped shadows must therefore be
 *    filled by two pieces that match in every way, or swapping them would
 *    change the picture. Same form and size means same fill and same detail.
 */
import type { Point, Rect, Size } from "./geometry";
import { pieceId, type PieceShape } from "./piece";

/** The box every scene is authored in, and every one of its parts carries. */
export const SCENE_BOX: Size = { width: 240, height: 240 };

/**
 * A part's geometry: what it is and how big, with no position in it. Two parts
 * with the same form are the same shape, which is the whole basis of one piece
 * standing in for another.
 */
export type Form =
  | { readonly form: "square"; readonly size: number }
  | { readonly form: "rectangle"; readonly width: number; readonly height: number }
  | { readonly form: "circle"; readonly diameter: number }
  /** An isosceles triangle, with its point on the named side of its box. */
  | {
      readonly form: "triangle";
      readonly width: number;
      readonly height: number;
      readonly point: "up" | "down" | "left" | "right";
    }
  /** A right-angled triangle: the upright edge is on the named side. */
  | {
      readonly form: "wedge";
      readonly width: number;
      readonly height: number;
      readonly upright: "left" | "right";
    }
  /** A trapezium standing on its longer edge, both edges centred. */
  | {
      readonly form: "trapezoid";
      readonly top: number;
      readonly bottom: number;
      readonly height: number;
    };

/** One shape in a scene: what it is, where it sits, and how it is painted. */
export interface ScenePart {
  /** What this part is in the picture, for the spoken label: "roof", "sail". */
  readonly name: string;
  readonly shape: Form;
  /** Top-left of the part's own bounds, in scene-box units. */
  readonly at: Point;
  readonly fill: string;
  /**
   * Extra markup drawn on top of the part - a window, an eye - in the part's
   * *own* units, measured from its top-left corner. Its own units rather than
   * the scene's, so that two copies of one part carry the same detail string
   * and draw it in the same place on each of them.
   *
   * It must stay inside the part's outline: it is drawn with the piece, and
   * would otherwise hang over a neighbour or over nothing at all.
   */
  readonly detail?: string;
}

export interface Scene {
  readonly id: string;
  /** Spoken description of the finished picture. */
  readonly label: string;
  readonly parts: readonly ScenePart[];
}

/** Round a generated coordinate to something a human can read in a diff. */
const n = (value: number): number => Number(value.toFixed(2));

/** The size a form draws, which is also the size of the box it sits in. */
export function sizeOf(shape: Form): Size {
  switch (shape.form) {
    case "square":
      return { width: shape.size, height: shape.size };
    case "rectangle":
      return { width: shape.width, height: shape.height };
    case "circle":
      return { width: shape.diameter, height: shape.diameter };
    case "triangle":
    case "wedge":
      return { width: shape.width, height: shape.height };
    case "trapezoid":
      return { width: Math.max(shape.top, shape.bottom), height: shape.height };
  }
}

/** The corners of a form, in its own box units, or null for a circle. */
function cornersOfForm(shape: Form): readonly Point[] | null {
  const { width, height } = sizeOf(shape);
  switch (shape.form) {
    case "square":
    case "rectangle":
      return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ];
    case "circle":
      return null;
    case "triangle": {
      const corners = {
        up: [
          { x: width / 2, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ],
        down: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width / 2, y: height },
        ],
        left: [
          { x: 0, y: height / 2 },
          { x: width, y: 0 },
          { x: width, y: height },
        ],
        right: [
          { x: 0, y: 0 },
          { x: width, y: height / 2 },
          { x: 0, y: height },
        ],
      };
      return corners[shape.point];
    }
    case "wedge":
      return shape.upright === "left"
        ? [
            { x: 0, y: 0 },
            { x: width, y: height },
            { x: 0, y: height },
          ]
        : [
            { x: width, y: 0 },
            { x: width, y: height },
            { x: 0, y: height },
          ];
    case "trapezoid": {
      const top = (width - shape.top) / 2;
      const bottom = (width - shape.bottom) / 2;
      return [
        { x: top, y: 0 },
        { x: width - top, y: 0 },
        { x: width - bottom, y: height },
        { x: bottom, y: height },
      ];
    }
  }
}

/**
 * A part's outline as path data, in scene-box coordinates. This is the one path
 * the piece, its shadow and the finished picture are all drawn from - the same
 * rule an animal's silhouette follows, for the same reason.
 */
export function outlineOf(part: ScenePart): string {
  const { x, y } = part.at;
  const corners = cornersOfForm(part.shape);
  if (corners === null) {
    const radius = sizeOf(part.shape).width / 2;
    // Two half-circle arcs, which is the only way an SVG path draws a circle.
    return (
      `M${n(x)} ${n(y + radius)}` +
      `a${n(radius)} ${n(radius)} 0 1 0 ${n(radius * 2)} 0` +
      `a${n(radius)} ${n(radius)} 0 1 0 ${n(-radius * 2)} 0Z`
    );
  }
  return `${corners
    .map((corner, index) => `${index === 0 ? "M" : "L"}${n(x + corner.x)} ${n(y + corner.y)}`)
    .join(" ")} Z`;
}

/**
 * The corners of a part, in scene-box units. Null for a circle, which has none
 * - measure that one from its middle.
 */
export function cornersOf(part: ScenePart): readonly Point[] | null {
  const corners = cornersOfForm(part.shape);
  return corners?.map(({ x, y }) => ({ x: part.at.x + x, y: part.at.y + y })) ?? null;
}

/** A part's own bounds within the scene box: what it draws, and nothing else. */
export function boundsOf(part: ScenePart): Rect {
  return { x: part.at.x, y: part.at.y, ...sizeOf(part.shape) };
}

/**
 * What makes two parts interchangeable: identical form, identical size. Nothing
 * about where they are, because that is exactly what a child is allowed to
 * choose between, and nothing about colour, because a scene may not paint two
 * parts of one signature differently in the first place.
 */
export function signatureOf(part: ScenePart): string {
  const entries = Object.entries(part.shape).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(",");
}

/** The word for a form, so a piece can say what shape it is out loud. */
export function shapeName(shape: Form): string {
  switch (shape.form) {
    case "square":
      return "square";
    case "rectangle":
      return "rectangle";
    case "circle":
      return "circle";
    case "triangle":
    case "wedge":
      return "triangle";
    case "trapezoid":
      return "trapezium";
  }
}

/** Everything a scene covers, which is what the whole picture stands on. */
export function sceneBounds(scene: Scene): Rect {
  const boxes = scene.parts.map(boundsOf);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Where a scene stands: the middle of its foot. Every part carries this same
 * anchor, so the layout stands the whole picture on the ground line rather than
 * each shape on a line of its own.
 */
export function sceneAnchor(scene: Scene): Point {
  const bounds = sceneBounds(scene);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
}

// --- the palette ----------------------------------------------------------
// Strong, flat colour and nothing else. A target is a shadow, so what has to
// carry "this one goes here" is the shape; colour is what makes the finished
// picture worth having made.

const RED = "#e5392f";
const ORANGE = "#f5871f";
const YELLOW = "#ffcc29";
const GREEN = "#52b043";
const BLUE = "#2f8fd8";
const PINK = "#ef6ea8";
const SLATE = "#465a6b";

/** A pale window or porthole, drawn inside the part that carries it. */
const pane = (x: number, y: number, width: number, height: number, radius = 6): string =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ` +
  `fill="#ffffff" fill-opacity="0.82" />`;

const dot = (x: number, y: number, radius: number, fill: string): string =>
  `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" />`;

/**
 * `count` circles of one size, spaced evenly around a ring. The petals of a
 * flower are identical by construction this way rather than by five copied
 * literals that could drift apart.
 */
function ring(
  count: number,
  centre: Point,
  radius: number,
  diameter: number,
  name: string,
  fill: string,
): ScenePart[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    return {
      name,
      shape: { form: "circle", diameter } as const,
      at: {
        x: n(centre.x + radius * Math.cos(angle) - diameter / 2),
        y: n(centre.y + radius * Math.sin(angle) - diameter / 2),
      },
      fill,
    };
  });
}

/** The same part in several places: the only way two pieces are made equal. */
function copies(part: Omit<ScenePart, "at">, places: readonly Point[]): ScenePart[] {
  return places.map((at) => ({ ...part, at }));
}

// --- the scenes -----------------------------------------------------------
//
// The catalogue is longer than the chapter. A polygon level names the picture
// it stands (`shapePicture` in the level table), and the shapes chapter has
// five rows for these nine, so `rocket`, `fish`, `flower` and `train` stand
// unused. They are spares, kept on purpose: retuning the chapter is then a
// table edit rather than an afternoon's drawing, and the geometry half of
// `tests/polygon.test.ts` goes on holding them to the same rules as the rest.

export const SCENES: readonly Scene[] = [
  {
    id: "house",
    label: "a house",
    parts: [
      {
        name: "roof",
        shape: { form: "triangle", width: 240, height: 120, point: "up" },
        at: { x: 0, y: 0 },
        fill: RED,
      },
      ...copies(
        {
          name: "wall",
          shape: { form: "square", size: 120 },
          fill: YELLOW,
          detail: pane(38, 28, 44, 44),
        },
        [
          { x: 0, y: 120 },
          { x: 120, y: 120 },
        ],
      ),
    ],
  },

  {
    id: "boat",
    label: "a boat",
    parts: [
      {
        name: "hull",
        shape: { form: "trapezoid", top: 240, bottom: 170, height: 80 },
        at: { x: 0, y: 160 },
        fill: RED,
      },
      {
        name: "big sail",
        shape: { form: "wedge", width: 100, height: 150, upright: "left" },
        at: { x: 124, y: 10 },
        fill: YELLOW,
      },
      {
        name: "little sail",
        shape: { form: "wedge", width: 82, height: 112, upright: "right" },
        at: { x: 34, y: 48 },
        fill: ORANGE,
      },
    ],
  },

  {
    id: "rocket",
    label: "a rocket",
    parts: [
      {
        name: "nose",
        shape: { form: "triangle", width: 130, height: 80, point: "up" },
        at: { x: 55, y: 0 },
        fill: RED,
      },
      {
        name: "body",
        shape: { form: "rectangle", width: 130, height: 160 },
        at: { x: 55, y: 80 },
        fill: BLUE,
        detail: dot(65, 55, 30, "#ffffff") + dot(65, 55, 22, "#bfe3ff"),
      },
      {
        name: "fin",
        shape: { form: "wedge", width: 55, height: 90, upright: "right" },
        at: { x: 0, y: 150 },
        fill: ORANGE,
      },
      {
        name: "fin",
        shape: { form: "wedge", width: 55, height: 90, upright: "left" },
        at: { x: 185, y: 150 },
        fill: ORANGE,
      },
    ],
  },

  {
    id: "car",
    label: "a car",
    parts: [
      {
        name: "roof",
        shape: { form: "trapezoid", top: 100, bottom: 150, height: 62 },
        at: { x: 45, y: 8 },
        fill: BLUE,
        detail: pane(30, 12, 90, 38),
      },
      {
        name: "body",
        shape: { form: "rectangle", width: 200, height: 74 },
        at: { x: 20, y: 70 },
        fill: RED,
      },
      ...copies(
        {
          name: "wheel",
          shape: { form: "circle", diameter: 96 },
          fill: SLATE,
          detail: dot(48, 48, 20, "#c9d4dd"),
        },
        [
          { x: 16, y: 144 },
          { x: 128, y: 144 },
        ],
      ),
    ],
  },

  {
    id: "fish",
    label: "a fish",
    parts: [
      {
        name: "body",
        shape: { form: "circle", diameter: 140 },
        at: { x: 0, y: 50 },
        fill: ORANGE,
        detail: dot(95, 45, 15, "#ffffff") + dot(99, 45, 7, "#28323c"),
      },
      {
        name: "tail",
        shape: { form: "triangle", width: 85, height: 140, point: "left" },
        at: { x: 155, y: 50 },
        fill: RED,
      },
      {
        name: "fin",
        shape: { form: "triangle", width: 88, height: 50, point: "up" },
        at: { x: 26, y: 0 },
        fill: YELLOW,
      },
      {
        name: "fin",
        shape: { form: "triangle", width: 88, height: 50, point: "down" },
        at: { x: 26, y: 190 },
        fill: YELLOW,
      },
    ],
  },

  {
    id: "flower",
    label: "a flower",
    parts: [
      {
        name: "middle",
        shape: { form: "circle", diameter: 68 },
        at: { x: 86, y: 86 },
        fill: YELLOW,
      },
      ...ring(4, { x: 120, y: 120 }, 76, 84, "petal", PINK),
    ],
  },

  {
    id: "butterfly",
    label: "a butterfly",
    parts: [
      {
        name: "body",
        shape: { form: "rectangle", width: 44, height: 180 },
        at: { x: 98, y: 30 },
        fill: SLATE,
        detail: dot(22, 22, 9, "#ffffff"),
      },
      ...copies({ name: "top wing", shape: { form: "circle", diameter: 96 }, fill: PINK }, [
        { x: 0, y: 32 },
        { x: 144, y: 32 },
      ]),
      ...copies({ name: "bottom wing", shape: { form: "circle", diameter: 80 }, fill: ORANGE }, [
        { x: 8, y: 144 },
        { x: 152, y: 144 },
      ]),
    ],
  },

  {
    id: "train",
    label: "a train",
    parts: [
      {
        name: "engine",
        shape: { form: "rectangle", width: 76, height: 96 },
        at: { x: 0, y: 40 },
        fill: RED,
        detail: pane(14, 14, 48, 34),
      },
      ...copies(
        {
          name: "carriage",
          shape: { form: "square", size: 76 },
          fill: GREEN,
          detail: pane(20, 20, 36, 36),
        },
        [
          { x: 82, y: 60 },
          { x: 164, y: 60 },
        ],
      ),
      ...copies({ name: "wheel", shape: { form: "circle", diameter: 76 }, fill: SLATE }, [
        { x: 0, y: 142 },
        { x: 82, y: 142 },
        { x: 164, y: 142 },
      ]),
    ],
  },

  {
    id: "sunflower",
    label: "a sunflower",
    parts: [
      {
        name: "middle",
        shape: { form: "circle", diameter: 68 },
        at: { x: 86, y: 92 },
        fill: "#ffffff",
      },
      ...ring(5, { x: 120, y: 126 }, 78, 88, "petal", PINK),
    ],
  },
];

/** The scenes built from this many pieces, in catalogue order. */
export const scenesOf = (parts: number): readonly Scene[] =>
  SCENES.filter((scene) => scene.parts.length === parts);

/** The scene with this id, or nothing. A level names one; nobody guesses. */
export const sceneById = (id: string): Scene | undefined => SCENES.find((scene) => scene.id === id);

/** How many pieces the catalogue can build a scene from, smallest first. */
export const SCENE_SIZES: readonly number[] = [
  ...new Set(SCENES.map((scene) => scene.parts.length)),
].sort((a, b) => a - b);

/**
 * A part as it is drawn: its own outline, filled, with whatever sits on it -
 * the detail shifted from the part's units to the scene's, which is what lets
 * two copies of a part share one detail string.
 */
const artworkOf = (part: ScenePart): string => {
  const body = `<path d="${outlineOf(part)}" fill="${part.fill}" />`;
  if (!part.detail) return body;
  return `${body}<g transform="translate(${part.at.x} ${part.at.y})">${part.detail}</g>`;
};

export interface SceneShapes {
  /** The whole picture: what the layout stands in the scene, with one hole. */
  readonly picture: PieceShape;
  /** One piece per part, in the order the scene authored them. */
  readonly parts: readonly PieceShape[];
}

/**
 * A scene as pieces. Every part carries the *whole* scene box and the scene's
 * one anchor, exactly as a slice carries its animal's: it is what makes the
 * parts assemble by construction rather than by arithmetic, since each of them
 * is drawn where the scene put it and settles onto the same origin.
 *
 * What a part draws is its `inked` bounds, which is what the tray, the canvas
 * clamp and the grab box measure - otherwise a tray of six shapes would be laid
 * out as though it held six whole pictures.
 */
export function sceneShapes(scene: Scene): SceneShapes {
  const anchor = sceneAnchor(scene);
  const parts = scene.parts.map((part, index): PieceShape => ({
    id: pieceId(`polygon:${scene.id}:${index}`),
    outline: outlineOf(part),
    artwork: artworkOf(part),
    box: SCENE_BOX,
    inked: boundsOf(part),
    anchor,
    label: `${part.name}, a ${shapeName(part.shape)}`,
  }));
  return {
    picture: {
      id: pieceId(`polygon:${scene.id}`),
      outline: scene.parts.map(outlineOf).join(" "),
      artwork: scene.parts.map(artworkOf).join(""),
      box: SCENE_BOX,
      inked: sceneBounds(scene),
      anchor,
      label: scene.label,
    },
    parts,
  };
}
