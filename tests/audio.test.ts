/**
 * The sounds, without a speaker.
 *
 * Nobody can hear a test, so this suite checks the two things that do not need
 * ears: that the vocabulary is *structured* right, and that the grown-up
 * panel's switch really does reach all of it.
 *
 * The switch is the one hard requirement, and it is checked by enumerating the
 * module's own exports rather than by listing the sounds here - a sound added
 * later that forgets the switch fails this suite instead of being met by a
 * grown-up on a train.
 *
 * What the samples actually sound like - peaks, clicks, how bright a sound is -
 * is `npm run audio:check`, which renders every one of these through a real
 * `OfflineAudioContext` in Chromium and measures it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as audio from "../src/audio";
import { CELEBRATIONS, type CelebrationId } from "../src/celebration";
import type { PuzzleKindId } from "../src/levels";

// --- a stand-in for Web Audio ---------------------------------------------

interface FakeParam {
  value: number;
  readonly points: { readonly value: number; readonly time: number }[];
}

interface FakeNode {
  readonly kind: string;
  type?: string;
  disconnected: number;
  onended: (() => void) | null;
  started: number | null;
  stopped: number | null;
  connect(to: FakeNode): FakeNode;
  disconnect(): void;
  start(at: number): void;
  stop(at: number): void;
}

interface FakeContext {
  readonly nodes: FakeNode[];
  readonly currentTime: number;
  readonly state: string;
  readonly destination: FakeNode;
  createGain(): FakeNode;
  createOscillator(): FakeNode;
  createWaveShaper(): FakeNode;
}

function param(): FakeParam {
  const points: { value: number; time: number }[] = [];
  return {
    value: 0,
    points,
    setValueAtTime(value: number, time: number) {
      points.push({ value, time });
    },
    exponentialRampToValueAtTime(value: number, time: number) {
      points.push({ value, time });
    },
    linearRampToValueAtTime(value: number, time: number) {
      points.push({ value, time });
    },
  } as unknown as FakeParam;
}

/** An audio param of a node, by the name Web Audio gives it. */
const paramOf = (node: FakeNode, name: string): FakeParam =>
  (node as unknown as Record<string, FakeParam>)[name] as FakeParam;

function fakeContext(): FakeContext {
  const nodes: FakeNode[] = [];
  const node = (kind: string, params: readonly string[]): FakeNode => {
    const made: FakeNode = {
      kind,
      disconnected: 0,
      onended: null,
      started: null,
      stopped: null,
      connect: (to: FakeNode) => to,
      disconnect() {
        made.disconnected += 1;
      },
      start(at: number) {
        made.started = at;
      },
      stop(at: number) {
        made.stopped = at;
      },
    };
    const named = made as unknown as Record<string, FakeParam>;
    for (const name of params) named[name] = param();
    nodes.push(made);
    return made;
  };
  return {
    nodes,
    currentTime: 0,
    state: "running",
    destination: node("destination", []),
    createGain: () => node("gain", ["gain"]),
    createOscillator: () => node("oscillator", ["frequency", "detune"]),
    createWaveShaper: () => node("shaper", []),
  };
}

const oscillators = (ctx: FakeContext): FakeNode[] =>
  ctx.nodes.filter((n) => n.kind === "oscillator");

/** The pitches a context was asked for, in the order they were scheduled. */
const pitches = (ctx: FakeContext): number[] =>
  oscillators(ctx).map((osc) => paramOf(osc, "frequency").points[0]?.value ?? 0);

let ctx: FakeContext;

beforeEach(() => {
  ctx = fakeContext();
  audio.useAudioContext(ctx as unknown as BaseAudioContext);
  audio.setSoundEnabled(true);
});

// --- what the game can be asked to play -----------------------------------

/**
 * Every sound the game exports, with an argument that makes sense for it. The
 * table is held to the module's exports below, so it cannot fall behind.
 */
const CALLS: Record<string, () => void> = {
  playPickUp: () => audio.playPickUp(),
  playSnap: () => audio.playSnap("shape-match"),
  playReturn: () => audio.playReturn(),
  playPop: () => audio.playPop(1),
  playPlink: () => audio.playPlink(0),
  playFirework: () => audio.playFirework(0),
  playFanfare: () => audio.playFanfare(1),
  playChapterFanfare: () => audio.playChapterFanfare("balloons"),
};

