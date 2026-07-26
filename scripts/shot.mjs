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

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const shotsDir = join(root, ".art/shots");
const PORT = 4319;
const DEBUG_PORT = 9333;
const profileDir = join(root, ".art/chrome-profile");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

mkdirSync(shotsDir, { recursive: true });

// --- static server --------------------------------------------------------

const server = createServer((req, res) => {
  const requested = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const relative = normalize(requested === "/" ? "/index.html" : requested).replace(/^(\.\.[/\\])+/, "");
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
const chrome = spawn("chromium", [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profileDir}`,
  "--no-sandbox",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1280,800",
  "about:blank",
], { stdio: "ignore" });

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
  throw new Error("Chromium did not expose a debuggable page.");
}

const target = await findTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

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
const centreOf = (selector) => evaluate(`
  (() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()
`);

async function dragAnimal(animal, { pauseAtHalfway } = {}) {
  const from = await centreOf(`.piece[data-animal="${animal}"]`);
  const to = await centreOf(`.hole[data-animal="${animal}"]`);
  if (!from || !to) throw new Error(`Could not locate piece or hole for "${animal}".`);

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

const placedCount = () => evaluate(
  `document.querySelectorAll('.piece.is-placed').length`,
);

const pieceCount = () => evaluate(`document.querySelectorAll('.piece').length`);
const holeCount = () => evaluate(`document.querySelectorAll('.hole').length`);
const stageNumber = () => evaluate(`Number(document.querySelector('#stage').dataset.stage)`);
const layoutName = () => evaluate(`document.querySelector('#stage').dataset.layout`);
const animalsOnBoard = () => evaluate(
  `[...document.querySelectorAll('.piece')].map((p) => p.dataset.animal)`,
);
const finishButtons = () => evaluate(
  `document.querySelectorAll('#stage .fx [role="button"]').length`,
);
const finishLabel = () => evaluate(
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
  const animals = await evaluate(
    `[...document.querySelectorAll('.piece:not(.is-placed)')].map((p) => p.dataset.animal)`,
  );
  for (const animal of animals) await dragAnimal(animal);
  await sleep(700);
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
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  await sleep(900);

  const bootError = await evaluate(`document.querySelector('#stage') ? '' : 'stage missing'`);
  check("app boots and renders the stage", bootError === "");

  // --- stage 1: three animals ---------------------------------------------
  check("starts on stage 1", (await stageNumber()) === 1);
  check("three pieces rendered", (await pieceCount()) === 3);
  check("three holes rendered", (await holeCount()) === 3);
  await shot("01-stage1-start");

  // Drag one animal in, pausing mid-flight to capture the piece in hand.
  await dragAnimal("elephant", { pauseAtHalfway: () => shot("02-mid-drag") });
  check("dragged piece snapped into its hole", (await placedCount()) === 1);

  // A deliberately bad drop must not stick.
  const duck = await centreOf(`.piece[data-animal="duck"]`);
  await mouse("mousePressed", duck.x, duck.y);
  await mouse("mouseMoved", 640, 120);
  await mouse("mouseReleased", 640, 120);
  await sleep(500);
  check("wrong drop does not stick", (await placedCount()) === 1);
  await shot("03-after-wrong-drop");

  await solveRemaining();
  check("all three pieces placed", (await placedCount()) === 3);
  check("finish button appears when complete", (await finishButtons()) === 1);
  check("stage 1 offers the next puzzle", (await finishLabel()) === "Next puzzle");
  await shot("04-stage1-complete");

  // --- stage 2: four animals ----------------------------------------------
  await pressFinishButton();
  check("moves on to stage 2", (await stageNumber()) === 2);
  check("stage 2 has four pieces", (await pieceCount()) === 4);
  check("stage 2 starts empty", (await placedCount()) === 0);
  await shot("05-stage2-start");

  await solveRemaining();
  check("stage 2 can be completed", (await placedCount()) === 4);

  // --- stage 3: six animals -----------------------------------------------
  await pressFinishButton();
  check("moves on to stage 3", (await stageNumber()) === 3);
  check("stage 3 has six pieces", (await pieceCount()) === 6);
  const cast = await animalsOnBoard();
  check("stage 3 brings in the new animals", cast.includes("rabbit") && cast.includes("butterfly"));
  await shot("06-stage3-start");

  await dragAnimal("rabbit");
  await dragAnimal("butterfly");
  check("the new animals snap into their holes", (await placedCount()) === 2);
  await shot("07-stage3-new-animals");

  // Rotating mid-puzzle must reflow and keep progress.
  await setViewport(480, 900);
  await sleep(600);
  check("switches to the portrait layout", (await layoutName()) === "portrait");
  check("rotation preserves placed pieces", (await placedCount()) === 2);
  check("rotation stays on the same stage", (await stageNumber()) === 3);
  await shot("08-portrait-stage3");

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
  await shot("09-portrait-complete");

  await pressFinishButton();
  check("play again loops back to stage 1", (await stageNumber()) === 1);
  check("looping back deals three fresh pieces", (await pieceCount()) === 3);
  check("looping back clears the board", (await placedCount()) === 0);
  await shot("10-looped-back");
} finally {
  socket.close();
  chrome.kill();
  server.close();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
