/**
 * Before changing this file, read docs/cutting.md.
 *
 * A cut-up picture as pieces: the frame, and one clipped piece per cell.
 *
 * The half the two picture chapters share. A jigsaw cuts rows and columns
 * (`jigsaw.ts`) and a shatter cuts irregular shards (`shatter.ts`), and once
 * either of them has decided where the lines go, what happens next is the same
 * thing and should be one piece of code: **a piece is the scene's own markup
 * through a clip path**, and the frame is the whole scene as the single thing
 * to fill.
 *
 * Nothing here intersects artwork with anything. One hand-drawn scene serves a
 * 2x2 jigsaw, a 4x3 jigsaw and an eight-piece shatter without being redrawn,
 * two neighbours cannot draw the same pixel differently, and the guide under
 * the empty frame is drawn from the very paths the pieces are clipped with.
 *
 * Every piece keeps the *whole* picture box and the picture's own anchor. Two
 * things follow, and they are the two things both chapters need:
 *
 *  - laid out, every piece gets the same scale and the same origin, so a piece
 *    settles into the picture rather than being placed in it;
 *  - what a piece draws is a corner of a box it mostly leaves empty, so `inked`
 *    is what the tray packs by and what a hand has to find.
 *
 * What the clip and the white edge along it are doing is `cut.ts`: the edge is
 * for a piece that is still loose and goes when the piece is home, and the clip
 * is a hair wider than the edge so the finished picture has no seams in it.
 */
import { cutBounds, cutClip, cutEdge, PICTURE_OVERLAP } from "./cut";
import type { Point, Rect, Size } from "./geometry";
import type { Layout } from "./layout";
import { renderTrayBands } from "./scenery";
import { pieceId, type PieceShape } from "./piece";
import type { Picture } from "./pictures";

/** One piece of a cut-up picture: what to call it, and where it is. */
export interface CutCell {
  /** What tells this piece from the others of the same picture, in its id. */
  readonly name: string;
  /** The closed path the piece is clipped out of the picture with. */
  readonly outline: string;
  /** Everything the piece draws, in picture-box units. */
  readonly ink: Rect;
}

/** A picture cut up: the whole thing to build it in, and the pieces to build. */
export interface PicturePieces {
  /** The picture itself: the single target, with one hole cut for it. */
  readonly frame: PieceShape;
  /** One piece per cell, in the order the cutter made them. */
  readonly pieces: readonly PieceShape[];
}

/**
 * The id the frame of a cut-up picture is known by. The way it was cut is part
 * of it, so a shattered farmyard and a jigsawed one are never the same piece.
 */
export const pictureFrameId = (picture: Picture, kind: string): string => `${kind}:${picture.id}`;

/** An id that is safe to interpolate into an SVG `id` attribute. */
const clipId = (piece: string): string => `cut-${piece.replaceAll(":", "-")}`;

/**
 * Where a picture stands: the middle of its bottom edge. Every piece carries
 * it, exactly as every slice carries its animal's anchor, so the layout gives
 * the whole cast one scale and one origin and the picture assembles itself.
 */
const anchorOf = (box: Size): Point => ({ x: box.width / 2, y: box.height });

/** A picture and the cells it was cut into, as a puzzle's worth of shapes. */
export function picturePieces(
  picture: Picture,
  kind: string,
  cells: readonly CutCell[],
): PicturePieces {
  const { box } = picture;
  const anchor = anchorOf(box);
  const frame = pictureFrameId(picture, kind);

  const pieces = cells.map((cell, index): PieceShape => {
    const id = `${frame}:${cell.name}`;
    const clip = clipId(id);
    const cut = cutClip(clip, cell.outline, PICTURE_OVERLAP);
    return {
      id: pieceId(id),
      outline: cell.outline,
      artwork: `<g class="picture-piece">
        <defs>${cut.defs}${cutBounds(`${clip}-box`, box)}</defs>
        <g clip-path="url(#${clip}-box)">
          <g ${cut.attrs}>
            ${picture.artwork}
            ${cutEdge(cell.outline, 7, 0.75)}
          </g>
        </g>
      </g>`,
      box,
      inked: cell.ink,
      anchor,
      label: `${picture.label}, piece ${index + 1} of ${cells.length}`,
    };
  });

  return {
    frame: {
      id: pieceId(frame),
      outline: `M0 0 H${box.width} V${box.height} H0 Z`,
      artwork: picture.artwork,
      box,
      // A scene paints its whole box - `npm run art:check` insists on it - and
      // the frame is the whole scene, so it is the one shape that fills its box.
      inked: { x: 0, y: 0, width: box.width, height: box.height },
      anchor,
      label: picture.label,
    },
    pieces,
  };
}

