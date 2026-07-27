/**
 * What a puzzle piece is, independent of where it came from.
 *
 * The engine - layout, board, drag, game - knows only this: a piece has an
 * identity, one outline, some artwork to draw inside it, the box it was
 * authored in, and a point it stands on. Animals are one provider of shapes
 * (`assets.ts`); a jigsaw cutter or a polygon builder can be another without
 * anything downstream having to learn about them.
 */
import type { Point, Size } from "./geometry";

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
   * Where the piece "sits" within its box, in box units. Standing an animal on
   * a ground line is the special case where the anchor is at its feet.
   */
  readonly anchor: Point;
  /** Spoken description, used for `aria-label`. */
  readonly label: string;
}
