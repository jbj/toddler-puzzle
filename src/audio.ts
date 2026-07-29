/**
 * Every sound the game makes.
 *
 * All of it is synthesised with the Web Audio API - there are no audio files to
 * load and nothing that can fail to download; see the no-binary-assets
 * invariant in `product.instructions.md`.
 *
 * Thirty levels, six puzzle kinds and six celebrations need more than four
 * tones, and a game a child plays every day is worse for a sound it hears too
 * often than for no sound at all. So the sounds are not written one at a time.
 * There are three things underneath them, and every sound in the game is spelt
 * out of those three:
 *
 * 1. **A ladder.** One pentatonic scale, four octaves of it, and `note(degree)`
 *    to read a pitch off it. Everything picks its pitches from the same ladder,
 *    which is what makes twenty sounds feel like one game - and, as the
 *    cause-and-effect levels already knew, means there is no wrong note however
 *    a toddler triggers them.
 * 2. **A voice**: one oscillator and one envelope, as plain data.
 * 3. **A phrase**: voices with times on them, relative to the start.
 *
 * Only `schedule` below touches Web Audio, so the sound switch, the context,
 * the master chain and the voice budget each exist exactly once. A sound added
 * later is a phrase, not another copy of the envelope - which is what keeps
 * eleven sounds from drifting into eleven different characters.
 *
 * The character itself is unchanged and deliberate: soft sines and triangles,
 * a real attack, a smooth exponential decay, nothing harsh and nothing that
 * starts abruptly. A wrong drop is a nudge, never a buzzer.
 *
 * Nobody can hear this file in a test, so two harnesses look at it instead.
 * `tests/audio.test.ts` checks the structure against a stand-in context, and
 * `scripts/check-audio.mjs` renders every sound through a real
 * `OfflineAudioContext` in Chromium and measures the samples. See
 * [decision 20260730T183000](../docs/decisions/20260730T183000-sounds-are-data-and-the-machine-listens.md).
 */
import type { CelebrationId } from "./celebration";
import type { PuzzleKindId } from "./levels";

// --- the ladder -----------------------------------------------------------

/**
 * A major pentatonic scale, in semitones from the root. Pentatonic because
 * there is no wrong note in it: two sounds that land together are consonant
 * whichever two they are, so a child popping balloons through a fanfare cannot
 * produce a clash.
 */
const SEMITONES = [0, 2, 4, 7, 9];

/** Degree 0. C4, so degree 5 is C5 and the game sits mostly above it. */
const ROOT_HZ = 261.6256;

/**
 * The pitch of a degree of the ladder. Degrees run on past the top and below
 * the bottom - degree 5 is an octave above degree 0, degree -5 an octave below
 * - so a phrase can be transposed by adding to its degrees.
 */
export function note(degree: number): number {
  const octave = Math.floor(degree / SEMITONES.length);
  const step = SEMITONES[degree - octave * SEMITONES.length] ?? 0;
  return ROOT_HZ * Math.pow(2, octave + step / 12);
}

// --- voices and phrases ---------------------------------------------------

/** One oscillator with one envelope over it. */
export interface Voice {
  /** Seconds after the phrase starts. */
  readonly at: number;
  readonly frequency: number;
  /** Where the pitch has slid to by the end. The same as `frequency` for most. */
  readonly to: number;
  readonly duration: number;
  readonly gain: number;
  /** Seconds to come up to `gain`. Never zero: an instant onset is a click. */
  readonly attack: number;
  readonly type: "sine" | "triangle";
}

/** A sound: voices with times on them, relative to the start of the phrase. */
export type Phrase = readonly Voice[];

interface VoiceOptions {
  readonly at?: number;
  readonly to?: number;
  readonly duration?: number;
  readonly gain?: number;
  readonly attack?: number;
  readonly type?: "sine" | "triangle";
}

/**
 * No voice may ask for more than this. Twenty-odd of them can be in the air at
 * once, and a game played at arm's length from a face has no use for headroom
 * it might spend.
 */
export const MAX_VOICE_GAIN = 0.2;

