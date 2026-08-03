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
   *
   * Required, and required of every kind, because everything that measures a
   * piece as a *thing to grab and to place* goes through `gripOf` below, which
   * starts here. A piece cut out of a bigger drawing keeps the whole drawing's
   * box - every slice of one animal has to, or the slices would not assemble -
   * so a slice's box is mostly empty, and a tray of eight slices must not be
   * laid out as though it held eight whole animals.
   *
   * It used to be optional, and a piece that said nothing was taken to fill its
   * box. Only the animals said nothing, and no animal fills its box: a pig
   * draws a little over half its box's height, so a whole pig was placed by a
   * box twice as tall as the pig. Saying nothing is no longer allowed. An
   * animal's is measured and committed as `ANIMAL_INK` in `assets.ts`. See
   * docs/decisions/One box measures a piece, and one rule places it.md.
   */
  readonly inked: Rect;
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

/** Where a shape draws, in its own box units. */
export function inkOf(shape: PieceShape): Rect {
  return shape.inked;
}

/**
 * How far a piece's box reaches past its drawing, as a fraction of the shorter
 * side of *that drawing*. Enough to cover the outline's stroke, which measuring
 * the geometry leaves out, plus a little for a toddler aiming at an edge.
 *
 * A share of the drawing rather than of the authored box, because a piece cut
 * out of a bigger picture keeps the whole picture's box: measured from the box,
 * a twelfth of a jigsaw would be given a margin a third of its own size, and
 * the tray would be packing margins rather than pieces. The *margin* is never
 * taken outside the authored box: an animal drawn to its own edges gets none,
 * and needs none, because the drawing is already there.
 *
 * The thickening that follows it is not clamped, and a sliver lying along an
 * edge does end up with a box that runs outside the authored one - the boat's
 * hull at level 16 by about a twelfth of its box. That is the right way round:
 * clamping there would push the box off the drawing's centre, and the centre is
 * the thing the whole rule aims at. Nothing downstream minds, because the tray
 * cuts its cell from this box rather than from the authored one.
 */
export const GRAB_PADDING = 0.04;

/**
 * The thinnest a piece's box may be: no side less than half the other.
 *
 * A long thin piece is hard to aim, and a box the shape of the sliver would
 * give it the least room to be aimed at - punishing the same piece twice. See
 * docs/decisions/One box measures a piece, and one rule places it.md.
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
 * Every kind is taken at its word about where it draws, and nothing measures a
 * rendered piece to find out: a box the layout worked out and a box the board
 * measured could disagree, and then a piece would be grabbable somewhere it
 * could not be placed from.
 */
export function gripOf(shape: PieceShape): Rect {
  const drawn = inkOf(shape);
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
