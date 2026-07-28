/**
 * Themed casts: the vocabulary a level and a piece both speak.
 *
 * A level names a theme (`levels.ts`) and a piece belongs to some (`piece.ts`),
 * and the deal narrows the second by the first. Neither of those files can own
 * the names without the other importing it, so they live here.
 *
 * ## A piece may belong to more than one theme
 *
 * `themesOf` returns a list rather than a single theme, because a butterfly
 * belongs over a meadow as much as it does under a canopy and a child does not
 * think in taxonomies. The rule is: **a piece joins every theme a child would
 * expect to find it in.** The cost of that is paid in `npm run art:check`,
 * which requires a piece to read distinctly from every other piece in *each*
 * theme it joined - so a wide membership is a promise about the drawing, not a
 * free way to fill a level up.
 */

/** The themed casts the level table draws from. */
export type ThemeId = "farm" | "sea" | "jungle" | "vehicles";

/**
 * Every theme, in the order the ramp first reaches them. `vehicles` is declared
 * and unused: it is a theme of things that are not animals, and nothing has
 * been drawn for it yet.
 */
export const THEMES: readonly ThemeId[] = ["farm", "sea", "jungle", "vehicles"];

/** Is this one of the themes? Used where a name arrives as a plain string. */
export const isThemeId = (value: string): value is ThemeId =>
  (THEMES as readonly string[]).includes(value);