describe("the sound switch", () => {
  it("covers every sound the module exports", () => {
    const exported = Object.keys(audio).filter(
      (name) =>
        name.startsWith("play") &&
        typeof (audio as unknown as Record<string, unknown>)[name] === "function",
    );
    // A new sound goes in CALLS, which is what puts it through the two checks
    // below. Forgetting is the bug this line exists to catch.
    expect(new Set(exported)).toEqual(new Set(Object.keys(CALLS)));
  });

  it("silences every one of them when it is off", () => {
    audio.setSoundEnabled(false);
    for (const call of Object.values(CALLS)) call();
    for (const sound of audio.VOCABULARY) sound.play();
    expect(oscillators(ctx)).toHaveLength(0);
  });

  it("lets every one of them play when it is on", () => {
    for (const [name, call] of Object.entries(CALLS)) {
      const fresh = fakeContext();
      audio.useAudioContext(fresh as unknown as BaseAudioContext);
      call();
      expect(oscillators(fresh).length, name).toBeGreaterThan(0);
    }
  });

  it("says which way it is set", () => {
    audio.setSoundEnabled(false);
    expect(audio.soundEnabled()).toBe(false);
    audio.setSoundEnabled(true);
    expect(audio.soundEnabled()).toBe(true);
  });
});

// --- a voice for everything that needs one --------------------------------

const KINDS: readonly PuzzleKindId[] = [
  "play",
  "shape-match",
  "sliced",
  "polygon",
  "jigsaw",
  "shatter",
];

const spell = (sound: audio.Phrase): string =>
  sound
    .map(
      (one) => `${one.at}:${one.frequency.toFixed(2)}>${one.to.toFixed(2)}@${one.gain}/${one.type}`,
    )
    .join("|");

describe("a voice per kind", () => {
  it("gives every kind of puzzle a landing of its own", () => {
    const heard = new Map<string, PuzzleKindId>();
    for (const kind of KINDS) {
      const fresh = fakeContext();
      audio.useAudioContext(fresh as unknown as BaseAudioContext);
      audio.playSnap(kind);
      const voices = pitches(fresh);
      expect(voices.length, kind).toBeGreaterThan(0);
      const spelling = voices.join(",");
      // Not "some kinds sound different" - no two of them may be the same, or
      // one has quietly fallen through to another's sound.
      expect(heard.get(spelling), `${kind} sounds exactly like ${heard.get(spelling) ?? ""}`).toBe(
        undefined,
      );
      heard.set(spelling, kind);
    }
  });

  it("has a snap in the vocabulary for each of them", () => {
    const named = audio.VOCABULARY.filter((sound) => sound.name.startsWith("snap-")).map(
      (sound) => sound.name,
    );
    expect(new Set(named)).toEqual(new Set(KINDS.map((kind) => `snap-${kind}`)));
  });
});

describe("a fanfare per chapter", () => {
  const ids = Object.values(CELEBRATIONS);

  it("gives every celebration one of its own", () => {
    const heard = new Set<string>();
    for (const id of ids) {
      const fresh = fakeContext();
      audio.useAudioContext(fresh as unknown as BaseAudioContext);
      audio.playChapterFanfare(id);
      const spelling = pitches(fresh).join(",");
      expect(spelling.length, id).toBeGreaterThan(0);
      expect(heard.has(spelling), `${id} sounds exactly like another chapter`).toBe(false);
      heard.add(spelling);
    }
  });

  it("makes each of them bigger than an ordinary level's", () => {
    const level = audio.VOCABULARY.find((sound) => sound.name === "fanfare-1");
    expect(level).toBeDefined();
    const ordinary = audio.phraseSpan(level?.phrase ?? []);
    for (const id of ids) {
      const chapter = audio.VOCABULARY.find((sound) => sound.name === `chapter-${id}`);
      expect(chapter, id).toBeDefined();
      expect(audio.phraseSpan(chapter?.phrase ?? []), id).toBeGreaterThan(ordinary);
    }
  });

  it("gives the last chapter the finale and nobody else", () => {
    const finale = ids.filter((id: CelebrationId) => id === "finale");
    expect(finale).toHaveLength(1);
  });
});

describe("a level's own fanfare", () => {
  it("does not end two levels running the same way", () => {
    const spellings = [1, 2, 3, 4, 5, 6].map((level) => {
      const fresh = fakeContext();
      audio.useAudioContext(fresh as unknown as BaseAudioContext);
      audio.playFanfare(level);
      return pitches(fresh).join(",");
    });
    for (let index = 1; index < spellings.length; index++) {
      expect(spellings[index], `level ${index + 1}`).not.toBe(spellings[index - 1]);
    }
  });
});

// --- a run of answers stays musical ---------------------------------------

describe("answering a finger over and over", () => {
  it("never pops on the same note twice running", () => {
    for (let index = 0; index < 200; index++) audio.playPop(1);
    const heard = pitches(ctx);
    // Two voices per pop, so compare pop by pop rather than voice by voice.
    const first = heard.filter((_, index) => index % 2 === 0);
    for (let index = 1; index < first.length; index++) {
      expect(first[index], `pop ${index}`).not.toBe(first[index - 1]);
    }
  });

  it("never plinks on the same note twice running, however it is asked", () => {
    for (let index = 0; index < 60; index++) audio.playPlink(3);
    const heard = pitches(ctx);
    for (let index = 1; index < heard.length; index++) {
      expect(heard[index], `plink ${index}`).not.toBe(heard[index - 1]);
    }
  });

  it("still lets a bigger bubble pop lower than a smaller one", () => {
    const at = (pitch: number): number => {
      const fresh = fakeContext();
      audio.useAudioContext(fresh as unknown as BaseAudioContext);
      audio.playPop(pitch);
      return pitches(fresh)[0] ?? 0;
    };
    expect(at(0.5)).toBeLessThan(at(2));
  });
});

