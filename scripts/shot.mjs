/**
 * End-to-end visual check.
 *
 * Serves the production build, drives real pointer drags through the Chrome
 * DevTools Protocol, and screenshots the result. This exercises the actual
 * drag/snap path rather than just rendering a static page.
 *
 *   npm run build && npm run shot
 *
 * Output lands in .art/shots/.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { buildSheet } from "./shot-sheet.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const shotsDir = join(root, ".art/shots");
const PORT = 4319;
const DEBUG_PORT = 9333;
// The game deals its animals at random; `?seed=` pins them down so the
// screenshots from two runs show the same puzzle.
const SEED = 20260726;
const profileDir = join(root, ".art/chrome-profile");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

rmSync(shotsDir, { recursive: true, force: true });
mkdirSync(shotsDir, { recursive: true });

// --- static server --------------------------------------------------------

const server = createServer((req, res) => {
  const requested = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const relative = normalize(requested === "/" ? "/index.html" : requested).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  try {
    const body = readFileSync(join(dist, relative));
    res.writeHead(200, { "content-type": MIME[extname(relative)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

// --- browser --------------------------------------------------------------

rmSync(profileDir, { recursive: true, force: true });
// Which Chrome is on PATH depends on the machine: `chromium` on a Debian
// desktop, `google-chrome` on a GitHub Actions runner. CHROME_BIN lets the
// caller say, so CI does not need a different script.
const CHROME = process.env.CHROME_BIN || "chromium";
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1280,800",
    "about:blank",
  ],
  { stdio: "ignore" },
);

chrome.on("error", (error) => {
  const why = error.code === "ENOENT" ? `no such program: ${CHROME}` : error.message;
  console.error(
    `Could not start Chrome (${why}).\n` +
      "Install Chromium, or point CHROME_BIN at the browser to use:\n" +
      "  CHROME_BIN=google-chrome npm run shot",
  );
  process.exit(1);
});

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* browser not up yet */
    }
    await sleep(250);
  }
  throw new Error(`${CHROME} did not expose a debuggable page.`);
}

let socket;
try {
  const target = await findTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
} catch (error) {
  socket?.close();
  chrome.kill();
  server.close();
  throw error;
}

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "evaluation failed");
  }
  return result.result.value;
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = join(shotsDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log("wrote", file);
  return file;
}

async function mouse(type, x, y) {
  await send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
    pointerType: "mouse",
  });
}

/** Centre of a `.piece` / `.hole` element in CSS pixels. */
const centreOf = (selector) =>
  evaluate(`
  (() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()
`);

/**
 * A point inside a piece's grab box that is not on its artwork - somewhere the
 * old hit test, which only ever saw painted shapes, would have missed. Which
 * element is topmost at a point says which of the two caught it. Corners and
 * edge midpoints are tried in turn; null means the animal fills its own box,
 * which none of them do.
 */
const emptySpotOn = (pieceId) =>
  evaluate(`
  (() => {
    const piece = document.querySelector(${JSON.stringify(`.piece[data-piece="${pieceId}"]`)});
    if (!piece) return null;
    const r = piece.getBoundingClientRect();
    const inset = 3;
    const spots = [[0,0],[1,0],[0,1],[1,1],[0.5,0],[0,0.5],[1,0.5],[0.5,1]];
    for (const [fx, fy] of spots) {
      const x = r.x + inset + fx * (r.width - 2 * inset);
      const y = r.y + inset + fy * (r.height - 2 * inset);
      const hit = document.elementFromPoint(x, y);
      if (hit && hit.classList.contains('grab-box') && hit.closest('.piece') === piece) {
        return { x, y };
      }
    }
    return null;
  })()
`);

/**
 * Drag a piece into its hole. `grabAt` picks it up somewhere other than the
 * middle - the drop moves by the same offset, so where it lands is unchanged.
 */
