/**
 * What the audio check runs *inside* the browser.
 *
 * `check-audio.mjs` bundles `src/audio.ts`, serves it next to this file and
 * loads both into a headless Chrome. Everything here then renders each sound
 * through a real `OfflineAudioContext` - the game's own scheduling code, into
 * the browser's own oscillators - and measures the samples that come back.
 *
 * The measurements are the part worth understanding, because they are what
 * turns "nothing harsh, nothing startling" from a hope into a check:
 *
 * - **peak** is how loud the sound actually gets, after the limiter.
 * - **maxDelta** is the largest step between two consecutive samples. A smooth
 *   tone cannot step further than its own highest frequency allows, so a step
 *   past that bound is a discontinuity - which is exactly what a click is.
 * - **onset** and **end** say the sound fades in and out rather than being
 *   gated on and off, and how long it lasts.
 * - **centroid** is where the energy sits on average. A soft sound is a low
 *   one; a bright or buzzy sound pulls this up, whatever its peak says.
 *
 * It also renders each sound with the sound switch off, and the samples then
 * have to be *exactly* zero.
 */
import * as audio from "./audio.js";

const SAMPLE_RATE = 44100;

/** In-place iterative radix-2 FFT. `re` and `im` are power-of-two length. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Where the energy of a signal sits on average, in Hz. */
function spectralCentroid(samples) {
  let size = 1;
  while (size < samples.length) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re.set(samples);
  fft(re, im);

  let weighted = 0;
  let total = 0;
  for (let bin = 1; bin < size / 2; bin++) {
    const magnitude = Math.hypot(re[bin], im[bin]);
    weighted += magnitude * ((bin * SAMPLE_RATE) / size);
    total += magnitude;
  }
  return total === 0 ? 0 : weighted / total;
}

/** The waveform boiled down to one min/max pair per column, for the sheet. */
function envelope(samples, columns) {
  const width = Math.max(1, Math.floor(samples.length / columns));
  const drawn = [];
  for (let start = 0; start + width <= samples.length; start += width) {
    let low = Infinity;
    let high = -Infinity;
    for (let index = start; index < start + width; index++) {
      if (samples[index] < low) low = samples[index];
      if (samples[index] > high) high = samples[index];
    }
    drawn.push([Number(low.toFixed(5)), Number(high.toFixed(5))]);
  }
  return drawn;
}

/** Render a phrase into an offline context and hand back the samples. */
async function render(seconds, playIt) {
  const ctx = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil(seconds * SAMPLE_RATE)),
    SAMPLE_RATE,
  );
  audio.useAudioContext(ctx);
  playIt();
  const buffer = await ctx.startRendering();
  audio.useAudioContext(null);
  return buffer.getChannelData(0);
}

function measure(samples) {
  let peak = 0;
  let maxDelta = 0;
  let onset = -1;
  let end = 0;
  for (let index = 0; index < samples.length; index++) {
    const value = Math.abs(samples[index]);
    if (value > peak) peak = value;
    if (index > 0) {
      const delta = Math.abs(samples[index] - samples[index - 1]);
      if (delta > maxDelta) maxDelta = delta;
    }
    if (value > 3e-4) {
      if (onset < 0) onset = index;
      end = index;
    }
  }
  return {
    peak,
    maxDelta,
    first: samples[0],
    last: samples[samples.length - 1],
    onsetSeconds: onset < 0 ? 0 : onset / SAMPLE_RATE,
    endSeconds: end / SAMPLE_RATE,
  };
}

/** The highest pitch a phrase ever asks for, which bounds how fast it can move. */
function topFrequency(phrase) {
  return phrase.reduce((top, one) => Math.max(top, one.frequency, one.to), 0);
}

/**
 * Measure the whole vocabulary. `columns` is how wide the waveform drawing
 * should be; pass 0 to skip it, which is what the check itself does.
 */
window.measureVocabulary = async function measureVocabulary(columns = 0) {
  const measured = [];
  for (const sound of audio.VOCABULARY) {
    const span = audio.phraseSpan(sound.phrase);
    const seconds = span + 0.6;

    audio.setSoundEnabled(true);
    const samples = await render(seconds, sound.play);

    audio.setSoundEnabled(false);
    const muted = await render(seconds, sound.play);
    audio.setSoundEnabled(true);

    let mutedPeak = 0;
    for (const value of muted) mutedPeak = Math.max(mutedPeak, Math.abs(value));

    const stats = measure(samples);
    measured.push({
      name: sound.name,
      span,
      seconds,
      voices: sound.phrase.length,
      top: topFrequency(sound.phrase),
      centroid: spectralCentroid(samples),
      mutedPeak,
      ...stats,
      columns: columns > 0 ? envelope(samples, columns) : [],
    });
  }
  return measured;
};

/**
 * Everything at once: a chapter fanfare with a child popping through it. This
 * is the pile-up the limiter and the voice budget exist for, and what it has to
 * come back with is a peak that has not clipped.
 */
window.measurePileUp = async function measurePileUp(columns = 0) {
  audio.setSoundEnabled(true);
  const samples = await render(4, () => {
    audio.playChapterFanfare("finale");
    for (let index = 0; index < 40; index++) audio.playPop(1 + (index % 5) * 0.2);
    for (let index = 0; index < 20; index++) audio.playFirework(index);
  });
  return {
    name: "pile-up",
    span: 3.4,
    seconds: 4,
    voices: 0,
    top: 3000,
    centroid: spectralCentroid(samples),
    mutedPeak: 0,
    ...measure(samples),
    columns: columns > 0 ? envelope(samples, columns) : [],
  };
};

window.audioProbeReady = true;
