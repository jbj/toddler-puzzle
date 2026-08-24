/**
 * Coming back tomorrow.
 *
 * The store's whole job is to be unbreakable, so nearly all of this is the
 * unhappy paths: a browser that throws on the sight of `localStorage`, one that
 * accepts a write and loses it, a record another tab mangled, a record from a
 * version of this game that no longer exists, and a level number the table has
 * since dropped. Each of them has to end with a playable game on a real level,
 * and none of them may throw.
 *
 * Storage is injected, so all of it runs in Node. The DOM-facing ends - which
 * level to start on, and recording each one as it is reached - are `main.ts`
 * and `game.ts`, and are covered by the screenshot run, which reloads the page
 * and checks it comes back where it was.
 */
import { describe, expect, it } from "vitest";
import { LEVEL_COUNT, PUZZLE_KINDS } from "../src/levels";
import {
  ALL_KINDS,
  DEFAULT_SETTINGS,
  NEW_PLAYER,
  STORAGE_KEY,
  STORAGE_VERSION,
  browserStorage,
  createProgressStore,
  readProgress,
  type StorageLike,
} from "../src/progress";

/** A working `localStorage`, and a way to see what actually landed in it. */
function fakeStorage(initial?: string): StorageLike & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  if (initial !== undefined) items.set(STORAGE_KEY, initial);
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** iPad Safari in private browsing: every call throws, including the read. */
const hostileStorage = (): StorageLike => ({
  getItem() {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  setItem() {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  removeItem() {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
});

/** Storage that reads back but refuses to keep anything: a full disk, a quota. */
const fullStorage = (initial?: string): StorageLike => ({
  getItem: (key) => (key === STORAGE_KEY ? (initial ?? null) : null),
  setItem() {
    throw new DOMException("QuotaExceededError", "QuotaExceededError");
  },
  removeItem() {
    /* nothing to remove */
  },
});

/** A record as another visit would have left it - or as nothing sane would. */
const stored = (record: Record<string, unknown>): string =>
  JSON.stringify({ version: STORAGE_VERSION, ...record });

describe("reading a stored record", () => {
  it("starts a new player at level 1 with the default settings", () => {
    expect(readProgress(fakeStorage())).toEqual(NEW_PLAYER);
    expect(readProgress(null)).toEqual(NEW_PLAYER);
  });

  it("resumes on the level the child stopped on", () => {
    const progress = readProgress(fakeStorage(stored({ level: 7, furthest: 9 })));
    expect(progress.level).toBe(7);
    expect(progress.furthest).toBe(9);
  });

  it.each([
    ["not JSON at all", "{ this is not"],
    ["JSON that is not an object", '"level 7"'],
    ["an array", "[7]"],
    ["null", "null"],
    ["an empty record", "{}"],
  ])("falls back to a new player when the record is %s", (_why, raw) => {
    expect(readProgress(fakeStorage(raw))).toEqual(NEW_PLAYER);
  });

  it("drops a record written by a version it does not know", () => {
    const future = JSON.stringify({ version: STORAGE_VERSION + 1, level: 12, furthest: 12 });
    expect(readProgress(fakeStorage(future))).toEqual(NEW_PLAYER);
    const ancient = JSON.stringify({ level: 12, furthest: 12 });
    expect(readProgress(fakeStorage(ancient))).toEqual(NEW_PLAYER);
  });

  it.each([
    ["past the end of the table", LEVEL_COUNT + 1],
    ["below the first level", 0],
    ["not a whole number", 6.5],
    ["not a number", "seven"],
  ])("starts over when the stored level is %s", (_why, level) => {
    const progress = readProgress(fakeStorage(stored({ level })));
    expect(progress.level).toBe(1);
    expect(progress.furthest).toBe(1);
  });

  it("keeps a grown-up's settings even when the level has to be dropped", () => {
    const progress = readProgress(
      fakeStorage(
        stored({
          level: LEVEL_COUNT + 10,
          settings: { sound: false },
        }),
      ),
    );
    expect(progress.level).toBe(1);
    expect(progress.settings).toEqual({ ...DEFAULT_SETTINGS, sound: false });
  });

  it("passes over a setting this build no longer has", () => {
    // `rotation` was stored by every build up to the one that dropped rotation
    // mode. A record written then is not a broken record, and reading one must
    // not cost the child their level or a grown-up the settings that remain.
    const progress = readProgress(
      fakeStorage(
        stored({
          level: 9,
          settings: { sound: false, rotation: true },
        }),
      ),
    );
    expect(progress.level).toBe(9);
    expect(progress.settings).toEqual({ ...DEFAULT_SETTINGS, sound: false });
    expect(progress.settings).not.toHaveProperty("rotation");
  });

  it("starts every kind of puzzle in play, including for a record written before them", () => {
    // The switches arrived after the game shipped, so a record from before them
    // has no `kinds` at all. It has to read as the game it was written by,
    // which is the whole ramp.
    expect(DEFAULT_SETTINGS.kinds).toEqual(ALL_KINDS);
    const progress = readProgress(fakeStorage(stored({ level: 9, settings: { sound: false } })));
    expect(progress.settings.kinds).toEqual(ALL_KINDS);
  });

  it("reads the kinds a grown-up switched off, and nothing else", () => {
    const progress = readProgress(
      fakeStorage(
        stored({
          level: 9,
          settings: { sound: true, kinds: { jigsaw: false, kaleidoscope: false } },
        }),
      ),
    );
    expect(progress.settings.kinds).toEqual({ ...ALL_KINDS, jigsaw: false });
    expect(progress.settings.kinds).not.toHaveProperty("kaleidoscope");
  });

  it("reads a kind that is not a boolean as being in play", () => {
    const progress = readProgress(
      fakeStorage(stored({ level: 9, settings: { kinds: { jigsaw: "no", sliced: 0 } } })),
    );
    expect(progress.settings.kinds).toEqual(ALL_KINDS);
  });

  it("reads a record with every kind switched off as every kind in play", () => {
    // Nothing the panel can do produces one - it refuses to turn the last kind
    // off - but a game with no levels in it is not something to hand a child
    // because another tab wrote nonsense under the key.
    const off = Object.fromEntries(PUZZLE_KINDS.map((kind) => [kind, false]));
    const progress = readProgress(fakeStorage(stored({ level: 9, settings: { kinds: off } })));
    expect(progress.settings.kinds).toEqual(ALL_KINDS);
  });

  it("replaces a setting it does not recognise with the default", () => {
    const progress = readProgress(fakeStorage(stored({ level: 3, settings: { sound: "loud" } })));
    expect(progress.settings).toEqual(DEFAULT_SETTINGS);
    expect(progress.level).toBe(3);
  });

  it("keeps a level that is ahead of the furthest one played", () => {
    // Which is what a grown-up choosing level 9 out of the panel's level map
    // leaves behind: the child is on 9 without having played their way there,
    // and raising `furthest` to meet it would quietly mark seven levels as
    // played that nobody has played. See `jumpToLevel`.
    const progress = readProgress(fakeStorage(stored({ level: 9, furthest: 2 })));
    expect(progress).toMatchObject({ level: 9, furthest: 2 });
  });

  it("survives a browser that throws on the read", () => {
    expect(readProgress(hostileStorage())).toEqual(NEW_PLAYER);
  });
});

describe("finding the browser's storage", () => {
  /** Put something in `globalThis.localStorage` for the length of one test. */
  function withLocalStorage(define: () => PropertyDescriptor, run: () => void): void {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, ...define() });
    try {
      run();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }

  it("gives up on a browser that throws at the mention of it", () => {
    withLocalStorage(
      () => ({
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      }),
      () => expect(browserStorage()).toBeNull(),
    );
  });

  it("gives up where there is no localStorage at all", () => {
    withLocalStorage(
      () => ({ value: undefined }),
      () => expect(browserStorage()).toBeNull(),
    );
  });

  it("hands back storage that can be read but not written", () => {
    // The record from yesterday is still in there. Refusing the whole thing
    // because tomorrow's write will fail would lose a place that was never
    // actually lost.
    const readOnly = fullStorage(stored({ level: 17, furthest: 17 }));
    withLocalStorage(
      () => ({ value: readOnly }),
      () => {
        const storage = browserStorage();
        expect(storage).toBe(readOnly);
        expect(createProgressStore({ storage }).read().level).toBe(17);
      },
    );
  });
});

describe("the store", () => {
  it("remembers each level as it is reached", () => {
    const storage = fakeStorage();
    const store = createProgressStore({ storage });
    store.reachLevel(2);
    store.reachLevel(3);
    expect(store.read().level).toBe(3);
    expect(store.persists).toBe(true);
    // What a reload sees, which is the only thing that matters.
    expect(readProgress(storage)).toEqual({ level: 3, furthest: 3, settings: DEFAULT_SETTINGS });
  });

  it("keeps the furthest level reached when the game loops back", () => {
    const store = createProgressStore({ storage: fakeStorage() });
    store.reachLevel(LEVEL_COUNT);
    store.reachLevel(1);
    expect(store.read()).toMatchObject({ level: 1, furthest: LEVEL_COUNT });
  });

  it("writes nothing when the level is re-dealt", () => {
    const storage = fakeStorage();
    const store = createProgressStore({ storage });
    store.reachLevel(4);
    const afterFirst = storage.items.get(STORAGE_KEY);
    // What the reset button does: the same level again, and again.
    store.reachLevel(4);
    store.reachLevel(4);
    expect(storage.items.get(STORAGE_KEY)).toBe(afterFirst);
    expect(store.read().level).toBe(4);
  });

  it("ignores a level the table does not have", () => {
    const store = createProgressStore({ storage: fakeStorage() });
    store.reachLevel(5);
    store.reachLevel(LEVEL_COUNT + 1);
    store.reachLevel(0);
    store.reachLevel(Number.NaN);
    expect(store.read().level).toBe(5);
  });

  it("plays on in memory when there is no storage at all", () => {
    const store = createProgressStore({ storage: null });
    expect(store.read()).toEqual(NEW_PLAYER);
    store.reachLevel(6);
    expect(store.read().level).toBe(6);
    expect(store.persists).toBe(false);
  });

  it("plays on when every storage call throws", () => {
    const store = createProgressStore({ storage: hostileStorage() });
    expect(store.read()).toEqual(NEW_PLAYER);
    expect(() => store.reachLevel(8)).not.toThrow();
    expect(store.read().level).toBe(8);
    expect(store.updateSetting("sound", false).sound).toBe(false);
    expect(store.clearProgress().level).toBe(1);
    expect(store.persists).toBe(false);
  });

  it("plays on when a write is refused after a good read", () => {
    const store = createProgressStore({
      storage: fullStorage(stored({ level: 11, furthest: 11 })),
    });
    expect(store.read().level).toBe(11);
    store.reachLevel(12);
    expect(store.read().level).toBe(12);
    expect(store.persists).toBe(false);
  });

  it("resumes from storage it can read but not write to", () => {
    // A device out of quota is still holding yesterday's record, and reading it
    // is the whole point: the child's place is right there. Only `persists`
    // knows the difference, and it knows before anything has been written.
    const store = createProgressStore({
      storage: fullStorage(stored({ level: 13, furthest: 13 })),
    });
    expect(store.read()).toMatchObject({ level: 13, furthest: 13 });
    expect(store.persists).toBe(false);
  });

  it("never promises to remember again once a write has been lost", () => {
    let refuse = true;
    const flaky: StorageLike = {
      getItem: () => null,
      setItem() {
        if (refuse) throw new DOMException("QuotaExceededError", "QuotaExceededError");
      },
      removeItem() {
        if (refuse) throw new DOMException("QuotaExceededError", "QuotaExceededError");
      },
    };
    const store = createProgressStore({ storage: flaky });
    expect(store.persists).toBe(false);

    refuse = false;
    store.reachLevel(3);
    // This write landed, but a device that has already dropped a record cannot
    // be promised to keep the next one, and the grown-up panel would rather say
    // so plainly than take it back.
    expect(store.read().level).toBe(3);
    expect(store.persists).toBe(false);
  });

  it("changes one setting and leaves the others alone", () => {
    const storage = fakeStorage();
    const store = createProgressStore({ storage });
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    store.reachLevel(5);
    expect(store.updateSetting("sound", false)).toEqual({ ...DEFAULT_SETTINGS, sound: false });
    expect(store.updateSetting("kinds", { ...ALL_KINDS, shatter: false })).toEqual({
      ...DEFAULT_SETTINGS,
      sound: false,
      kinds: { ...ALL_KINDS, shatter: false },
    });
    // Settings and progress live in one record and neither disturbs the other.
    expect(readProgress(storage)).toEqual({
      level: 5,
      furthest: 5,
      settings: { ...DEFAULT_SETTINGS, sound: false, kinds: { ...ALL_KINDS, shatter: false } },
    });
  });

  it("clears progress back to level 1, keeping the settings", () => {
    const storage = fakeStorage();
    const store = createProgressStore({ storage });
    store.reachLevel(14);
    store.updateSetting("sound", false);
    expect(store.clearProgress()).toEqual({
      level: 1,
      furthest: 1,
      settings: { ...DEFAULT_SETTINGS, sound: false },
    });
    expect(readProgress(storage).furthest).toBe(1);
  });

  it("leaves the saved level alone for a session started by a deep link", () => {
    const storage = fakeStorage(stored({ level: 4, furthest: 4 }));
    const store = createProgressStore({ storage, trackLevel: false });
    // `?level=30` plays the last level and loops back to the first; neither
    // moves the place the child had got to.
    store.reachLevel(LEVEL_COUNT);
    store.reachLevel(1);
    expect(readProgress(storage)).toMatchObject({ level: 4, furthest: 4 });
    // A grown-up changing a setting is deliberate, so it is still written.
    store.updateSetting("sound", false);
    expect(readProgress(storage)).toMatchObject({
      level: 4,
      settings: { ...DEFAULT_SETTINGS, sound: false },
    });
  });
});

/**
 * The level map in the grown-up panel is the only caller. It is a different
 * method from `reachLevel` because it means something different: a grown-up
 * moving the child, rather than the child getting somewhere.
 */
describe("a level chosen from the panel", () => {
  it("moves the child there and remembers it", () => {
    const storage = fakeStorage();
    const store = createProgressStore({ storage });
    store.reachLevel(6);
    store.jumpToLevel(20);
    expect(store.read().level).toBe(20);
    expect(readProgress(storage).level).toBe(20);
  });

  it("does not claim the child ever got there", () => {
    const store = createProgressStore({ storage: fakeStorage() });
    store.reachLevel(6);
    store.jumpToLevel(30);
    // Reading the map must never fill the map in, or one look at the last
    // level marks all thirty as played for ever.
    expect(store.read().furthest).toBe(6);
  });

  it("leaves the furthest level alone when a grown-up goes back", () => {
    const store = createProgressStore({ storage: fakeStorage() });
    store.reachLevel(12);
    store.jumpToLevel(2);
    expect(store.read()).toMatchObject({ level: 2, furthest: 12 });
    // Playing on from there is the child's own progress again, and is capped
    // by where they had already got to.
    store.reachLevel(3);
    expect(store.read()).toMatchObject({ level: 3, furthest: 12 });
  });

  it("counts a chosen level the child then plays past", () => {
    const store = createProgressStore({ storage: fakeStorage() });
    store.jumpToLevel(20);
    store.reachLevel(21);
    expect(store.read()).toMatchObject({ level: 21, furthest: 21 });
  });

  it("ignores a level the table does not have", () => {
    const store = createProgressStore({ storage: fakeStorage() });
    store.reachLevel(5);
    store.jumpToLevel(LEVEL_COUNT + 1);
    store.jumpToLevel(0);
    store.jumpToLevel(2.5);
    expect(store.read()).toMatchObject({ level: 5, furthest: 5 });
  });

  it("is written even in a session started by a deep link", () => {
    const storage = fakeStorage(stored({ level: 4, furthest: 4 }));
    const store = createProgressStore({ storage, trackLevel: false });
    // Nothing about `?level=` was chosen, so it is not remembered; picking a
    // level out of the panel is as deliberate as changing a setting.
    store.jumpToLevel(8);
    expect(readProgress(storage)).toMatchObject({ level: 8, furthest: 4 });
  });
});
