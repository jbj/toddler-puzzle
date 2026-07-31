/**
 * Cutting an animal into slices - by clipping, never by cutting.
 *
 * A slice is not a new shape. It is the animal's own artwork, drawn through a
 * `clipPath` of one cell of the art box, so the slices of an animal mesh along
 * their shared edge exactly and the assembled animal is the animal. Nothing
 * here computes an intersection of the silhouette with anything: no polygon
 * boolean library, no runtime dependency, and no chance of a rounding error
 * opening a seam down the middle of a duck. See
 * [decision 20260729T061500](../docs/decisions/20260729T061500-slices-are-clipped-not-cut.md).
 *
 * The cells come from straight cuts arranged as a small binary tree. Each cut
 * names a cell and a line; the cell becomes the two halves that line divides it
 * into. Every cell is therefore the art box intersected with a handful of
 * half-planes, which is convex, which means it can be rebuilt at runtime by
 * clipping a rectangle a few times - forty lines of arithmetic below, testable
 * without a browser.
 *
 * Where the cuts go is not decided here. A good cut has to leave every slice
 * connected, similar in area and fat enough for a toddler to grab, and none of
 * that can be judged from path data - it needs the rendered pixels. So the cuts
 * are measured offline by `npm run art:slices`, committed to
 * `slice-recipes.json`, and re-checked by `npm run art:check`: the same
 * contract `FOOT_LEVEL` has, for the same reason.
 */
import { ART_BOX, type AnimalId } from "./assets";
import { cutClip, cutEdge, SLICE_OVERLAP } from "./cut";
import type { Point, Rect } from "./geometry";
import { pieceId, type PieceShape } from "./piece";
import recipes from "./slice-recipes.json";

/**
 * One straight cut: the line `x·cos(angle) + y·sin(angle) = at`, applied to the
 * cell at index `cell`. Angles are in degrees and `at` is in art units.
 *
 * Replaying a list of cuts is what turns it back into cells: the named cell
 * becomes the half of itself on the near side of the line, and the far half is
 * appended to the end of the list. Later cuts index into that growing list, so
 * the order of a recipe's cuts is part of the recipe.
 */
export interface Cut {
  readonly cell: number;
  readonly angle: number;
  readonly at: number;
}

/** A convex cell, as its corners in order. */
export type Cell = readonly Point[];

/** How many slices an animal may be cut into. */
export const SLICE_COUNTS = [2, 3, 4] as const;
export type SliceCount = (typeof SLICE_COUNTS)[number];

/**
 * A measured recipe: the cuts, and what each resulting slice actually draws.
 *
 * The ink cannot be worked out from the cuts, because a cell is a piece of the
 * *box* and a slice is a piece of the *animal*: the bottom-left cell of a
 * giraffe is mostly empty. It is measured from the rendered artwork offline,
 * and everything that treats a piece as a thing to grab and to lay out reads it
 * (`PieceShape.inked`).
 */
export interface SliceRecipe {
  readonly cuts: readonly Cut[];
  readonly ink: readonly Rect[];
}

/** The committed table, as it is stored: tuples, to stay reviewable. */
interface StoredRecipe {
  readonly cuts: readonly (readonly number[])[];
  readonly ink: readonly (readonly number[])[];
}

const STORED = recipes as Record<string, Record<string, StoredRecipe> | undefined>;

const number = (values: readonly number[], index: number, what: string): number => {
  const value = values[index];
  if (value === undefined) throw new Error(`Slice recipe has a short ${what}.`);
  return value;
};

/**
 * The recipe for cutting this animal into this many slices. Missing or
 * malformed is a broken build rather than something to play around: the table
 * is generated, and `npm run art:check` is what keeps it honest.
 */
export function sliceRecipe(animal: AnimalId, count: SliceCount): SliceRecipe {
  const stored = STORED[animal]?.[String(count)];
  if (!stored) {
    throw new Error(`No slice recipe for "${animal}" in ${count} - run \`npm run art:slices\`.`);
  }
  if (stored.cuts.length !== count - 1 || stored.ink.length !== count) {
    throw new Error(`Slice recipe for "${animal}" in ${count} is the wrong shape.`);
  }
  return {
    cuts: stored.cuts.map((cut) => ({
      cell: number(cut, 0, "cut"),
      angle: number(cut, 1, "cut"),
      at: number(cut, 2, "cut"),
    })),
    ink: stored.ink.map((box) => ({
      x: number(box, 0, "ink"),
      y: number(box, 1, "ink"),
      width: number(box, 2, "ink"),
      height: number(box, 3, "ink"),
    })),
  };
}

/** The whole art box, as a cell. */
const wholeBox = (size: number): Cell => [
  { x: 0, y: 0 },
  { x: size, y: 0 },
  { x: size, y: size },
  { x: 0, y: size },
];

