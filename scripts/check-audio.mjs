/**
 * What the sounds actually sound like, measured.
 *
 *   npm run audio:check     assert every sound is within its bounds
 *   npm run audio           the same, and draw a sheet of the waveforms
 *
 * Nobody can hear a pull request. This is the closest thing to listening to
 * one: it bundles `src/audio.ts`, loads it into a headless Chrome, renders
 * every entry of the vocabulary through a real `OfflineAudioContext` - the
 * game's own scheduling code, into the browser's own oscillators - and measures
 * the samples that come back. `scripts/audio-probe.mjs` is the half that runs
 * in the page and explains the measurements.
 *
 * What is checked, and why each one is a way a toddler's game can go wrong:
 *
 * - **loud enough to hear, quiet enough not to startle.** A game played close
 *   to a face at full volume has no use for headroom it might spend.
 * - **no discontinuity.** A step between two samples bigger than the sound's
 *   own top frequency can produce is a click, and a click is the one thing in
 *   this vocabulary that would make a child flinch.
 * - **it fades in and it fades out.** Nothing is gated on or off.
 * - **soft.** The spectral centroid says where the energy sits; a buzzy sound
 *   pulls it up however modest its peak is.
 * - **the switch really is a switch.** Every sound is rendered a second time
 *   with sound off, and the samples then have to be exactly zero.
 * - **a pile-up gets softer, not louder.** Everything at once, which is what a
 *   child popping through a finale asks for.
 *
 * `npm run test` covers the other half - that the vocabulary is *structured*
 * right, and that the switch is wired to all of it. See
 * [decision 20260730T183000](../docs/decisions/20260730T183000-sounds-are-data-and-the-machine-listens.md).
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";

import { openChrome } from "./chrome.mjs";
import { haveRsvg, rsvg } from "./tools.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, ".art/audio");
const PORT = 4321;
const DEBUG_PORT = 9335;
const profileDir = join(root, ".art/chrome-audio-profile");

const drawSheet = process.argv.includes("--sheet");

// --- the bounds -----------------------------------------------------------

/**
 * The measurements every sound has to be inside. They are deliberately wide:
 * this is a check against a sound going *wrong*, not a way of pinning down a
 * sound somebody may want to retune. A failure prints the measured number, so
 * a wrong bound is obvious rather than mysterious.
 */
const BOUNDS = {
  /** Audible on a tablet speaker across a room. */
  minPeak: 0.02,
  /** Well inside clipping, with the limiter still to come. */
  maxPeak: 0.9,
  /** How far past a smooth signal's own slope a step may go before it is a click. */
  slopeAllowance: 2,
  /** Plus this, for the very quietest sounds, where rounding dominates. */
  slopeFloor: 0.004,
  /** The first and last sample of a render, which must be silence. */
  edge: 1e-3,
  /** A sound has to start within this of when it was asked for. */
  maxOnset: 0.35,
  /** How far a render may run past the phrase's own span. */
  tailAllowance: 0.4,
  /** Above this a sound is bright rather than soft. */
  maxCentroid: 2600,
};

// --- bundle the module ----------------------------------------------------

const bundled = await build({
  configFile: false,
  logLevel: "error",
  build: {
    write: false,
    minify: false,
    target: "es2022",
    lib: { entry: join(root, "src/audio.ts"), formats: ["es"], fileName: () => "audio.js" },
  },
});
const rollup = Array.isArray(bundled) ? bundled[0] : bundled;
const chunk = rollup.output.find((one) => one.type === "chunk");
if (!chunk) throw new Error("Could not bundle src/audio.ts.");

