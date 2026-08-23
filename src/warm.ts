/**
 * Before changing this file, read docs/puzzle-kinds.md.
 *
 * Pulling the rest of the game in while the child plays the part they have.
 *
 * The bundle is split by kind (`kinds/registry.ts`), and the celebration that
 * ends a chapter is a chunk of its own, so first paint no longer waits for
 * artwork the child will not see for a while. Split naively that would be a
 * *worse* game, not a smaller one: a two-year-old who finishes a level and is
 * shown nothing while its kind downloads has been let down.
 *
 * So nothing here is loaded on demand. It is loaded *early*, in the background,
 * in the order the levels will want it, starting as soon as the first board is
 * standing and the child is busy. A level takes a toddler tens of seconds; a
 * chunk takes milliseconds. By the time any of it is needed it is in memory,
 * and the level seam is a resolved promise rather than a fetch.
 *
 * That is also what keeps the offline promise. Everything is fetched during the
 * *first* sitting, so the browser cache has every chunk for later play.
 * See docs/decisions/A chapter is warmed before it is needed, not fetched when
 * it is.md.
 *
 * Failures are swallowed. A warm is an optimisation: if one does not arrive,
 * the thing that needs it asks again at the point of use, and both `ensureKind`
 * and the game's celebration loader are written to allow exactly that.
 */
import { ensureKind } from "./kinds/registry";
import { LEVELS, type PuzzleKindId } from "./levels";

/**
 * Every kind still to come, in the order the levels ask for them, wrapping
 * round to the ones already passed - a grown-up can send the child back to
 * level 3 from the panel, and the reset button re-deals whatever is on screen.
 */
export function kindsAhead(fromLevel: number): readonly PuzzleKindId[] {
  const ordered = [
    ...LEVELS.filter((level) => level.level >= fromLevel),
    ...LEVELS.filter((level) => level.level < fromLevel),
  ];
  return [...new Set(ordered.map((level) => level.kind))];
}

/**
 * Fetch what is coming, one thing at a time.
 *
 * The celebration goes first: every level ends with one, so it is needed
 * before anything else here, and it is the single largest piece of the game. Then
 * the kinds, in play order. Sequential rather than all at once, so the warm
 * never competes with itself.
 */
async function warm(fromLevel: number): Promise<void> {
  await import("./celebration").catch(() => null);
  for (const kind of kindsAhead(fromLevel)) {
    await ensureKind(kind).catch(() => null);
  }
}

/**
 * Start warming once the browser has nothing better to do.
 *
 * `requestIdleCallback` is not in Safari on an iPad, which is the device this
 * whole change is for, so the timeout is the real path there rather than a
 * fallback nobody takes.
 */
export function warmAhead(fromLevel: number): void {
  const start = (): void => void warm(fromLevel);
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(start, { timeout: 2000 });
  } else {
    window.setTimeout(start, 500);
  }
}