/** The shortest attack anything is allowed. Below this an onset ticks. */
const MIN_ATTACK = 0.006;

function voice(frequency: number, options: VoiceOptions = {}): Voice {
  const duration = options.duration ?? 0.18;
  return {
    at: options.at ?? 0,
    frequency,
    to: options.to ?? frequency,
    duration,
    gain: Math.min(options.gain ?? 0.14, MAX_VOICE_GAIN),
    attack: Math.max(Math.min(options.attack ?? 0.02, duration * 0.5), MIN_ATTACK),
    type: options.type ?? "sine",
  };
}

interface RunOptions extends VoiceOptions {
  /** Seconds between one note starting and the next. */
  readonly spacing?: number;
}

/** Notes of the ladder one after another. */
function run(degrees: readonly number[], options: RunOptions = {}): Phrase {
  const spacing = options.spacing ?? 0.12;
  const from = options.at ?? 0;
  return degrees.map((degree, index) =>
    voice(note(degree), { ...options, at: from + index * spacing }),
  );
}

/** Notes of the ladder together, for something held underneath a run. */
function chord(degrees: readonly number[], options: VoiceOptions = {}): Phrase {
  return degrees.map((degree) => voice(note(degree), options));
}

/** Phrases played at once. */
function together(...parts: readonly Phrase[]): Phrase {
  return parts.flat();
}

/** The same phrase, later. */
function delayed(seconds: number, phrase: Phrase): Phrase {
  return phrase.map((one) => ({ ...one, at: one.at + seconds }));
}

/** How long a phrase lasts, from its start to the end of its last voice. */
export function phraseSpan(phrase: Phrase): number {
  return phrase.reduce((longest, one) => Math.max(longest, one.at + one.duration), 0);
}

// --- the switch -----------------------------------------------------------

/**
 * Whether sound plays at all. Set from `settings.sound` twice: once at boot in
 * `main.ts`, and again whenever the grown-up panel's switch moves
 * (`applySettings` in `grownups.ts`). Nothing else touches it.
 *
 * The switch is here rather than at each call site so that "off" means silent
 * whatever starts playing next - a sound added later is off by default when a
 * grown-up has asked for silence, rather than being a hole in the setting.
 */
let enabled = true;

/** Turn every sound in the game on or off. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/** Whether sound is currently allowed to play. */
export function soundEnabled(): boolean {
  return enabled;
}

// --- the context, the master chain and the voice budget -------------------

let context: AudioContext | null = null;

/**
 * A context handed in from outside, which is not the speakers. Only the two
 * harnesses set this: `scripts/check-audio.mjs` renders the whole vocabulary
 * into an `OfflineAudioContext` to measure it, and `tests/audio.test.ts` hands
 * in a stand-in to count what was scheduled. The game never calls it.
 */
let provided: BaseAudioContext | null = null;

/**
 * Play into this context instead of the speakers, or pass `null` to go back to
 * them. For the harnesses; see `provided` above.
 */
export function useAudioContext(ctx: BaseAudioContext | null): void {
  provided = ctx;
}

function liveContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/**
 * Browsers block audio until a user gesture. Call this from the first pointer
 * interaction so later sounds are allowed to play.
 */
export function unlockAudio(): void {
  const ctx = liveContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
}

/**
 * Voices allowed to be in the air at once. A chapter celebration is the first
 * thing in this game that can ask for a lot at speed - thirty balloons popped
 * in ten seconds, over a fanfare - and browsers cap concurrent nodes. Past the
 * budget a voice is dropped rather than queued: a pop that does not sound is a
 * pop nobody misses, and a burst that crackles is one every child in the room
 * hears.
 */
export const MAX_LIVE_VOICES = 24;

/**
 * How far past full scale the mix is allowed to reach before it is folded back.
 * Everything is divided by this on the way in and the curve below multiplies it
 * back, so an ordinary sound comes out where it went in and only a pile-up is
 * bent.
 */
const HEADROOM = 3;