async function dragAnimal(pieceId, { pauseAtHalfway, grabAt } = {}) {
  const centre = await centreOf(`.piece[data-piece="${pieceId}"]`);
  const hole = await centreOf(`.hole[data-piece="${pieceId}"]`);
  if (!centre || !hole) throw new Error(`Could not locate piece or hole for "${pieceId}".`);

  const from = grabAt ?? centre;
  const to = { x: hole.x + (from.x - centre.x), y: hole.y + (from.y - centre.y) };

  await mouse("mousePressed", from.x, from.y);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await mouse("mouseMoved", from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    if (pauseAtHalfway && i === Math.floor(steps / 2)) await pauseAtHalfway();
    await sleep(12);
  }
  await mouse("mouseReleased", to.x, to.y);
  await sleep(420);
}

const placedCount = () => evaluate(`document.querySelectorAll('.piece.is-placed').length`);

const pieceCount = () => evaluate(`document.querySelectorAll('.piece').length`);
const grabBoxCount = () => evaluate(`document.querySelectorAll('.piece .grab-box').length`);

/**
 * How far each piece's grab box sits outside the animal it covers, on every
 * side, as a share of the piece. It has to cover the whole drawing - a box
 * measured in the wrong units would sit inside it - without ballooning past it
 * towards the next piece. The drawing is everything in the artwork group except
 * the grab box itself, so a tail declared as an overhang counts too.
 */
const grabBoxMargins = () =>
  evaluate(`
  (() => {
    const margins = [...document.querySelectorAll('.piece')].flatMap((piece) => {
      const box = piece.getBoundingClientRect();
      const drawn = [...piece.querySelectorAll('.art > *')]
        .filter((el) => !el.classList.contains('grab-box'))
        .map((el) => el.getBoundingClientRect());
      const edges = {
        left: Math.min(...drawn.map((r) => r.x)),
        top: Math.min(...drawn.map((r) => r.y)),
        right: Math.max(...drawn.map((r) => r.right)),
        bottom: Math.max(...drawn.map((r) => r.bottom)),
      };
      const side = Math.max(box.width, box.height);
      return [
        edges.left - box.x,
        edges.top - box.y,
        box.right - edges.right,
        box.bottom - edges.bottom,
      ].map((margin) => margin / side);
    });
    return { smallest: Math.min(...margins), largest: Math.max(...margins) };
  })()
`);
const holeCount = () => evaluate(`document.querySelectorAll('.hole').length`);
const stageNumber = () => evaluate(`Number(document.querySelector('#stage').dataset.stage)`);
const layoutName = () => evaluate(`document.querySelector('#stage').dataset.layout`);
const animalsOnBoard = () =>
  evaluate(`[...document.querySelectorAll('.piece')].map((p) => p.dataset.piece)`);
/** The cast is random, so the script asks the board who is on it. */
const unplacedAnimals = () =>
  evaluate(`[...document.querySelectorAll('.piece:not(.is-placed)')].map((p) => p.dataset.piece)`);
const finishButtons = () =>
  evaluate(`document.querySelectorAll('#stage .fx [role="button"]').length`);
const finishLabel = () =>
  evaluate(
    `document.querySelector('#stage .fx [role="button"]')?.getAttribute('aria-label') ?? ''`,
  );

/** Press the big button that ends a stage, then wait for the next board. */
async function pressFinishButton() {
  await evaluate(`document.querySelector('#stage .fx [role="button"]').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )`);
  await sleep(500);
}

/** Drag every animal still in the tray into its hole. */
async function solveRemaining() {
  for (const animal of await unplacedAnimals()) await dragAnimal(animal);
  await sleep(700);
}

/**
 * Every piece on the board carries a grab box that covers its drawing. The
 * bounds are loose on purpose: they are here to catch a box measured in the
 * wrong units - which would be out by tens of percent - not to pin down the
 * padding, which `GRAB_PADDING` owns.
 */
