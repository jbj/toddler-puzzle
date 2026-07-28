/**
 * Where the child got to, and what a grown-up has set.
 *
 * Thirty levels is more than one sitting, so the game remembers the level it
 * was left on and resumes there. It also holds the grown-up settings, because
 * they are the same sort of thing: one small record, written when it changes,
 * read once at boot.
 *
 * Two rules shape everything here.
 *
 * **Storage is a nicety, never a dependency.** iPad Safari in private browsing
 * throws on the mere mention of `localStorage`; a full disk throws on the
 * write; another tab can leave anything at all under the key. Every one of
 * those paths ends the same way: the store keeps the record in memory, the game
 * plays exactly as it always did, and nothing is reported to a two-year-old who
 * could not act on it anyway. Nothing in this file throws. Reading and writing
 * fail separately, though: storage that refuses every write is still read, so a
 * device out of quota resumes on the record it is holding rather than losing a
 * place that was never actually lost.
 *
 * **A stored level is a suggestion, not an instruction.** The record carries
 * `STORAGE_VERSION`, and every field is checked against the game as it is now.
 * A level number the table no longer has sends the child back to level 1 rather
 * than to a board that cannot be built - see
 * [decision 20260728T212500](../docs/decisions/20260728T212500-remember-where-the-child-stopped.md).
 *
 * The storage object is injected, so all of this is exercised in Vitest without
 * a browser. `game.ts` and `main.ts` hold the only DOM-facing ends: which level
 * to start on, and recording each one as it is reached.
 */
import { LEVEL_COUNT } from "./levels";

/**
 * How long the game waits before nudging an idle child (#21). Stored now so the
 * grown-up panel has somewhere to write it; nothing reads it yet.
 */
export type HintTiming = "off" | "sooner" | "later";

const HINT_TIMINGS: readonly HintTiming[] = ["off", "sooner", "later"];

/**
 * What a grown-up can change. Deliberately tiny and deliberately flat: four
 * switches on one panel (#8), each of which a parent can understand without
 * being told what it does.
 */
export interface Settings {
  /** Sound on. Off is for a quiet room, not for a preference about sound. */
  readonly sound: boolean;
  /** Rotation mode (#14): pieces arrive turned, and are tapped round. */
  readonly rotation: boolean;
  /** When an idle hint appears (#21). */
  readonly hints: HintTiming;
}

/**
 * What a child who has never played gets. Sound on because the tones are half
 * the reward; rotation off because it is the harder game; hints late because a
 * two-year-old who is still looking has not given up.
 */
export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  rotation: false,
  hints: "later",
};

/** The whole stored record. */
export interface Progress {
  /** The level to resume on: the one the child stopped in the middle of. */
  readonly level: number;
  /**
   * The furthest level ever reached by playing, which only ever climbs. The
   * level map in the grown-up panel (#8) shows which levels have been seen;
   * play itself never reads it, because the game only moves forward one level
   * at a time. A grown-up jumping about the map does not move it - see
   * `jumpToLevel`.
   */
  readonly furthest: number;
  readonly settings: Settings;
}

/** A child who has never played, and what every fallback here falls back to. */
export const NEW_PLAYER: Progress = { level: 1, furthest: 1, settings: DEFAULT_SETTINGS };

/** The one key this game owns. */
export const STORAGE_KEY = "animal-puzzle";

/**
 * Bumped when the meaning of a stored record changes - a level table retuned
 * enough that its numbers mean something else, say. An unrecognised version is
 * dropped whole rather than guessed at.
 */
export const STORAGE_VERSION = 1;

/** The part of the `Storage` interface this needs; anything may throw. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The browser's `localStorage`, or null where reaching for it throws - which is
 * what private browsing on iOS does, before any call is made.
 *
 * Anything that survives that is handed back, including storage that will
 * refuse every write. A browser can be out of quota and still hold the record
 * from yesterday, and reading that is the whole point: throwing it away because
 * tomorrow's write will fail would send the child back to level 1 while their
 * place was sitting right there. Whether writes land is `canWrite`'s question,
 * and it decides `persists` rather than whether there is any storage at all.
 *
 * The type says `localStorage` is always there; older and stranger browsers
 * disagree, which is what the `?? null` is for.
 */