// --- nothing harsh, nothing left behind -----------------------------------

describe("the shape of every voice in the vocabulary", () => {
  it("stays under the gain ceiling", () => {
    for (const sound of audio.VOCABULARY) {
      for (const one of sound.phrase) {
        expect(one.gain, sound.name).toBeGreaterThan(0);
        expect(one.gain, sound.name).toBeLessThanOrEqual(audio.MAX_VOICE_GAIN);
      }
    }
  });

  it("uses nothing but soft waves", () => {
    for (const sound of audio.VOCABULARY) {
      for (const one of sound.phrase) {
        expect(["sine", "triangle"], sound.name).toContain(one.type);
      }
    }
  });

  it("always has an attack to come up through", () => {
    for (const sound of audio.VOCABULARY) {
      for (const one of sound.phrase) {
        expect(one.attack, sound.name).toBeGreaterThanOrEqual(0.005);
        expect(one.attack, sound.name).toBeLessThan(one.duration);
      }
    }
  });

  it("stays under the pitch ceiling, wherever a variant reaches", () => {
    // The ear is at its most sensitive between two and four kilohertz, which is
    // the one way a soft sine wave can still be piercing. `VOCABULARY` lists the
    // brightest variant of anything that varies, so this covers the fifth
    // firework and the smallest bubble and not only the first of each.
    for (const sound of audio.VOCABULARY) {
      for (const one of sound.phrase) {
        expect(one.frequency, `${sound.name} ${one.frequency}`).toBeLessThanOrEqual(
          audio.MAX_PITCH_HZ,
        );
        expect(one.to, `${sound.name} ${one.to}`).toBeLessThanOrEqual(audio.MAX_PITCH_HZ);
      }
    }
  });

  it("refuses a pitch above the ceiling however it is asked for", () => {
    // Every bubble in the game, including one asked to pop an octave above the
    // top of its range, which the caller is free to do.
    for (const pitch of [0.25, 0.5, 1, 2, 4, 16]) {
      audio.playPop(pitch);
    }
    const asked = pitches(ctx);
    expect(asked.length).toBeGreaterThan(0);
    for (const hz of asked) expect(hz).toBeLessThanOrEqual(audio.MAX_PITCH_HZ);
  });

  it("picks every pitch off the one ladder, so nothing can clash", () => {
    const ladder = new Set<string>();
    for (let degree = -12; degree <= 24; degree++) ladder.add(audio.note(degree).toFixed(3));
    for (const sound of audio.VOCABULARY) {
      for (const one of sound.phrase) {
        expect(ladder.has(one.frequency.toFixed(3)), `${sound.name} ${one.frequency}`).toBe(true);
        expect(ladder.has(one.to.toFixed(3)), `${sound.name} ${one.to}`).toBe(true);
      }
    }
  });

  it("spells no two entries of the vocabulary the same", () => {
    const heard = new Map<string, string>();
    for (const sound of audio.VOCABULARY) {
      const spelling = spell(sound.phrase);
      expect(heard.get(spelling), `${sound.name} and ${heard.get(spelling) ?? ""}`).toBe(undefined);
      heard.set(spelling, sound.name);
    }
  });
});

describe("a burst of sound", () => {
  it("drops voices rather than throwing when the budget runs out", () => {
    expect(() => {
      for (let index = 0; index < 200; index++) audio.playPop(1);
    }).not.toThrow();
    expect(oscillators(ctx).length).toBeLessThanOrEqual(audio.MAX_LIVE_VOICES);
  });

  it("gives every voice back when it ends, and lets the next one through", () => {
    for (let index = 0; index < 200; index++) audio.playPop(1);
    const spent = oscillators(ctx);
    expect(spent.length).toBe(audio.MAX_LIVE_VOICES);

    for (const osc of spent) osc.onended?.();
    // Both nodes of every voice: the oscillator and the envelope over it.
    for (const osc of spent) expect(osc.disconnected).toBe(1);
    const envelopes = ctx.nodes.filter((node) => node.kind === "gain" && node.disconnected > 0);
    expect(envelopes).toHaveLength(spent.length);

    audio.playPop(1);
    expect(oscillators(ctx).length).toBeGreaterThan(spent.length);
  });

  it("stops every voice it starts", () => {
    audio.playChapterFanfare("finale");
    for (const osc of oscillators(ctx)) {
      expect(osc.started).not.toBeNull();
      expect(osc.stopped ?? 0).toBeGreaterThan(osc.started ?? 0);
    }
  });
});
