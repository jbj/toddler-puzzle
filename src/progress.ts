/**
 * Before changing this file, read docs/navigation.md.
 *
 * Where the child got to, and what a grown-up has set.
 *
 * The game remembers the level it was left on and resumes there. It also holds
 * the grown-up settings: one small record, written when it changes and read at
 * boot.
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
 * A level number the table no longer has sends the child back to the start of
 * the ramp rather than to a board that cannot be built - see
 * docs/decisions/Remember where the child stopped.md.
 *
 * The storage object is injected, so all of this is exercised in Vitest without
 * a browser. `game.ts` and `main.ts` hold the only DOM-facing ends: which level
 * to start on, and recording each one as it is reached.
 */
import { LEVEL_COUNT, PUZZLE_KINDS, type EnabledKinds, type PuzzleKindId } from "./levels";

/**
 * How long the game waits before nudging an idle child. Read by
 * `hint.ts`, which owns both the delays and the glow.
 */
export type HintTiming = "off" | "sooner" | "later";

const HINT_TIMINGS: readonly HintTiming[] = ["off", "sooner", "later"];

/**
 * What a grown-up can change. Deliberately tiny and deliberately flat: a
 * handful of controls on one panel, each of which a parent can understand
 * without being told what it does.
 *
 * Unknown stored fields are ignored so removing a setting does not discard
 * otherwise valid progress.
 */
export interface Settings {
  /** Sound on. Off is for a quiet room, not for a preference about sound. */
  readonly sound: boolean;
  /** When an idle hint appears. */
  readonly hints: HintTiming;
  /**
   * Which kinds of puzzle are in play. A kind switched off is skipped wherever
   * it appears in the table. Never all off: invalid stored settings recover to
   * the full ramp.
   */
  readonly kinds: EnabledKinds;
}

/** One entry per kind, from a function that says whether each one is on. */
function kindsWhere(on: (kind: PuzzleKindId) => boolean): EnabledKinds {
  return Object.fromEntries(PUZZLE_KINDS.map((kind) => [kind, on(kind)])) as EnabledKinds;
}

/** Every kind in play, which is what a child who has never played gets. */
export const ALL_KINDS: EnabledKinds = kindsWhere(() => true);

/**
 * What a child who has never played gets. Sound on because the tones are half
 * the reward; hints late because a two-year-old who is still looking has not
 * given up; every kind of puzzle in play, because the ramp is the game and a
 * grown-up should have to decide to shorten it.
 */
export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  hints: "later",
  kinds: ALL_KINDS,
};

/** The whole stored record. */
export interface Progress {
  /** The level to resume on: the one the child stopped in the middle of. */
  readonly level: number;
  /**
   * The furthest level ever reached by playing, which only ever climbs. The
   * level map in the grown-up panel shows which levels have been seen;
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
 *
 * Adding or removing an independently parsed field does not change the record's
 * meaning. Unknown fields are ignored and missing fields use their defaults, so
 * those changes do not require discarding otherwise valid progress.
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
 * tomorrow's write will fail would discard a place that is sitting right there.
 * Whether writes land is `canWrite`'s question, and it decides `persists`
 * rather than whether there is any storage at all.
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

/**
 * Which kinds a stored record leaves in play. Each one stands on its own and
 * defaults to on, so a record written before this existed - or before a
 * seventh kind was added - reads as the whole ramp rather than as nothing.
 *
 * A record that says every kind is off is read as every kind on. The panel will
 * not produce one, but storage is shared with whatever else has written under
 * this key, and a game with no levels in it is not a failure worth passing on
 * to a two-year-old.
 */
function readKinds(raw: Record<string, unknown> | null): EnabledKinds {
  if (!raw) return ALL_KINDS;
  const kinds = kindsWhere((kind) => {
    const stored = raw[kind];
    return typeof stored === "boolean" ? stored : true;
  });
  return PUZZLE_KINDS.some((kind) => kinds[kind]) ? kinds : ALL_KINDS;
}

/** One setting, or the default when what was stored is not one of its values. */
function readSettings(raw: Record<string, unknown> | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  const hints = raw["hints"];
  return {
    sound: typeof raw["sound"] === "boolean" ? raw["sound"] : DEFAULT_SETTINGS.sound,
    hints: HINT_TIMINGS.includes(hints as HintTiming)
      ? (hints as HintTiming)
      : DEFAULT_SETTINGS.hints,
    kinds: readKinds(asRecord(raw["kinds"])),
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
 * each field stands or falls on its own, so a saved level absent from the
 * current table costs the child their place but not a grown-up's settings.
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
 * panel's.
 */
export interface ProgressStore {
  /** The record as it stands, whether or not any of it reached storage. */
  read(): Progress;
  /** The settings as they stand - what the panel's switches show. */
  settings(): Settings;
  /** Record that this level is being played now. Out-of-range is ignored. */
  reachLevel(level: number): Progress;
  /**
   * Put the child on this level because a grown-up chose it from the level map.
   * Out-of-range is ignored, as with `reachLevel`.
   *
   * Two things make this a different method rather than the same one.
   *
   * It leaves `furthest` alone. The map's whole job is to show where the child
   * actually got to, and a `reachLevel` here would fill the map in as a
   * grown-up read it. Where the child has been is something only playing can
   * change.
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
   * Back to the start of the ramp, keeping the settings. This is the grown-up
   * panel's reset and nothing else: the play-surface button only re-deals.
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