/**
 * The part of a convex cell on one side of a line: Sutherland-Hodgman against a
 * single half-plane. `keepBelow` keeps `x·cos + y·sin <= at`.
 *
 * Both halves of a cut are produced by calling this twice with the same line,
 * which is what makes the two cells share an edge exactly rather than nearly:
 * each crossing point is computed from the same two corners and the same
 * distances, so the two halves get bit-identical corners.
 */
function halfOf(cell: Cell, angle: number, at: number, keepBelow: boolean): Cell {
  const radians = (angle * Math.PI) / 180;
  const nx = Math.cos(radians);
  const ny = Math.sin(radians);
  const side = (point: Point) => (keepBelow ? 1 : -1) * (nx * point.x + ny * point.y - at);

  const kept: Point[] = [];
  for (let index = 0; index < cell.length; index++) {
    const from = cell[index]!;
    const to = cell[(index + 1) % cell.length]!;
    const here = side(from);
    const there = side(to);
    if (here <= 0) kept.push(from);
    if ((here < 0 && there > 0) || (here > 0 && there < 0)) {
      const t = here / (here - there);
      kept.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  }
  return kept;
}

/**
 * Replay a recipe's cuts into cells. The result is `cuts.length + 1` convex
 * cells that tile the art box: no gaps, because every cut keeps both halves,
 * and no overlaps, because the two halves of a cut are opposite sides of one
 * line. `tests/slices.test.ts` holds both to account.
 */
export function cellsFrom(cuts: readonly Cut[], size: number = ART_BOX): readonly Cell[] {
  const cells: Cell[] = [wholeBox(size)];
  for (const { cell, angle, at } of cuts) {
    const target = cells[cell];
    if (!target) throw new Error(`Slice recipe cuts cell ${cell}, which does not exist yet.`);
    cells[cell] = halfOf(target, angle, at, true);
    cells.push(halfOf(target, angle, at, false));
  }
  return cells;
}

/** The area of a convex cell, by the shoelace formula. */
export function cellArea(cell: Cell): number {
  let sum = 0;
  for (let index = 0; index < cell.length; index++) {
    const from = cell[index]!;
    const to = cell[(index + 1) % cell.length]!;
    sum += from.x * to.y - to.x * from.y;
  }
  return Math.abs(sum) / 2;
}

/** A cell as path data, rounded to something a human can read in a diff. */
export function cellPath(cell: Cell): string {
  const round = (value: number) => Number(value.toFixed(3));
  return `${cell.map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`).join(" ")} Z`;
}

/** A piece id that is safe to interpolate into an SVG `id` attribute. */
const clipId = (piece: string, what: string) => `${what}-${piece.replaceAll(":", "-")}`;

/**
 * The slices of one animal, as pieces.
 *
 * Every slice keeps the animal's box, anchor and outline, and that is the whole
 * trick: laid out, all of them get the same scale and the same origin, so they
 * assemble into the animal by construction rather than by arithmetic. What each
 * one draws is the animal's artwork through its own cell, plus the cut edge
 * picked out in white so the join reads as a join - until the slice is home,
 * when the edge fades and the animal is an animal again (`cut.ts`).
 *
 * `inked` is what makes them behave as separate pieces despite the shared box -
 * the tray packs them by it, the canvas clamp holds them by it, and each gets a
 * grab box of its own rather than one animal-sized box they would all fight
 * over.
 */
export function sliceShapes(animal: PieceShape, count: SliceCount): readonly PieceShape[] {
  const recipe = sliceRecipe(animal.id as string as AnimalId, count);
  const cells = cellsFrom(recipe.cuts, animal.box.width);

  return cells.map((cell, index) => {
    const id = `slice:${animal.id}:${count}:${index}`;
    const cellClip = clipId(id, "cell");
    const bodyClip = clipId(id, "body");
    const path = cellPath(cell);
    const cut = cutClip(cellClip, path, SLICE_OVERLAP);
    return {
      id: pieceId(id),
      // The animal's own silhouette: one hole, cut once, that every slice of
      // this animal aims at.
      outline: animal.outline,
      artwork: `<g class="slice">
        <defs>
          ${cut.defs}
          <clipPath id="${bodyClip}"><path d="${animal.outline}" /></clipPath>
        </defs>
        <g clip-path="url(#${bodyClip})">
          <g ${cut.attrs}>${animal.artwork}</g>
          ${cutEdge(path, 4, 0.7)}
        </g>
      </g>`,
      box: animal.box,
      anchor: animal.anchor,
      inked: recipe.ink[index] ?? {
        x: 0,
        y: 0,
        width: animal.box.width,
        height: animal.box.height,
      },
      label: `${animal.label}, piece ${index + 1} of ${count}`,
    };
  });
}
