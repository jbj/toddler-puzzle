/**
 * Hand-drawn SVG icons used by the chrome around the puzzle. They live here
 * rather than inline because the same icon is drawn at two sizes, and drawing
 * it twice by hand is how an icon drifts off centre.
 */

const round = (value: number): string => Number(value.toFixed(2)).toString();

/**
 * A circular arrow: a 270° arc centred exactly on the origin with the gap at
 * the top, and a solid arrowhead sitting on the end of the arc, tangent to it.
 *
 * Both parts are derived from the same centre and radius, so the arrow reads as
 * one continuous circle rather than a curve with a triangle beside it, and the
 * arc is symmetric about the vertical axis so it sits centred in a disc drawn
 * around the same origin.
 */
export function replayArrow(radius: number, strokeWidth: number, colour: string): string {
  // ±45° above the horizontal, leaving a 90° gap centred on straight up.
  const right = round(radius * Math.SQRT1_2);
  const left = round(-radius * Math.SQRT1_2);
  const top = left;

  // The arrowhead is drawn pointing along +y at (radius, 0), then rotated onto
  // the end of the arc: at 225° the arc's direction of travel is exactly +y.
  const half = strokeWidth * 1.35;
  const base = { near: round(radius - half), far: round(radius + half) };
  const tip = { x: round(radius), y: round(strokeWidth * 2) };

  return `
    <path d="M${right} ${top} A${radius} ${radius} 0 1 1 ${left} ${top}"
      fill="none" stroke="${colour}" stroke-width="${strokeWidth}" stroke-linecap="round" />
    <path d="M${base.near} 0 L${base.far} 0 L${tip.x} ${tip.y} Z"
      fill="${colour}" transform="rotate(225)" />
  `;
}