export function browserStorage(): StorageLike | null {
  try {
    const storage: StorageLike | undefined = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether this storage will actually keep anything, asked before the game has
 * anything to write. Storage that is merely disabled rather than absent exists,
 * reads, and fails only when written to, so a probe is the only way to tell it
 * from the real thing.
 */
function canWrite(storage: StorageLike | null): boolean {
  if (!storage) return false;
  const probe = `${STORAGE_KEY}:probe`;
  try {
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const isLevel = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= LEVEL_COUNT;

/** One setting, or the default when what was stored is not one of its values. */
function readSettings(raw: Record<string, unknown> | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  const hints = raw["hints"];
  return {
    sound: typeof raw["sound"] === "boolean" ? raw["sound"] : DEFAULT_SETTINGS.sound,
    rotation: typeof raw["rotation"] === "boolean" ? raw["rotation"] : DEFAULT_SETTINGS.rotation,
    hints: HINT_TIMINGS.includes(hints as HintTiming)
      ? (hints as HintTiming)
      : DEFAULT_SETTINGS.hints,
  };
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Make sense of whatever is under the key, field by field.
 *
 * Anything unreadable - not there, not JSON, not an object, a version this
 * build does not know - is a new player. Within a record this build does know,
 * each field stands or falls on its own, so a level number the table has since
 * dropped costs the child their place but not a grown-up's settings.
 */
export function readProgress(storage: StorageLike | null): Progress {
  let stored: string | null;
  try {
    stored = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return NEW_PLAYER;
  }
  if (stored === null) return NEW_PLAYER;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return NEW_PLAYER;
  }

  const record = asRecord(parsed);
  if (!record || record["version"] !== STORAGE_VERSION) return NEW_PLAYER;

  const level = isLevel(record["level"]) ? record["level"] : NEW_PLAYER.level;
  const furthest = isLevel(record["furthest"]) ? record["furthest"] : NEW_PLAYER.furthest;
  return {
    level,
    // Read on its own merits, and deliberately not raised to meet `level`. The
    // two are allowed to disagree, because a grown-up who picks level 20 out of
    // the panel puts the child on a level they never played their way to, and
    // the level map's whole value is that it goes on saying so.
    furthest,
    settings: readSettings(asRecord(record["settings"])),
  };
}

/** Write the record. Returns whether it landed; a failure is not an error. */
export function writeProgress(storage: StorageLike | null, progress: Progress): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...progress }));
    return true;
  } catch {
    // Full, disabled, or a quota a private window pretends to have. The game
    // has the record in memory either way.
    return false;
  }
}

export interface ProgressStoreOptions {
  /** Where to persist. Null keeps everything in memory for this sitting. */
  readonly storage?: StorageLike | null;
  /**
   * Whether reaching a level is the child's own progress. False for a session
   * started by `?level=`, which is a tool for working on the game: a deep link
   * goes where it says without moving the place the child had got to. Settings
   * are still written, because changing one is always deliberate.
   */
  readonly trackLevel?: boolean;
}

/**
 * The record, and everything anyone does to it.
 *
 * The store is the single reader and writer of storage: it holds the record in
 * memory and writes through on every change, so a caller never has to know
 * whether storage worked. `reachLevel` is the game's; the rest are the grown-up
 * panel's (#8).
 */
export interface ProgressStore {
  /** The record as it stands, whether or not any of it reached storage. */
  read(): Progress;
  /** The settings as they stand - what the panel's switches show. */
  settings(): Settings;
  /** Record that this level is being played now. Out-of-range is ignored. */
  reachLevel(level: number): Progress;
  /**
   * Put the child on this level because a grown-up chose it from the level map
   * (#8). Out-of-range is ignored, as with `reachLevel`.
   *
   * Two things make this a different method rather than the same one.
   *
   * It leaves `furthest` alone. The map's whole job is to show where the child
   * actually got to, and a `reachLevel` here would fill the map in as a
   * grown-up read it: one look at level 30 and every level is marked reached,
   * for ever. Where the child has been is something only playing can change.
   *
   * And it writes even when `trackLevel` is off. A session opened by `?level=`
   * does not move the child's place, because nothing in it was chosen; picking
   * a level out of the panel is as deliberate as changing a setting, and is
   * kept for the same reason.
   */
  jumpToLevel(level: number): Progress;
  /** Change one setting, leaving the others where they are. */
  updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings;
  /**
   * Back to level 1, keeping the settings. This is the grown-up panel's reset
   * and nothing else: the button on the play surface re-deals the level being
   * played, and must never do this.
   */
  clearProgress(): Progress;
  /**
   * Whether this device will remember anything: false when there is no storage
   * to write to, false when a probe write is refused, and false from the first
   * write that fails. It never goes back to true - a device that has dropped
   * one record cannot be promised to keep the next one, and the grown-up panel
   * wants to be able to say "this will not be remembered" without qualifying
   * it. Nothing in the game changes either way.
   */
  readonly persists: boolean;
}

export function createProgressStore(options: ProgressStoreOptions = {}): ProgressStore {
  const storage = options.storage ?? null;
  const trackLevel = options.trackLevel ?? true;

  let progress = readProgress(storage);
  let persists = canWrite(storage);

  const save = (next: Progress): Progress => {
    progress = next;
    // Sticky downwards, never back up: see `persists` on ProgressStore.
    if (!writeProgress(storage, progress)) persists = false;
    return progress;
  };

  return {
    read: () => progress,
    settings: () => progress.settings,
    reachLevel(level) {
      if (!isLevel(level) || !trackLevel || level === progress.level) return progress;
      return save({ ...progress, level, furthest: Math.max(level, progress.furthest) });
    },
    jumpToLevel(level) {
      if (!isLevel(level) || level === progress.level) return progress;
      return save({ ...progress, level });
    },
    updateSetting(key, value) {
      return save({ ...progress, settings: { ...progress.settings, [key]: value } }).settings;
    },
    clearProgress() {
      return save({ ...NEW_PLAYER, settings: progress.settings });
    },
    get persists() {
      return persists;
    },
  };
}