const probe = readFileSync(join(root, "scripts/audio-probe.mjs"), "utf8");

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>audio</title></head>
<body><script type="module" src="/probe.mjs"></script></body></html>`;

const FILES = {
  "/": { type: "text/html", body: PAGE },
  "/audio.js": { type: "text/javascript", body: chunk.code },
  "/probe.mjs": { type: "text/javascript", body: probe },
};

const server = createServer((req, res) => {
  const file = FILES[(req.url ?? "/").split("?")[0]];
  if (!file) return void res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": file.type });
  res.end(file.body);
});
await new Promise((resolve) => server.listen(PORT, resolve));

// --- render it ------------------------------------------------------------

let browser;
try {
  browser = await openChrome({ debugPort: DEBUG_PORT, profileDir });
} catch (error) {
  server.close();
  throw error;
}

let measured;
try {
  await browser.send("Page.enable");
  await browser.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await browser.evaluate("window.audioProbeReady === true")) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!(await browser.evaluate("window.audioProbeReady === true"))) {
    throw new Error("The audio probe never loaded in the browser.");
  }
  const columns = drawSheet ? 900 : 0;
  measured = await browser.evaluate(`window.measureVocabulary(${columns})`);
  measured.push(await browser.evaluate(`window.measurePileUp(${columns})`));
} finally {
  browser.close();
  server.close();
}

// --- check it -------------------------------------------------------------

let failures = 0;

function check(name, ok, detail) {
  if (ok) return;
  failures += 1;
  console.error(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

const round = (value, places = 3) => Number(value.toFixed(places));

for (const sound of measured) {
  const { name } = sound;
  check(`${name}: loud enough to hear`, sound.peak >= BOUNDS.minPeak, `peak ${round(sound.peak)}`);
  check(
    `${name}: quiet enough not to startle`,
    sound.peak <= BOUNDS.maxPeak,
    `peak ${round(sound.peak)}`,
  );

  // The fastest a smooth tone of this pitch and this loudness can move between
  // two samples. Anything past it is a corner in the waveform, which is a click.
  const slope = (2 * Math.PI * sound.top * sound.peak) / 44100;
  const allowed = slope * BOUNDS.slopeAllowance + BOUNDS.slopeFloor;
  check(
    `${name}: no click anywhere in it`,
    sound.maxDelta <= allowed,
    `step ${round(sound.maxDelta, 5)} against ${round(allowed, 5)} allowed`,
  );

  check(
    `${name}: starts from silence`,
    Math.abs(sound.first) <= BOUNDS.edge,
    `first sample ${round(sound.first, 6)}`,
  );
  check(
    `${name}: ends in silence`,
    Math.abs(sound.last) <= BOUNDS.edge,
    `last sample ${round(sound.last, 6)}`,
  );
  check(
    `${name}: arrives when it was asked for`,
    sound.onsetSeconds <= BOUNDS.maxOnset,
    `${round(sound.onsetSeconds)}s late`,
  );
  check(
    `${name}: lasts about as long as it says`,
    sound.endSeconds <= sound.span + BOUNDS.tailAllowance,
    `${round(sound.endSeconds)}s against a span of ${round(sound.span)}s`,
  );
  check(
    `${name}: soft rather than bright`,
    sound.centroid <= BOUNDS.maxCentroid,
    `centroid ${Math.round(sound.centroid)} Hz`,
  );
  check(
    `${name}: silent when sound is switched off`,
    sound.mutedPeak === 0,
    `peak ${round(sound.mutedPeak, 6)} with the switch off`,
  );
}

// --- say what was measured ------------------------------------------------

const column = (text, width) => String(text).padEnd(width);
console.log(
  `\n${column("sound", 22)}${column("peak", 8)}${column("centroid", 10)}${column("length", 9)}step`,
);
for (const sound of measured) {
  console.log(
    column(sound.name, 22) +
      column(round(sound.peak), 8) +
      column(`${Math.round(sound.centroid)} Hz`, 10) +
      column(`${round(sound.endSeconds, 2)}s`, 9) +
      round(sound.maxDelta, 5),
  );
}

// --- draw it --------------------------------------------------------------

/**
 * A sheet of waveforms, so a person can *see* what they cannot hear before
 * merging it. Written as SVG and rasterised with the same `rsvg-convert` the
 * art review already needs; if that is not installed the SVG is still written,
 * because half a sheet beats none.
 */
const ROW = 74;
const LABEL_WIDTH = 170;
const WAVE_WIDTH = 900;
const SHEET_WIDTH = LABEL_WIDTH + WAVE_WIDTH + 30;

/**
 * One group of sounds, on one time axis.
 *
 * The sounds are drawn in two groups rather than one, because a pop and the
 * finale differ in length by a factor of thirty: on a single axis wide enough
 * for the finale, everything the child actually hears all day is one pixel. So
 * the short sounds get an axis of their own and the long ones another, and
 * within a group the lengths are honestly comparable.
 */
function block(title, sounds, top, loudest) {
  const longest = Math.max(...sounds.map((one) => one.seconds), 0.2);
  const perSecond = WAVE_WIDTH / longest;
  const height = sounds.length * ROW + 46;
  const step = longest > 1.5 ? 0.5 : 0.1;

  const axis = [];
  for (let mark = 0; mark <= longest + 1e-6; mark += step) {
    const x = LABEL_WIDTH + mark * perSecond;
    axis.push(
      `<line x1="${x.toFixed(1)}" y1="${top + 12}" x2="${x.toFixed(1)}" y2="${top + height - 22}" stroke="#e2eaf0" stroke-width="1" />` +
        `<text x="${x.toFixed(1)}" y="${top + height - 8}" font-size="10" font-family="monospace" fill="#8c9aa4">${mark.toFixed(step < 0.5 ? 1 : 1)}s</text>`,
    );
  }

  const rows = sounds.map((sound, index) => {
    const middle = top + 24 + index * ROW + ROW / 2 - 8;
    const half = ROW / 2 - 14;
    const columns = sound.columns.length;
    const at = (column) =>
      LABEL_WIDTH + (column / Math.max(1, columns - 1)) * sound.seconds * perSecond;
    const upper = sound.columns
      .map(
        (pair, column) =>
          `${at(column).toFixed(1)},${(middle - (pair[1] / loudest) * half).toFixed(1)}`,
      )
      .join(" ");
    const lower = sound.columns
      .map((pair, column) => ({ column, low: pair[0] }))
      .reverse()
      .map(
        (one) => `${at(one.column).toFixed(1)},${(middle - (one.low / loudest) * half).toFixed(1)}`,
      )
      .join(" ");
    return `
      <g>
        <text x="14" y="${middle + 2}" font-size="13" font-family="monospace" fill="#20303c">${sound.name}</text>
        <text x="14" y="${middle + 18}" font-size="10" font-family="monospace" fill="#6b7b86">peak ${round(sound.peak)}  ${Math.round(sound.centroid)} Hz</text>
        <line x1="${LABEL_WIDTH}" y1="${middle}" x2="${LABEL_WIDTH + WAVE_WIDTH}" y2="${middle}" stroke="#cfd9e0" stroke-width="1" />
        <polygon points="${upper} ${lower}" fill="#2f7fa8" />
      </g>`;
  });

  const svg = `
  ${axis.join("\n")}
  <text x="14" y="${top + 14}" font-size="12" font-family="monospace" fill="#4a5c68">${title}</text>
  ${rows.join("\n")}`;
  return { svg, height };
}

/**
 * A sheet of waveforms, so a person can *see* what they cannot hear before
 * merging it. Written as SVG and rasterised with the same `rsvg-convert` the
 * art review already needs; if that is not installed the SVG is still written,
 * because half a sheet beats none.
 */
function buildSheet(sounds) {
  const loudest = Math.max(...sounds.map((one) => one.peak), 0.05);
  const short = sounds.filter((one) => one.seconds <= 1.2);
  const long = sounds.filter((one) => one.seconds > 1.2);

  let top = 44;
  const blocks = [];
  for (const [title, group] of [
    ["What a child hears all day - a touch, a landing, a pop", short],
    ["The end of a level, a chapter, and the game", long],
  ]) {
    if (group.length === 0) continue;
    const drawn = block(title, group, top, loudest);
    blocks.push(drawn.svg);
    top += drawn.height + 16;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${top}" viewBox="0 0 ${SHEET_WIDTH} ${top}">
  <rect width="${SHEET_WIDTH}" height="${top}" fill="#f6f9fb" />
  <text x="14" y="26" font-size="15" font-family="monospace" fill="#20303c">Animal Puzzle - every sound, rendered offline. Amplitude scaled to ${round(loudest)}; time to scale within each group.</text>
  ${blocks.join("\n")}
</svg>`;
}

if (drawSheet) {
  mkdirSync(outDir, { recursive: true });
  const svgFile = join(outDir, "sheet.svg");
  writeFileSync(svgFile, buildSheet(measured));
  console.log(`\nWaveforms: ${svgFile}`);
  if (haveRsvg()) {
    const png = join(outDir, "sheet.png");
    rsvg(["-w", "1200", "-o", png, svgFile]);
    console.log(`Waveforms: ${png}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} audio check(s) failed.`);
  process.exit(1);
}
console.log("\nEvery sound is inside its bounds.");
