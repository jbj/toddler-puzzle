import { defineConfig } from "vite";

/**
 * The build is deliberately path-agnostic.
 *
 * GitHub Pages serves this repository at `/toddler-puzzle/`, while
 * `scripts/shot.mjs` serves `dist/` at the root of a local server, and
 * `npm run preview` does the same. A relative base emits `./assets/...`, which
 * is correct in all three, so one build artifact is the one that ships and the
 * one the screenshot run checks. See docs/decisions/0008.
 */
export default defineConfig({
  base: "./",
});
