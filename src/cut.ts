/**
 * How a piece cut out of a bigger drawing is drawn: the clips that cut it out,
 * and the white edge along the cut.
 *
 * Shared by the two cutters that hand one drawing to several pieces - an animal
 * in slices (`slices.ts`) and a picture in pieces (`picture-pieces.ts`) - so a
 * join looks the same wherever it is made, and so the bargain below is written
 * down once rather than twice.
 *
 * **A cut edge belongs to a piece that is still loose.** While it is in the
 * tray or under a finger, the white line is what makes a quarter of a cow read
 * as a piece of something rather than as a smudge. Once it is home the line has
 * said everything it had to say, and what is left to look at is the animal or
 * the picture - so it fades out as the piece settles (`.piece.is-placed .cut`
 * in `style.css`), and the parts that are in place read as one drawing.
 *
 * **A finished drawing is clipped a hair wider than it was cut**, which is what
 * makes that fade worth having. Two neighbours clipped to exactly the same line
 * do not quite meet: each paints the boundary pixel at partial coverage, so up
 * to a quarter of whatever is behind them shows through as a pale hairline down
 * the join. While the drawing is being built that hairline is harmless - what
 * is behind it is the guide, which is the same picture dimmed - but the guide
 * goes when the last piece lands, and then the only thing left down the join is
 * the background. So the last piece switches every piece from the clip it was
 * cut with to one nudged `overlap` each way, neighbours overlap by about a
 * pixel instead of meeting exactly, and the seams close as the picture becomes
 * a picture. The overlap cannot show: every piece of one drawing is that
 * drawing at the same scale and origin, so the pixels two neighbours argue over
 * are the same pixels.
 *
 * Switched rather than always on, because the wider clip is only free once the
 * drawing is whole. A loose piece would show a sliver of its neighbour's
 * drawing outside its own white edge, and a piece placed early would spill over
 * the empty cell next to it - as would the last piece itself, which is still
 * sliding home when the drawing is declared whole. Both are `.cut-art` in
 * `style.css`, keyed off the `is-complete` the host puts on the stage and held
 * back from any piece that is still moving.
 *
 * Do not "tidy" the nudged copies away, and do not shrink the overlap to zero:
 * both undo the seamless picture. The reasoning is
 * docs/decisions/A placed piece has no edge.md.
 */
import type { Size } from "./geometry";

/**
 * How far a slice of an animal may spill past its cut, in the units the animal
 * is drawn in.
 *
 * Held to a hair, because an animal's artwork is not all opaque - a tail
 * feather and a trunk wrinkle are painted translucent over the body
 * (`parrot.svg`, `elephant.svg`) - and anything two neighbours both draw
 * is painted twice. A hair's worth is thinner than the hairline it closes; a
 * wide band would trade a pale seam for a dark one.
 */
export const SLICE_OVERLAP = 1.5;

/**
 * How far a piece of a cut-up picture may spill past its cut, in picture-box
 * units.
 *
 * Wider than a slice's, and it can afford to be: a scene is drawn in flat
 * opaque colour, so an overlap is a piece painting exactly what its neighbour
 * already painted. It has to be wider, too - a picture is laid out at about
 * three quarters of its drawn size, so it takes four units to cover the pixel
 * the join is smeared across, where an animal is drawn at nearer its own size.
 * Measured, not guessed: at 3 the seam was still there and at 4 it was gone.
 */
export const PICTURE_OVERLAP = 5;

const nudges = (overlap: number): readonly (readonly [number, number])[] => [
  [0, 0],
  [-overlap, 0],
  [overlap, 0],
  [0, -overlap],
  [0, overlap],
];

/** The two clips a cut piece needs, and what to hang them on. */
export interface CutClip {
  /** The `<clipPath>`s, for the piece's own `<defs>`. */
  readonly defs: string;
  /**
   * Attributes for the group that draws the piece's share of the drawing: the
   * clip it was cut with, and both clips as custom properties for `style.css`
   * to choose between. The attribute is the one that applies if a browser will
   * not do the switch, so the worst case is the cut it was drawn with.
   */
  readonly attrs: string;
}

/**
 * The clips that cut `outline` out of a drawing: the cut itself, and the cut
 * spread by `overlap`. The union of the nudged copies always contains the
 * outline, so switching to it can only ever gain a piece a sliver at a join -
 * never lose one.
 */
export function cutClip(id: string, outline: string, overlap: number): CutClip {
  const exact = `${id}-cut`;
  const spread = `${id}-spread`;
  const copies = nudges(overlap)
    .map(([dx, dy]) =>
      dx === 0 && dy === 0
        ? `<path d="${outline}" />`
        : `<path d="${outline}" transform="translate(${dx} ${dy})" />`,
    )
    .join("");
  return {
    defs: `<clipPath id="${exact}"><path d="${outline}" /></clipPath>
      <clipPath id="${spread}">${copies}</clipPath>`,
    attrs: `class="cut-art" clip-path="url(#${exact})"
      style="--cut-exact: url(#${exact}); --cut-spread: url(#${spread})"`,
  };
}

/**
 * A clip holding a piece to the drawing it came out of, for the spread clip to
 * spill into rather than past. Without it the pieces along the edge of a
 * picture would grow a rim of whatever the scene draws outside its box when the
 * picture was finished.
 */
export function cutBounds(id: string, box: Size): string {
  return `<clipPath id="${id}"><rect width="${box.width}" height="${box.height}" /></clipPath>`;
}

/**
 * The white line along a cut, which fades away once the piece is placed. The
 * `cut` class is what `style.css` fades, so an edge drawn without it would
 * stay on the finished picture.
 */
export function cutEdge(outline: string, width: number, opacity: number): string {
  return `<path class="cut" d="${outline}" fill="none"
    stroke="#ffffff" stroke-opacity="${opacity}" stroke-width="${width}" />`;
}