/**
 * A soft clip: `tanh`, which is a straight line through quiet signals and bends
 * smoothly over as they get loud, and never reaches one however loud they get.
 *
 * This is here instead of a `DynamicsCompressorNode` for two reasons. It is
 * exactly predictable, so `scripts/check-audio.mjs` can measure what it does;
 * and it is the same in every browser, which a compressor is not - Chrome's
 * quietly takes 6 dB off everything that passes through it, even signals miles
 * below its threshold, and a game that is half as loud on one tablet as another
 * is a bug a parent meets rather than a curiosity.
 *
 * An odd number of points, so the middle one is exactly zero and silence stays
 * silent rather than picking up a DC offset from the interpolation.
 */
function softClip(): Float32Array<ArrayBuffer> {
  const points = 4097;
  const curve = new Float32Array(new ArrayBuffer(points * 4));
  for (let index = 0; index < points; index++) {
    const input = (index * 2) / (points - 1) - 1;
    curve[index] = Math.tanh(input * HEADROOM);
  }
  return curve;
}

/**
 * The one place everything is mixed, per context: a gain into a soft clip into
 * the speakers.
 *
 * The soft clip is a safety net, not an effect. A chapter celebration is the
 * first thing in this game that can ask for a lot at once - a fanfare with a
 * child popping balloons through it - and what it means is that the worst case
 * gets *rounder* rather than cracking, which is the difference between a toy
 * that is loud and a toy that is nasty.
 */
interface Bus {
  readonly input: AudioNode;
  live: number;
}

const buses = new WeakMap<BaseAudioContext, Bus>();

function busFor(ctx: BaseAudioContext): Bus {
  const existing = buses.get(ctx);
  if (existing) return existing;

  const input = ctx.createGain();
  input.gain.value = 1 / HEADROOM;
  const limiter = ctx.createWaveShaper();
  limiter.curve = softClip();
  limiter.oversample = "4x";
  input.connect(limiter).connect(ctx.destination);

  const bus: Bus = { input, live: 0 };
  buses.set(ctx, bus);
  return bus;
}

/** Where an envelope starts and ends. Exponential ramps cannot touch zero. */
const SILENT = 0.0001;

/** A moment of held silence after a voice, so nothing is cut off mid-decay. */
const TAIL = 0.03;

/**
 * Put a phrase into a context. The only function in the game that talks to Web
 * Audio, and the only one that has to get node cleanup right: every oscillator
 * disconnects itself and gives its place back when it ends.
 */
function schedule(ctx: BaseAudioContext, bus: Bus, phrase: Phrase, when: number): void {
  for (const one of phrase) {
    if (bus.live >= MAX_LIVE_VOICES) return;
    bus.live += 1;

    const start = when + one.at;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();

    osc.type = one.type;
    osc.frequency.setValueAtTime(one.frequency, start);
    if (one.to !== one.frequency) {
      osc.frequency.exponentialRampToValueAtTime(one.to, start + one.duration);
    }

    envelope.gain.setValueAtTime(SILENT, start);
    envelope.gain.exponentialRampToValueAtTime(one.gain, start + one.attack);
    envelope.gain.exponentialRampToValueAtTime(SILENT, start + one.duration);

    osc.connect(envelope).connect(bus.input);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
      bus.live -= 1;
    };
    osc.start(start);
    osc.stop(start + one.duration + TAIL);
  }
}

/** Play a phrase now, if sound is on and there is anywhere to play it. */
function play(phrase: Phrase): void {
  if (!enabled) return;
  const ctx = provided ?? liveContext();
  if (!ctx) return;
  // A context that has never been unlocked has a clock stuck at zero, so
  // everything scheduled into it would arrive at once the moment it started.
  if (!provided && ctx.state !== "running") return;
  schedule(ctx, busFor(ctx), phrase, ctx.currentTime);
}

// --- keeping a run of notes musical ---------------------------------------

/**
 * The last degree the game answered a finger with. A run of pops or plinks on
 * one note is the thing that makes a sound feel mechanical, so whenever the
 * next one would land on the same degree it is nudged a step up the ladder
 * instead - which cannot be a wrong note, because the ladder has none.
 */
let lastAnswer = Number.NaN;

