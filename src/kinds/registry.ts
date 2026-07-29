/**
 * Which kind plays a level, and when its code arrives.
 *
 * The level table (`levels.ts`) says what each of the thirty levels is by
 * naming a `PuzzleKindId`; the registry is what turns that name into the kind
 * that implements it. Every id the table uses has a loader here, and
 * `tests/levels.test.ts` holds the table and the registry to each other, so a
 * level naming a kind nobody wrote is caught by the tests rather than by a
 * child.
 *
 * ## Why a kind is where the bundle is cut
 *
 * A chapter is five levels and, near enough, one kind: chapter 3 is `sliced`,
 * chapter 4 is `polygon`, chapter 5 is `jigsaw`. So splitting the bundle by
 * kind *is* splitting it by chapter, and it degrades gracefully for chapter 6,
 * which mixes three. Each kind brings its own artwork and machinery with it -
 * the slice recipes, the shape catalogue, the scenes, the cutter, the shatterer
 * - which is most of what the game weighs.
 *
 * `play` and `shapeMatch` are imported *statically*, because they are the whole
 * of chapters 1 and 2: the opening of the game must never wait for anything.
 * The other four are `import()`ed, and every one of them is pulled in during
 * play, long before the child reaches it - `warm.ts` does that. By the time a
 * kind is needed it is in memory, and asking for it costs a resolved promise.
 * See
 * [decision 20260729T223500](../../docs/decisions/20260729T223500-a-chapter-is-warmed-before-it-is-needed.md).
 *
 * `kindFor` stays synchronous and stays strict, so the host and the tests can
 * go on treating a kind as a plain object; `ensureKind` is the one place that
 * waits.
 *
 * There used to be a stand-in here: a level whose kind did not exist yet was
 * played as shape-match, so the whole ramp was playable while the kinds were
 * still being written. Shatter was the last of them, and the stand-in went with
 * it. See
 * [decision 20260728T205627](../../docs/decisions/20260728T205627-unbuilt-kinds-play-as-stand-ins.md).
 */
import type { LevelSpec, PuzzleKindId } from "../levels";
import type { PuzzleKind } from "../puzzle";
import { play } from "./play";
import { shapeMatch } from "./shape-match";

/**
 * How to get hold of each kind. The two the first two chapters need resolve
 * without a fetch; the rest are a chunk each.
 */
const LOADERS: Record<PuzzleKindId, () => Promise<PuzzleKind>> = {
  play: () => Promise.resolve(play),
  "shape-match": () => Promise.resolve(shapeMatch),
  sliced: async () => (await import("./sliced")).sliced,
  polygon: async () => (await import("./polygon")).polygon,
  jigsaw: async () => (await import("./jigsaw")).jigsaw,
  shatter: async () => (await import("./shatter")).shatter,
};

/** Every kind the game has, whether or not its code has arrived. */
export const KIND_IDS = Object.keys(LOADERS) as readonly PuzzleKindId[];

const registry = new Map<PuzzleKindId, PuzzleKind>();
const arriving = new Map<PuzzleKindId, Promise<PuzzleKind>>();

/** Add a kind, under the id the level table names it by. */
export function registerKind(kind: PuzzleKind): void {
  registry.set(kind.id, kind);
}

registerKind(play);
registerKind(shapeMatch);

/** Is there a kind under this id at all? Says nothing about it having loaded. */
export const isKindRegistered = (id: PuzzleKindId): boolean => id in LOADERS;

/** Has this kind's code arrived, so that `kindFor` would hand it over? */
export const isKindLoaded = (id: PuzzleKindId): boolean => registry.has(id);

/**
 * The kind's code, fetching it if this is the first time it has been asked for.
 *
 * A failed fetch is forgotten rather than remembered, so asking again tries
 * again: a chunk that did not arrive on a flaky connection should not condemn
 * the level that needs it for the rest of the sitting.
 */
export function ensureKind(id: PuzzleKindId): Promise<PuzzleKind> {
  const loaded = registry.get(id);
  if (loaded) return Promise.resolve(loaded);

  const load = LOADERS[id];
  if (!load) {
    return Promise.reject(new Error(`Nothing is registered under the kind "${id}".`));
  }

  let pending = arriving.get(id);
  if (!pending) {
    pending = load().then((kind) => {
      registerKind(kind);
      return kind;
    });
    pending.catch(() => arriving.delete(id));
    arriving.set(id, pending);
  }
  return pending;
}

/** Every kind, loaded. For the tests, and for whatever wants the lot. */
export async function loadAllKinds(): Promise<void> {
  await Promise.all(KIND_IDS.map((id) => ensureKind(id)));
}

/**
 * The kind that plays this level. Throws rather than falls back: a level naming
 * a kind that does not exist is a mistake in the table, and one the tests catch
 * long before a child could. A kind that exists but has not arrived yet throws
 * too, and says so differently - that is a caller who should have gone through
 * `ensureKind`, not a broken table.
 */
export function kindFor(spec: LevelSpec): PuzzleKind {
  const kind = registry.get(spec.kind);
  if (!kind) {
    if (isKindRegistered(spec.kind)) {
      throw new Error(
        `Level ${spec.level} needs "${spec.kind}", whose code has not loaded yet; await ensureKind first.`,
      );
    }
    throw new Error(`Level ${spec.level} names "${spec.kind}", which no kind is registered under.`);
  }
  return kind;
}
