/**
 * Which kind plays a level, and what happens when that kind does not exist yet.
 *
 * The level table (`levels.ts`) describes the whole thirty-level curve,
 * including the kinds still to be built - sliced animals, tangrams, jigsaws,
 * shatter, cause-and-effect play. The registry is what lets the table run ahead
 * of the code: it maps a `PuzzleKindId` to the kind that implements it, and it
 * answers for the ones nobody has implemented.
 *
 * ## The stand-in
 *
 * A level naming a kind that is not registered is **played as shape-match**
 * rather than skipped or crashed on. That is deliberate, and temporary:
 *
 *  - the whole ramp is playable end to end today, so the shell around it -
 *    progress, chapters, the finale - can be built and screenshotted before the
 *    kinds land;
 *  - a stand-in keeps the level's place on the ramp rather than the missing
 *    kind's piece count. It deals one animal per chapter reached, capped at
 *    `MAX_STAND_IN_PIECES`, so the board goes on filling up instead of lurching
 *    back to two pieces at level 11;
 *  - everything else about the level - its number, its chapter, its
 *    forgiveness - is its own.
 *
 * Registering the real kind is all it takes to retire its stand-in; the level
 * table does not change. `standIn` on the result says which levels are still
 * being covered for, so nothing downstream has to guess whether a board is the
 * real thing.
 */
import {
  chapterNumber,
  derivedFrom,
  MAX_SNAP_FORGIVENESS,
  MIN_SNAP_FORGIVENESS,
  type LevelSpec,
  type PuzzleKindId,
} from "../levels";
import type { PuzzleKind } from "../puzzle";
import { polygon } from "./polygon";
import { shapeMatch } from "./shape-match";
import { sliced } from "./sliced";

/**
 * The most pieces a stand-in deals. Six animals is the busiest board the cast
 * of ten composes comfortably, and standing in for a twelve-piece jigsaw with
 * twelve animals would be a harder level than the one it is covering for.
 */
export const MAX_STAND_IN_PIECES = 6;

/** The kind every unbuilt kind is played as. */
const FALLBACK: PuzzleKind = shapeMatch;

const registry = new Map<PuzzleKindId, PuzzleKind>();

/**
 * Add a kind, under the id the level table names it by. A kind registers itself
 * here the moment it exists; until then its levels are covered by the stand-in.
 */
export function registerKind(kind: PuzzleKind): void {
  registry.set(kind.id, kind);
}

registerKind(shapeMatch);
registerKind(sliced);
registerKind(polygon);

/** Has this kind been built yet? */
export const isKindRegistered = (id: PuzzleKindId): boolean => registry.has(id);

export interface ResolvedLevel {
  /** The kind that will actually play this level. */
  readonly kind: PuzzleKind;
  /**
   * The level as it will actually be played: the table's own record, or the
   * stand-in for it. Everything downstream - the deal, the layout, the board -
   * uses this rather than the table entry, so a stand-in is one coherent level
   * rather than a level with a field quietly overridden behind its back.
   */
  readonly spec: LevelSpec;
  /** True when the level's own kind has not been built yet. */
  readonly standIn: boolean;
}

/**
 * What a stand-in deals: one animal per chapter reached and one more, so the
 * first chapter is not a single piece, capped at what shape-match plays well
 * and at the shapes actually on offer.
 */
function standInPieces(spec: LevelSpec, available: number): number {
  return Math.max(1, Math.min(chapterNumber(spec) + 1, MAX_STAND_IN_PIECES, available));
}

/**
 * Work out who plays this level. `available` is how many shapes the host has to
 * deal from, which is what stops a stand-in asking for more animals than exist.
 */
export function resolveLevel(spec: LevelSpec, available: number): ResolvedLevel {
  const kind = registry.get(spec.kind);
  if (kind) return { kind, spec, standIn: false };

  const pieces = standInPieces(spec, available);
  return {
    kind: FALLBACK,
    // Written out field by field rather than spread over: a stand-in is a
    // different level, and this is the list of what it keeps. Options are not
    // among them - shape-match has neither a grid nor a picture to cut up.
    // `derivedFrom` is what tells the layout this came from the table.
    spec: derivedFrom(spec, {
      level: spec.level,
      chapter: spec.chapter,
      kind: FALLBACK.id,
      ...(spec.theme === undefined ? {} : { theme: spec.theme }),
      targets: pieces,
      pieces,
      // Held inside the range the table promises, so an edit past either end
      // cannot reach the snap radius through the stand-in.
      snapForgiveness: Math.min(
        Math.max(spec.snapForgiveness, MIN_SNAP_FORGIVENESS),
        MAX_SNAP_FORGIVENESS,
      ),
    }),
    standIn: true,
  };
}