function fresh(degree: number): number {
  const chosen = degree === lastAnswer ? degree + 1 : degree;
  lastAnswer = chosen;
  return chosen;
}

// --- the vocabulary -------------------------------------------------------

/** Lifting a piece: a small rise, because something has just come up. */
const PICK_UP: Phrase = [voice(note(5), { to: note(6), duration: 0.1, gain: 0.08 })];

/**
 * A piece landing, one voice per kind of puzzle.
 *
 * The same chime cannot serve a wooden animal dropping into a hole, a slice
 * rejoining the animal it was cut from, a flat shape clicking onto its shadow,
 * a jigsaw piece meshing with its neighbour and a shard settling. They are five
 * different physical events, and after thirty levels of one sound they are also
 * five chances for the game to stay interesting. They are all built out of the
 * same ladder and the same envelope, so they are obviously the same game.
 *
 * Keyed by every `PuzzleKindId` there is, so a kind added later cannot quietly
 * fall through to somebody else's sound: it will not compile without one.
 */
const SNAP: Record<PuzzleKindId, Phrase> = {
  // The original two-note chime, and the one every other landing is a variation
  // of. The upper note moved from a stray 990 Hz onto the ladder's C, which
  // both lands the phrase on the tonic and stops it clashing with a plink.
  "shape-match": [
    voice(note(7), { duration: 0.16, gain: 0.16 }),
    voice(note(10), { at: 0.09, duration: 0.24, gain: 0.13 }),
  ],
  // Two notes closing to one: a slice rejoining the animal it came out of.
  sliced: [
    voice(note(5), { to: note(8), duration: 0.26, gain: 0.1 }),
    voice(note(11), { to: note(8), duration: 0.26, gain: 0.08 }),
  ],
  // A wooden tap with a bright note over it: a flat shape onto a flat shadow.
  polygon: [
    voice(note(0), { to: note(-1), duration: 0.08, gain: 0.11, type: "triangle" }),
    voice(note(12), { at: 0.02, duration: 0.16, gain: 0.09 }),
  ],
  // Sliding into a seat: two pieces meshing rather than one piece arriving.
  jigsaw: [
    voice(note(6), { to: note(9), duration: 0.12, gain: 0.1 }),
    voice(note(9), { at: 0.1, duration: 0.22, gain: 0.12 }),
  ],
  // Lower, rounder and settling: a shard of stone put down rather than clicked.
  shatter: [
    voice(note(3), { to: note(2), duration: 0.3, gain: 0.12, type: "triangle" }),
    voice(note(-2), { at: 0.02, duration: 0.34, gain: 0.07 }),
  ],
  // The one landing on a level played by touching: a bush opening on an animal.
  // Three notes rising, softer than a snap - "there you are" rather than "in".
  play: [
    voice(note(5), { duration: 0.2, gain: 0.1 }),
    voice(note(9), { at: 0.1, duration: 0.26, gain: 0.09 }),
    voice(note(12), { at: 0.2, duration: 0.3, gain: 0.06 }),
  ],
};

/** A refused drop. Warm, low and falling away: a nudge, never a buzzer. */
const RETURN: Phrase = [
  voice(note(1), { to: note(0), duration: 0.16, gain: 0.07, type: "triangle" }),
];

/** The rotation click: a soft wooden tap, nowhere near an impulse. */
const TURN: Phrase = [
  voice(note(2), { to: note(0), duration: 0.07, gain: 0.09, type: "triangle" }),
  voice(note(9), { at: 0.01, duration: 0.06, gain: 0.04 }),
];

/**
 * A firework: a rise into three bright specks, rather than a bubble bursting.
 * `step` is which firework this is, and moves the specks along the ladder so
 * that a sky full of them is not one sound repeated.
 */
function fireworkPhrase(step: number): Phrase {
  const lift = ((step % 5) + 5) % 5;
  return together(
    [voice(note(2), { to: note(11), duration: 0.24, gain: 0.06 })],
    delayed(
      0.22,
      run([13 + lift, 15 + lift, 12 + lift], { spacing: 0.05, duration: 0.3, gain: 0.07 }),
    ),
  );
}