async function checkGrabBoxes(expected) {
  check("every piece carries a grab box", (await grabBoxCount()) === expected);
  const { smallest, largest } = await grabBoxMargins();
  const share = (value) => `${(value * 100).toFixed(1)}% of a piece`;
  check(`grab boxes cover the artwork (${share(smallest)} at the tightest)`, smallest >= -0.005);
  check(`grab boxes hug the artwork (${share(largest)} at the loosest)`, largest <= 0.07);
}

// --- run ------------------------------------------------------------------

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await setViewport(1280, 800);
  // The cast is dealt at random; a seed keeps the screenshots comparable
  // between runs. Randomness itself is checked at the end.
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?seed=${SEED}` });
  await sleep(900);

  const bootError = await evaluate(`document.querySelector('#stage') ? '' : 'stage missing'`);
  check("app boots and renders the stage", bootError === "");

  // --- stage 1: two animals -----------------------------------------------
  check("starts on stage 1", (await stageNumber()) === 1);
  check("two pieces rendered", (await pieceCount()) === 2);
  check("two holes rendered", (await holeCount()) === 2);
  const stage1Cast = await animalsOnBoard();
  check("stage 1 deals two different animals", new Set(stage1Cast).size === 2);
  await shot("01-stage1-start");

  // Drag one animal in, pausing mid-flight to capture the piece in hand.
  await dragAnimal(stage1Cast[0], { pauseAtHalfway: () => shot("02-mid-drag") });
  check("dragged piece snapped into its hole", (await placedCount()) === 1);

  // A deliberately bad drop must not stick.
  const stray = await centreOf(`.piece[data-piece="${stage1Cast[1]}"]`);
  await mouse("mousePressed", stray.x, stray.y);
  await mouse("mouseMoved", 640, 120);
  await mouse("mouseReleased", 640, 120);
  await sleep(500);
  check("wrong drop does not stick", (await placedCount()) === 1);
  await shot("03-after-wrong-drop");

  // A piece is picked up by the box around its artwork, not only where a finger
  // lands on paint, so the gap between a giraffe's legs works as well as the
  // giraffe does. Grab one somewhere the artwork is not, and it should still
  // come along and snap in.
  await checkGrabBoxes(2);
  const offPaint = await emptySpotOn(stage1Cast[1]);
  check("a piece has grabbable space off its artwork", offPaint !== null);
  if (offPaint) {
    await dragAnimal(stage1Cast[1], { grabAt: offPaint });
    check("a piece picked up off its artwork snaps in", (await placedCount()) === 2);
  }

  await solveRemaining();
  check("all two pieces placed", (await placedCount()) === 2);
  check("finish button appears when complete", (await finishButtons()) === 1);
  check("stage 1 offers the next puzzle", (await finishLabel()) === "Next puzzle");
  await shot("04-stage1-complete");

  // --- stage 2: three animals ---------------------------------------------
  await pressFinishButton();
  check("moves on to stage 2", (await stageNumber()) === 2);
  check("stage 2 has three pieces", (await pieceCount()) === 3);
  check("stage 2 starts empty", (await placedCount()) === 0);
  check("stage 2 deals three different animals", new Set(await animalsOnBoard()).size === 3);
  await shot("05-stage2-start");

  await solveRemaining();
  check("stage 2 can be completed", (await placedCount()) === 3);

  // --- stage 3: four animals ----------------------------------------------
  await pressFinishButton();
  check("moves on to stage 3", (await stageNumber()) === 3);
  check("stage 3 has four pieces", (await pieceCount()) === 4);
  check("stage 3 deals four different animals", new Set(await animalsOnBoard()).size === 4);
  await shot("06-stage3-start");

  await solveRemaining();
  check("stage 3 can be completed", (await placedCount()) === 4);

  // --- stage 4: five animals ----------------------------------------------
  await pressFinishButton();
  check("moves on to stage 4", (await stageNumber()) === 4);
  check("stage 4 has five pieces", (await pieceCount()) === 5);
  check("stage 4 deals five different animals", new Set(await animalsOnBoard()).size === 5);
  await shot("07-stage4-start");

  await solveRemaining();
  check("stage 4 can be completed", (await placedCount()) === 5);

  // --- stage 5: six animals -----------------------------------------------
  await pressFinishButton();
  check("moves on to stage 5", (await stageNumber()) === 5);
  check("stage 5 has six pieces", (await pieceCount()) === 6);
  const cast = await animalsOnBoard();
  check("the last stage deals six different animals", new Set(cast).size === 6);
  // Six smaller pieces: the grab boxes have to hold their shape at this size
  // too, where the tray leaves least room between them.
  await checkGrabBoxes(6);
  await shot("08-stage5-start");

  await dragAnimal(cast[0]);
  await dragAnimal(cast[1]);
  check("the pieces snap into their holes", (await placedCount()) === 2);
  await shot("09-stage5-two-placed");

  // Rotating mid-puzzle must reflow and keep progress.
  await setViewport(480, 900);
  await sleep(600);
  check("switches to the portrait layout", (await layoutName()) === "portrait");
  check("rotation preserves placed pieces", (await placedCount()) === 2);
  check("rotation stays on the same stage", (await stageNumber()) === 5);
  await shot("10-portrait-stage5");

  const fits = await evaluate(`
    (() => {
      const r = document.querySelector('#stage').getBoundingClientRect();
      return r.width <= window.innerWidth + 1 && r.height <= window.innerHeight + 1;
    })()
  `);
  check("stage fits inside a narrow portrait viewport", fits === true);

  const coverage = await evaluate(`
    (() => {
      const r = document.querySelector('#stage').getBoundingClientRect();
      return (r.width * r.height) / (window.innerWidth * window.innerHeight);
    })()
  `);
  check(`portrait fills the screen (${(coverage * 100).toFixed(0)}%)`, coverage > 0.75);

  // Finish the last stage in portrait; the button should now loop the game.
  await solveRemaining();
  check("dragging works in the portrait layout", (await placedCount()) === 6);
  check("the last stage offers a replay", (await finishLabel()) === "Play again");
  await shot("11-portrait-complete");

  await pressFinishButton();
  check("play again loops back to stage 1", (await stageNumber()) === 1);
  check("looping back deals two fresh pieces", (await pieceCount()) === 2);
  check("looping back clears the board", (await placedCount()) === 0);
  await shot("12-looped-back");

  // --- a fresh deal every time ---------------------------------------------
  await evaluate(`document.querySelector('.reset-button').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )`);
  await sleep(600);
  check("reset deals a fresh puzzle", (await pieceCount()) === 2 && (await placedCount()) === 0);
  check("reset keeps the stage", (await stageNumber()) === 1);

  await setViewport(1280, 800);
  const castForSeed = async (seed) => {
    await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?seed=${seed}` });
    await sleep(800);
    return (await animalsOnBoard()).join();
  };
  check("the same seed deals the same puzzle", (await castForSeed(SEED)) === stage1Cast.join());
  const deals = new Set();
  for (const seed of [11, 22, 33, 44, 55, 66]) deals.add(await castForSeed(seed));
  check(`different seeds deal different puzzles (${deals.size} of 6)`, deals.size >= 4);
  await shot("13-another-deal");
} finally {
  socket.close();
  chrome.kill();
  server.close();
}

// Built even when checks fail: a failed run is exactly when someone wants to
// look at the pictures. A sheet is a convenience, so losing it must not turn a
// reporting problem into a failed verification.
try {
  const sheet = buildSheet();
  if (sheet) console.log(`\nContact sheet: ${sheet}`);
  else console.log(`\nNo contact sheet (ImageMagick not installed). Screenshots: ${shotsDir}`);
} catch (error) {
  console.warn(
    `\nCould not build the contact sheet (${error.message}).\n` +
      `Attach the individual screenshots from ${shotsDir} instead.`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
