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
 * See docs/decisions/A chapter is warmed before it is needed, not fetched when
 * it is.md.
 *
 * `kindFor` stays synchronous and stays strict, so the host and the tests can
 * go on treating a kind as a plain object; `ensureKind` is the one place that
 * waits.
 *
 * There used to be a stand-in here: a level whose kind did not exist yet was
 * played as shape-match, so the whole ramp was playable while the kinds were
 * still being written. Shatter was the last of them, and the stand-in went with
 * it. See
 * docs/decisions/Play an unbuilt kind as a stand-in.md.
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
 * A failed fetch is forgotten here, so asking again calls the loader again -
 * but see `recoverWhenPossible` below, because the browser is less forgiving
 * than this map is, and forgetting on this side does not undo remembering on
 * that one.
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

/**
 * How many fresh pages one sitting is allowed to ask for. Two is enough for a
 * connection that came back, and small enough that a page which cannot load its
 * own chunks settles down rather than blinking at a child.
 */
const RELOAD_LIMIT = 2;
const RELOAD_KEY = "animal-puzzle-chunk-reload";

/** Have we still got a reload in hand? Counted across reloads, so it converges. */
function mayReload(): boolean {
  try {
    const used = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (!(used < RELOAD_LIMIT)) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(used + 1));
    return true;
  } catch {
    // A browser that refuses storage - iPad Safari in private browsing throws
    // on the sight of it - cannot be counted with. One reload is still worth
    // having, and an `online` event that has already fired once will not fire
    // again without going offline in between, so this cannot run away.
    return true;
  }
}

/**
 * Get back from a chunk that would not come.
 *
 * This looks like something that should just be retried, and it is the one
 * thing here that cannot be. **A browser remembers a dynamic import that
 * failed.** Ask a second time for the module that was not there and you get the
 * same rejection back, immediately, without a request being made - the entry is
 * poisoned for the life of the page, and no amount of waiting or asking again
 * changes it. Only a different URL or a fresh page will do, which is why there
 * is no retry loop anywhere near `ensureKind`: it would be a loop that could
 * never succeed, which is worse than no loop at all.
 *
 * So the way back is a new page - and the only moment worth taking one is when
 * the device has *just come back online*, because that is the one moment a
 * fetch that failed would now succeed. Nothing happens while the connection is
 * still gone, and, deliberately, nothing happens if it was never gone: a chunk
 * that will not load on a working connection is a chunk that will not load on
 * the next page either, and reloading would cost the child the board they are
 * looking at to arrive back at the same place. Better to leave a game they can
 * play on the screen.
 *
 * Progress is written down before the wait begins, so the fresh page opens on
 * the level the child was going to rather than the one behind it. And the whole
 * thing is capped, across reloads, at `RELOAD_LIMIT`, so a connection that
 * flaps cannot make the game blink.
 *
 * See the "a chunk that did not arrive" section of docs/decisions/A chapter is
 * warmed before it is needed, not fetched when it is.md.
 */
export function recoverWhenPossible(): void {
  if (window.navigator.onLine) return;
  window.addEventListener("online", () => {
    if (mayReload()) window.location.reload();
  });
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