/** Where a pop of pitch 1 sits on the ladder. */
const POP_ROOT = 8;

/** A burst, at a degree of the ladder. Bright, short, and over at once. */
function popPhrase(degree: number): Phrase {
  return [
    voice(note(degree), { duration: 0.09, gain: 0.13, attack: 0.008 }),
    voice(note(degree + 3), { at: 0.02, duration: 0.11, gain: 0.06, attack: 0.008 }),
  ];
}

/** Where a plink of step 0 sits on the ladder. */
const PLINK_ROOT = 5;

/** One note back, for a thing that has just answered a finger. */
function plinkPhrase(degree: number): Phrase {
  return [voice(note(degree), { duration: 0.22, gain: 0.12 })];
}

/**
 * A level finished: the rising arpeggio the game has always played, moved a
 * step along the ladder each level. Twenty-four of the thirty levels end on
 * this, so two levels running must not end identically - but it is still the
 * same four notes, because "you did it" should not need learning twice.
 */
function fanfarePhrase(level: number): Phrase {
  const root = 5 + ((((level - 1) % 5) + 5) % 5);
  return run([root, root + 2, root + 3, root + 5], { spacing: 0.13, duration: 0.4, gain: 0.15 });
}

/**
 * The end of a chapter, and the end of the game. Longer and fuller than a
 * level's fanfare on purpose: five levels finishing has to sound like more than
 * one level finishing, or the celebration it opens is only a bigger picture of
 * the same moment.
 *
 * One per celebration rather than one for all six, because the celebrations are
 * not one moment repeated - balloons and blossom and a rainbow are different
 * things to arrive in, and a child who has heard the same fanfare five times
 * has stopped hearing it. Keyed by every `CelebrationId`, so a celebration
 * added later cannot go without one.
 */
const CHAPTER: Record<CelebrationId, Phrase> = {
  // Buoyant and quick, and it ends up in the air rather than coming to rest.
  balloons: together(
    run([5, 7, 8, 10, 12], { spacing: 0.09, duration: 0.34, gain: 0.13 }),
    delayed(0.46, [voice(note(13), { duration: 0.9, gain: 0.1 })]),
  ),
  // A tread underneath, because a parade is walked rather than announced.
  parade: together(
    run([5, 8, 10, 8, 12], { spacing: 0.17, duration: 0.36, gain: 0.13 }),
    run([-5, -2, -5, -2], { spacing: 0.34, duration: 0.3, gain: 0.08, type: "triangle" }),
  ),
  // Falling, unhurried, and held: blossom coming down rather than going up.
  petals: together(
    run([15, 13, 12, 10, 9, 7, 5], { spacing: 0.13, duration: 0.44, gain: 0.11 }),
    delayed(0.3, chord([0, 4], { duration: 1.5, gain: 0.06 })),
  ),
  // An arch: over the top and down the other side, which is the shape the child
  // is painting a tap at a time.
  rainbow: together(
    run([5, 7, 9, 10, 12, 10, 9, 7], { spacing: 0.14, duration: 0.42, gain: 0.12 }),
    chord([0, 3], { duration: 1.8, gain: 0.06 }),
  ),
  // Up, and then specks over the top of it.
  fireworks: together(
    run([5, 8, 10, 12], { spacing: 0.11, duration: 0.36, gain: 0.13 }),
    delayed(0.5, run([15, 17, 16], { spacing: 0.09, duration: 0.5, gain: 0.08 })),
  ),
  // Thirty levels. The longest run, the whole chord under it, and a note left
  // ringing over the top - the finale does not wind down, and neither does this.
  finale: together(
    run([5, 6, 7, 8, 9, 10, 12, 13, 15], { spacing: 0.11, duration: 0.44, gain: 0.12 }),
    delayed(0.5, chord([0, 3, 5], { duration: 2.2, gain: 0.06 })),
    delayed(1.1, [voice(note(15), { duration: 1.4, gain: 0.09 })]),
  ),
};

// --- what the game calls --------------------------------------------------

