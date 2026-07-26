/**
 * All sound is synthesised with the Web Audio API - no audio files to load and
 * nothing that can fail to download. Tones are soft sine waves with gentle
 * envelopes; nothing harsh or startling for a small child.
 */

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/**
 * Browsers block audio until a user gesture. Call this from the first pointer
 * interaction so later sounds are allowed to play.
 */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
}

interface ToneOptions {
  frequency: number;
  /** Seconds from now. */
  delay?: number;
  duration?: number;
  gain?: number;
  type?: OscillatorType;
}

function tone({ frequency, delay = 0, duration = 0.18, gain = 0.16, type = "sine" }: ToneOptions): void {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;

  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);

  // Short attack, smooth exponential decay - avoids clicks and harshness.
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(envelope).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Soft blip when a piece is picked up. */
export function playPickUp(): void {
  tone({ frequency: 520, duration: 0.1, gain: 0.08 });
}

/** Happy two-note chime when a piece drops into its hole. */
export function playSnap(): void {
  tone({ frequency: 660, duration: 0.16, gain: 0.16 });
  tone({ frequency: 990, delay: 0.09, duration: 0.24, gain: 0.14 });
}

/**
 * Played when a piece is dropped somewhere else. Intentionally warm and quiet -
 * a nudge, never a buzzer, so a wrong drop is not discouraging.
 */
export function playReturn(): void {
  tone({ frequency: 320, duration: 0.14, gain: 0.07, type: "triangle" });
}

/** Rising arpeggio when a puzzle is finished; longer for the final stage. */
export function playFanfare(grand = false): void {
  const notes = grand
    ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
    : [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((frequency, index) => {
    tone({ frequency, delay: index * 0.13, duration: 0.4, gain: 0.15 });
  });
}
