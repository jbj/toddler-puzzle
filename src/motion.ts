/**
 * One question, asked from several places: has this device asked for less
 * motion?
 *
 * The sparkles, the finish button's pulse and the bubbles all have to answer it,
 * and they answer it the same way - collapse the animation rather than remove
 * it, so the same code path still ends with the element where it belongs. It
 * lives on its own because the alternative is three copies of a `matchMedia`
 * call that could drift apart, and because a module that draws (`pop.ts`) and a
 * module that celebrates (`celebrate.ts`) both need it without needing each
 * other.
 *
 * Guarded for a document-less environment, so a kind's rules can still be tested
 * in Vitest without a DOM.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