/** Soft blip when a piece is picked up. */
export function playPickUp(): void {
  play(PICK_UP);
}

/** A piece dropping into place, in the voice of the kind of puzzle it belongs to. */
export function playSnap(kind: PuzzleKindId): void {
  play(SNAP[kind]);
}

/**
 * Played when a piece is dropped somewhere else. Intentionally warm and quiet -
 * a nudge, never a buzzer, so a wrong drop is not discouraging.
 */
export function playReturn(): void {
  play(RETURN);
}

/**
 * A bubble or a balloon bursting under a finger. Short, soft and high: the
 * sound has to arrive with the burst rather than after it, so there is barely
 * an attack and nothing to wait for.
 *
 * `pitch` is the multiplier the caller wants - a small bubble pops higher than
 * a big one - and it is rounded onto the ladder, so a screenful of them bursts
 * in tune. Two in a row never land on the same degree.
 */
export function playPop(pitch = 1): void {
  const wanted = POP_ROOT + Math.round(Math.log2(Math.max(pitch, 0.25)) * SEMITONES.length);
  const bounded = Math.max(POP_ROOT - 3, Math.min(POP_ROOT + 5, wanted));
  play(popPhrase(fresh(bounded)));
}

/**
 * One note back, for a thing in a cause-and-effect level or a celebration that
 * has just answered a touch. `step` is whatever the caller counts by - which
 * thing it was, or how many have answered - and walks the ladder from there.
 */
export function playPlink(step = 0): void {
  const degree = PLINK_ROOT + (((step % 5) + 5) % 5);
  play(plinkPhrase(fresh(degree)));
}

/**
 * A firework going up and breaking. Its own sound rather than a pop and a
 * plink together, because a firework that sounds like a bubble is the sort of
 * repetition this vocabulary exists to remove.
 */
export function playFirework(step = 0): void {
  play(fireworkPhrase(step));
}

/**
 * A piece turning a quarter turn, for rotation mode (issue #14). Nothing calls
 * it yet - rotation is not built - and it is here so that when it is, the sound
 * is already part of the vocabulary rather than an eleventh envelope written in
 * a hurry.
 */
export function playTurn(): void {
  play(TURN);
}

/** Rising arpeggio when a level is finished, a step along the ladder each level. */
export function playFanfare(level = 1): void {
  play(fanfarePhrase(level));
}

/** The end of a chapter, or of the whole game: one phrase per celebration. */
export function playChapterFanfare(celebration: CelebrationId): void {
  play(CHAPTER[celebration]);
}

// --- the vocabulary, for the harnesses ------------------------------------

/** One entry of the vocabulary: a name, the phrase, and a way to play it. */
export interface Sound {
  readonly name: string;
  readonly phrase: Phrase;
  /** Plays exactly `phrase`, so what is measured is what is heard. */
  readonly play: () => void;
}

function sound(name: string, phrase: Phrase): Sound {
  return { name, phrase, play: () => play(phrase) };
}

/**
 * Every sound the game can make, enumerable.
 *
 * This exists because nobody can hear the game in a test. `tests/audio.test.ts`
 * walks it to check that no two kinds and no two celebrations share a phrase
 * and that nothing exceeds the gain ceiling, and `scripts/check-audio.mjs`
 * renders each entry through a real `OfflineAudioContext` and measures the
 * samples that come back. A sound that is not in here is a sound nothing has
 * ever looked at.
 */
export const VOCABULARY: readonly Sound[] = [
  sound("pick-up", PICK_UP),
  ...Object.entries(SNAP).map(([kind, phrase]) => sound(`snap-${kind}`, phrase)),
  sound("return", RETURN),
  sound("pop", popPhrase(POP_ROOT)),
  sound("plink", plinkPhrase(PLINK_ROOT)),
  sound("firework", fireworkPhrase(0)),
  sound("turn", TURN),
  ...[1, 2, 3, 4, 5].map((level) => sound(`fanfare-${level}`, fanfarePhrase(level))),
  ...Object.entries(CHAPTER).map(([id, phrase]) => sound(`chapter-${id}`, phrase)),
];
