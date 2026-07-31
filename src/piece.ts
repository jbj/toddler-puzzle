/**
 * What a puzzle piece is, independent of where it came from.
 *
 * The engine - layout, board, drag, game - knows only this: a piece has an
 * identity, one outline, some artwork to draw inside it, the box it was
 * authored in, and a point it stands on. Animals are one provider of shapes
 * (`assets.ts`); a jigsaw cutter or a polygon builder can be another without
 * anything downstream having to learn about them.
 */
import { padWithin, thickenTo, type Point, type Rect, type Size } from "./geometry";
import type { ThemeId } from "./themes";

/**
 * An opaque piece identity at the type level. Providers still need to choose
 * runtime strings that cannot collide - for example by namespacing them - so
 * two providers do not end up sharing a hole. This type cannot enforce that at
 * runtime; e.g. `animal:duck` and `jigsaw:piece-1`.
 */
export type PieceId = string & { readonly __piece: unique symbol };

/** Mint a piece identity from a provider-owned runtime string. */
export const pieceId = (value: string): PieceId => value as PieceId;

export interface PieceShape {
  readonly id: PieceId;
  /**
   * The `d` used for BOTH the piece and its target. One path is what makes it
   * impossible for a piece to drift out of alignment with its hole.
   */
  readonly outline: string;
  /**
   * Markup drawn inside the outline - the piece's own body and its details.
   * A provider must draw the body from `outline` itself, never from a second
   * path of its own.
   */
  readonly artwork: string;
  /** The box `outline` and `artwork` are authored in (240x240 for animals). */
  readonly box: Size;
  /**
   * Where inside that box the piece actually draws anything, in box units.
   * Left out, a piece is taken to fill its box, which is what an animal does.
   *
   * A piece cut out of a bigger drawing cannot: every slice of one animal has
   * to keep the animal's box and scale, or the slices would not assemble, so a
   * slice's box is mostly empty. Everything that measures the piece as a *thing
   * to grab and to place* goes through `gripOf` below, which starts here, so a
   * tray of eight slices is not laid out as though it held eight whole animals.
   */
  readonly inked?: Rect;
  /**
   * Where the piece "sits" within its box, in box units. Standing an animal on
   * a ground line is the special case where the anchor is at its feet.
   */
  readonly anchor: Point;
  /** Spoken description, used for `aria-label`. */
  readonly label: string;
  /**
   * The themed casts this piece belongs to, if its provider groups its pieces
   * that way (`themes.ts`). A level naming a theme deals from the pieces that
   * joined it, and reaches past them only when the theme cannot fill the board
   * on its own - so a piece with no themes is dealt last, not never. Optional
   * because a jigsaw slice or a triangle has no theme to be in.
   */
  readonly themes?: readonly ThemeId[];
}

/** Where a shape draws, in its own box units: what it declared, or all of it. */
export function inkOf(shape: PieceShape): Rect {
  return shape.inked ?? { x: 0, y: 0, width: shape.box.width, height: shape.box.height };
}

/**
 * How far a piece's box reaches past its drawing, as a fraction of the shorter
 * side of *that drawing*. Enough to cover the outline's stroke, which measuring
 * the geometry leaves out, plus a little for a toddler aiming at an edge.
 *
 * A share of the drawing rather than of the authored box, because a piece cut
 * out of a bigger picture keeps the whole picture's box: measured from the box,
 * a twelfth of a jigsaw would be given a margin a third of its own size, and
 * the tray would be packing margins rather than pieces. Never taken outside the
 * authored box either: an animal drawn to its own edges gets none, and needs
 * none, because the drawing is already there.
 */
export const GRAB_PADDING = 0.04;

/**
 * The thinnest a piece's box may be: no side less than half the other.
 *
 * A long thin piece is hard to aim, and a box the shape of the sliver would
 * give it the least room to be aimed at - punishing the same piece twice. See
 * [decision 20260731T133000](../docs/decisions/20260731T133000-one-box-measures-a-piece.md).
 */
export const GRIP_MIN_RATIO = 0.5;

/**
 * The one box a piece is measured by: what it draws, given a margin, thickened
 * so neither side is less than half the other. In the shape's own box units.
 *
 * This is what a piece can be grabbed by, what holds it on the canvas, what the
 * tray packs a cell from, and what decides whether a drop is on target. Four
 * questions, one answer, so a piece cannot be easy to pick up and hard to place
 * or the other way about.
 *
 * `drawn` is where the piece draws, for a caller that has measured it rather
 * than being told: an animal declares no `inked` and is measured on the board
 * (`fitGrabBox` in `board.ts`). Left out, the shape is taken at its word.
 */
export function gripOf(shape: PieceShape, drawn: Rect = inkOf(shape)): Rect {
  const box = { x: 0, y: 0, width: shape.box.width, height: shape.box.height };
  const padding = GRAB_PADDING * Math.min(drawn.width, drawn.height);
  return thickenTo(padWithin(drawn, padding, box), GRIP_MIN_RATIO);
}

/**
 * Insist that no two shapes share an identity. Two pieces with one id would
 * quietly share a target and a tray slot, which looks like a layout bug a long
 * way from the deal that caused it, so it is caught where the shapes arrive.
 */
export function assertUniquePieceIds(shapes: readonly PieceShape[], context: string): void {
  const seen = new Set<PieceId>();
  for (const shape of shapes) {
    if (seen.has(shape.id)) {
      throw new Error(`${context} needs unique piece ids; found duplicate "${shape.id}".`);
    }
    seen.add(shape.id);
  }
}