/**
 * The empty frame, with the picture showing faintly through it and every cut
 * drawn on. Three layers, and each is doing a job:
 *
 *  - the picture itself, dimmed, so the child can see what they are making;
 *  - one outline per piece, so they can see where each piece goes - the *same*
 *    path the piece is clipped out of, so a piece covers its own line exactly;
 *  - the border, so the picture reads as a thing to fill even before any of it
 *    is filled.
 *
 * Dimmed rather than hidden while it is being filled, and gone once it is full:
 * a rim peeking out from under a finished picture is untidy, but the guide
 * under a half-built one is the whole point. A picture with nothing underneath
 * is a memory game; at two years old the game is to see where a piece goes.
 */
export function pictureGuide(
  frame: PieceShape,
  pieces: readonly PieceShape[],
  place: { readonly origin: Point; readonly scale: number; readonly filled: boolean },
): string {
  const cells = pieces
    .map(
      (piece) =>
        `<path class="cell" data-piece="${piece.id}" d="${piece.outline}"
           fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="5" />`,
    )
    .join("");
  return `
    <g class="hole" data-piece="${frame.id}"
       transform="translate(${place.origin.x} ${place.origin.y}) scale(${place.scale})"
       style="opacity: ${place.filled ? 0 : 1}">
      <path d="${frame.outline}" fill="#1f3b34" opacity="0.3" />
      <g opacity="0.34">${frame.artwork}</g>
      ${cells}
      <path d="${frame.outline}" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="8" />
    </g>
  `;
}

/**
 * The colour behind a picture board, which is the colour behind the page.
 *
 * The two have to agree: the canvas keeps its aspect ratio inside the window,
 * so one of them is showing above and below it whatever the screen, and a seam
 * there would draw the eye to the letterbox rather than to the picture. So it
 * is the *same* colour rather than two copies of one - `--board-blue` in
 * `src/style.css`, which the board inherits like any other element - and there
 * is nothing here that could drift out of step with the page. The shot run
 * checks the variable reaches both in a real browser.
 *
 * Written as `style="fill: ..."` rather than as a `fill` attribute, because a
 * presentation attribute is not reliably a CSS value and `var()` in one is not
 * reliably resolved; a style property is both. The literal is a fallback for a
 * board rendered somewhere the stylesheet is not, which nothing does today.
 */
export const PICTURE_BACKDROP = "var(--board-blue, #6fb8d4)";

/**
 * What a picture board is drawn on: flat colour, and the tray.
 *
 * No landscape. The hills and the sky are there so an animal has somewhere to
 * stand, and a picture does not stand anywhere - it is the scene, and putting
 * one scene inside another makes it a postcard held up in a field. Flat colour
 * also lets the picture take the whole board, which is the point of it: what is
 * left over at the edges is the page's own blue rather than a landscape too
 * small to be worth drawing. See
 * docs/decisions/Let a picture take the whole board.md.
 */
export function pictureBackdrop(layout: Layout): string {
  const { width, height } = layout.canvas;
  return (
    `<rect x="0" y="0" width="${width}" height="${height}" style="fill: ${PICTURE_BACKDROP}" />` +
    renderTrayBands(layout)
  );
}
