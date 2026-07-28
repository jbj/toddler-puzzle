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
const levelNumber = () => evaluate(`Number(document.querySelector('#stage').dataset.level)`);
const chapterName = () => evaluate(`document.querySelector('#stage').dataset.chapter`);
/** Which kind is actually playing: a level's own, or the stand-in for it. */
const kindName = () => evaluate(`document.querySelector('#stage').dataset.kind`);
const layoutName = () => evaluate(`document.querySelector('#stage').dataset.layout`);
/** The chapter dots: how many there are, and how many are filled in. */
const chapterDots = () =>
  evaluate(`
  (() => {
    const dots = [...document.querySelectorAll('.chapter-dots circle')];
    return { total: dots.length, filled: dots.filter((d) => d.getAttribute('fill') === '#ffd23f').length };
  })()
`);
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

/** Press the big button that ends a level, then wait for the next board. */
async function pressFinishButton() {
  await evaluate(`document.querySelector('#stage .fx [role="button"]').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )`);
  await sleep(500);
}

// --- the grown-up panel ---------------------------------------------------
// The one part of the game that is not for the child, and the only place
// progress can be cleared. It is opened by holding a labelled button for two
// seconds; tapping it, however often, must never get in. See src/grownups.ts.

const panelIsOpen = () => evaluate(`!!document.querySelector('.grownups-panel:not([hidden])')`);
const grownUpsLabel = () =>
  evaluate(`document.querySelector('.grownups-key-label')?.textContent ?? ''`);
/** Whether "Hold to open" is on screen: the answer to a tap that did nothing. */
const holdPromptShown = () =>
  evaluate(`getComputedStyle(document.querySelector('.grownups-key-hint')).display !== 'none'`);

/** The level map: how many squares, how many played, and which is current. */
const levelSquares = () =>
  evaluate(`
  (() => {
    const squares = [...document.querySelectorAll('.grownups-level')];
    const current = squares.find((s) => s.classList.contains('is-current'));
    return {
      total: squares.length,
      reached: squares.filter((s) => s.classList.contains('is-reached')).length,
      current: Number(current?.dataset.level ?? 0),
    };
  })()
`);

const soundIsOn = () =>
  evaluate(
    `document.querySelector('.grownups-switch[data-setting="sound"]').getAttribute('aria-checked') === 'true'`,
  );

/** The record as it actually sits in storage, which is what a reload will read. */
const savedRecord = () =>
  evaluate(`JSON.parse(window.localStorage.getItem('animal-puzzle') ?? 'null')`);

/** A click on something inside the panel, scrolled into view first. */
async function pressInPanel(selector) {
  await evaluate(
    `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`,
  );
  await sleep(150);
  const at = await centreOf(selector);
  if (!at) throw new Error(`Nothing to press at "${selector}".`);
  await mouse("mousePressed", at.x, at.y);
  await mouse("mouseReleased", at.x, at.y);
  await sleep(300);
}

/**
 * Watch the long timers the page arms from now on. The prompt that answers a
 * tap is taken down on a timer of its own, and a toddler taps far faster than
 * it expires, so the interesting question is whether the tenth tap leaves ten
 * timers pending or one. Only long timers are counted, which leaves the
 * two-second one that arms the opening out of it.
 */
const watchLongTimers = () =>
  evaluate(`
  (() => {
    const armed = new Set();
    const setLater = window.setTimeout.bind(window);
    const clearLater = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms, ...rest) => {
      let id;
      id = setLater((...args) => { armed.delete(id); fn(...args); }, ms, ...rest);
      if (ms > 3000) armed.add(id);
      return id;
    };
    window.clearTimeout = (id) => { armed.delete(id); clearLater(id); };
    window.__longTimers = () => armed.size;
    window.__stopWatchingTimers = () => {
      window.setTimeout = setLater;
      window.clearTimeout = clearLater;
    };
    return true;
  })()
`);

const longTimersPending = () => evaluate(`window.__longTimers()`);
const stopWatchingTimers = () => evaluate(`window.__stopWatchingTimers()`);

/** Press and release the grown-ups button, the way a small hand would. */
async function tapGrownUps() {
  const at = await centreOf(".grownups-key");
  if (!at) throw new Error("No grown-ups button on screen.");
  await mouse("mousePressed", at.x, at.y);
  await sleep(70);
  await mouse("mouseReleased", at.x, at.y);
  await sleep(70);
}

/** Hold it down the way a grown-up who has read "Hold to open" would. */
async function holdGrownUps({ pauseAtHalfway } = {}) {
  const at = await centreOf(".grownups-key");
  if (!at) throw new Error("No grown-ups button on screen.");
  await mouse("mousePressed", at.x, at.y);
  await sleep(1200);
  if (pauseAtHalfway) await pauseAtHalfway();
  await sleep(1200);
  await mouse("mouseReleased", at.x, at.y);
  await sleep(300);
}

/**
 * Start at a given level. `?level=` exists for this script and for whoever is
 * working on the game - reaching level 30 by playing the twenty-nine before it
 * would take minutes - and is not a difficulty picker: nothing in the game
 * offers it, and the player cannot read.
 */
async function goToLevel(level) {
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?level=${level}&seed=${SEED}` });
  await sleep(900);
}

/** Reload the way a child's grown-up would open it: no level in the URL. */
async function reopenTheGame() {
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?seed=${SEED}` });
  await sleep(900);
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
  // between runs. Randomness itself is checked at the end. The Chrome profile
  // is thrown away each run, so this is a child who has never played.
  await reopenTheGame();

  const bootError = await evaluate(`document.querySelector('#stage') ? '' : 'stage missing'`);
  check("app boots and renders the stage", bootError === "");

  // --- level 1: one huge animal --------------------------------------------
  // The ramp starts with a single piece so the first win arrives at once; the
  // level table (src/levels.ts) is where that and the other twenty-nine live.
  check("a new player starts on level 1", (await levelNumber()) === 1);
  check("level 1 is in the first chapter", (await chapterName()) === "first-touches");
  const firstCount = await pieceCount();
  check(`level 1 is one or two huge pieces (${firstCount})`, firstCount >= 1 && firstCount <= 2);
  check("every piece has a hole", (await holeCount()) === firstCount);
  const dots = await chapterDots();
  check(
    `six chapter dots, one filled (${dots.filled} of ${dots.total})`,
    dots.total === 6 && dots.filled === 1,
  );
  await shot("01-level1-start");

  // Drag it in, pausing mid-flight to capture the piece in hand.
  await dragAnimal((await animalsOnBoard())[0], { pauseAtHalfway: () => shot("02-mid-drag") });
  check("dragged piece snapped into its hole", (await placedCount()) === 1);
  await solveRemaining();
  check("finish button appears when complete", (await finishButtons()) === 1);
  check("level 1 offers the next puzzle", (await finishLabel()) === "Next puzzle");
  await shot("03-level1-complete");

  // --- level 2: a level whose kind is not built yet -------------------------
  // Cause-and-effect play does not exist, so level 2 is played by the
  // shape-match stand-in (src/kinds/registry.ts). It has to be a real, complete
  // level: that is the whole point of standing in rather than skipping.
  await pressFinishButton();
  check("moves on to level 2", (await levelNumber()) === 2);
  check("an unbuilt kind is played by the stand-in", (await kindName()) === "shape-match");
  const secondCast = await animalsOnBoard();
  check("level 2 deals two different animals", new Set(secondCast).size === 2);
  check("level 2 starts empty", (await placedCount()) === 0);

  // A deliberately bad drop must not stick.
  const stray = await centreOf(`.piece[data-piece="${secondCast[0]}"]`);
  await mouse("mousePressed", stray.x, stray.y);
  await mouse("mouseMoved", 640, 120);
  await mouse("mouseReleased", 640, 120);
  await sleep(500);
  check("wrong drop does not stick", (await placedCount()) === 0);
  await shot("04-after-wrong-drop");

  // A piece is picked up by the box around its artwork, not only where a finger
  // lands on paint, so the gap between a giraffe's legs works as well as the
  // giraffe does. Grab one somewhere the artwork is not, and it should still
  // come along and snap in.
  await checkGrabBoxes(2);
  const offPaint = await emptySpotOn(secondCast[1]);
  check("a piece has grabbable space off its artwork", offPaint !== null);
  if (offPaint) {
    await dragAnimal(secondCast[1], { grabAt: offPaint });
    check("a piece picked up off its artwork snaps in", (await placedCount()) === 1);
  }

  await solveRemaining();
  check("level 2 can be completed", (await placedCount()) === 2);

  // --- the rest of the first chapter ---------------------------------------
  // Five levels that grow rather than five of the same size: the table says the
  // board never shrinks as a chapter goes on, and this is that, played.
  let previousCount = 2;
  for (const level of [3, 4, 5]) {
    await pressFinishButton();
    check(`moves on to level ${level}`, (await levelNumber()) === level);
    const pieces = await pieceCount();
    check(`level ${level} does not shrink (${pieces} pieces)`, pieces >= previousCount);
    check(
      `level ${level} deals ${pieces} different animals`,
      new Set(await animalsOnBoard()).size === pieces,
    );
    previousCount = pieces;
    if (level === 5) await shot("05-level5-start");
    await solveRemaining();
    check(`level ${level} can be completed`, (await placedCount()) === pieces);
  }
  check("the first chapter still offers the next puzzle", (await finishLabel()) === "Next puzzle");

  // --- coming back to it tomorrow ------------------------------------------
  // Thirty levels is more than one sitting, so the level being played is
  // remembered (src/progress.ts) and reopening the game starts there. This is
  // the only place that path is exercised end to end: a real browser, a real
  // reload, a real localStorage.
  await pressFinishButton();
  check("moves on to level 6", (await levelNumber()) === 6);
  await reopenTheGame();
  check("reopening the game resumes where the child stopped", (await levelNumber()) === 6);
  check("resuming deals a fresh board", (await placedCount()) === 0);
  check("resuming keeps the chapter", (await chapterName()) === "animals");

  // --- the grown-up panel ---------------------------------------------------
  // A visible, labelled button that a toddler cannot get through and a parent
  // needs no instructions for. Everything below is played through the real
  // thing: real presses, a real hold, a real reload.
  check("a grown-up button says what it is", (await grownUpsLabel()) === "Grown-ups");
  check("the panel starts closed", (await panelIsOpen()) === false);

  await watchLongTimers();
  for (let tap = 0; tap < 10; tap++) await tapGrownUps();
  check("tapping the button never opens the panel", (await panelIsOpen()) === false);
  check("tapping it answers with 'Hold to open'", (await holdPromptShown()) === true);
  const pending = await longTimersPending();
  check(`ten taps leave one timer behind, not ten (${pending})`, pending === 1);
  await stopWatchingTimers();

  await holdGrownUps({ pauseAtHalfway: () => shot("06-grownups-hold") });
  check("holding the button opens the panel", (await panelIsOpen()) === true);
  const map = await levelSquares();
  check(`the level map shows all thirty levels (${map.total})`, map.total === 30);
  check(`the map marks the six levels played (${map.reached})`, map.reached === 6);
  check("the map marks the level being played", map.current === 6);
  await shot("07-grownups-panel");

  // A level chosen here moves the child; it does not claim they got there.
  await pressInPanel('.grownups-level[data-level="12"]');
  check("choosing a level closes the panel", (await panelIsOpen()) === false);
  check("choosing a level deals it", (await levelNumber()) === 12);
  check("a chosen level starts empty", (await placedCount()) === 0);
  const afterJump = await savedRecord();
  check("a chosen level is remembered", afterJump?.level === 12);
  check(`reading the map does not fill it in (${afterJump?.furthest})`, afterJump?.furthest === 6);

  // A switch that has to survive being closed, and then a whole reload.
  await holdGrownUps();
  check("the panel reopens on the chosen level", (await levelSquares()).current === 12);
  check("sound starts on", (await soundIsOn()) === true);
  await pressInPanel('.grownups-switch[data-setting="sound"]');
  check("the sound switch turns off", (await soundIsOn()) === false);
  await pressInPanel(".grownups-done");
  check("Done closes the panel", (await panelIsOpen()) === false);

  await reopenTheGame();
  check("the game reopens on the chosen level", (await levelNumber()) === 12);
  await holdGrownUps();
  check("a switch survives a reload", (await soundIsOn()) === false);
  await pressInPanel('.grownups-switch[data-setting="sound"]');
  check("sound can be turned back on", (await soundIsOn()) === true);

  // The only place progress can be cleared, and it asks first.
  await pressInPanel(".grownups-reset");
  check("resetting asks before it does anything", (await levelNumber()) === 12);
  await pressInPanel(".grownups-reset");
  check("resetting starts the game over", (await levelNumber()) === 1);
  const afterReset = await levelSquares();
  check(`the map empties with it (${afterReset.reached})`, afterReset.reached === 1);

  // Back where the rest of this run expects the child to be.
  await pressInPanel('.grownups-level[data-level="6"]');
  check("a grown-up can put the child back", (await levelNumber()) === 6);

  // --- level 10: the busiest board of animals ------------------------------
  // `?level=` starts partway along the ramp. It is for this script and for
  // whoever is working on the game; nothing in the game offers it.
  await goToLevel(10);
  check("jumps to level 10", (await levelNumber()) === 10);
  check("level 10 is in the animals chapter", (await chapterName()) === "animals");
  const busyCast = await animalsOnBoard();
  check("level 10 deals six different animals", new Set(busyCast).size === 6);
  const busyDots = await chapterDots();
  check(`two chapter dots filled by level 10 (${busyDots.filled})`, busyDots.filled === 2);
  // Six smaller pieces: the grab boxes have to hold their shape at this size
  // too, where the tray leaves least room between them.
  await checkGrabBoxes(6);
  await shot("08-level10-start");

  await dragAnimal(busyCast[0]);
  await dragAnimal(busyCast[1]);
  check("the pieces snap into their holes", (await placedCount()) === 2);
  await shot("09-level10-two-placed");

  // Rotating mid-puzzle must reflow and keep progress.
  await setViewport(480, 900);
  await sleep(600);
  check("switches to the portrait layout", (await layoutName()) === "portrait");
  check("rotation preserves placed pieces", (await placedCount()) === 2);
  check("rotation stays on the same level", (await levelNumber()) === 10);
  await shot("10-portrait-level10");

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

  await solveRemaining();
  check("dragging works in the portrait layout", (await placedCount()) === 6);
  check("a middle level offers the next puzzle", (await finishLabel()) === "Next puzzle");
  await shot("11-portrait-complete");

  // --- level 30: the last one, and the loop back ---------------------------
  await setViewport(1280, 800);
  // A whole level has just been played from `?level=`, which is a tool for
  // working on the game rather than a way into it: the place the child had got
  // to is exactly where they left it.
  await reopenTheGame();
  check("a level played from ?level= leaves the saved level alone", (await levelNumber()) === 6);
  await goToLevel(30);
  check("jumps to the last level", (await levelNumber()) === 30);
  check("the last level is in the mastery chapter", (await chapterName()) === "mastery");
  const lastDots = await chapterDots();
  check(`every chapter dot filled on level 30 (${lastDots.filled})`, lastDots.filled === 6);
  const lastCount = await pieceCount();
  await shot("12-level30-start");

  await solveRemaining();
  check("the last level can be completed", (await placedCount()) === lastCount);
  check("the last level offers a replay", (await finishLabel()) === "Play again");
  await shot("13-level30-complete");

  await pressFinishButton();
  check("play again loops back to level 1", (await levelNumber()) === 1);
  check("looping back clears the board", (await placedCount()) === 0);
  await shot("14-looped-back");

  // --- a fresh deal every time ---------------------------------------------
  await evaluate(`document.querySelector('.reset-button').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )`);
  await sleep(600);
  check("reset deals a fresh puzzle", (await placedCount()) === 0);
  check("reset keeps the level", (await levelNumber()) === 1);

  const castForSeed = async (seed) => {
    await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?level=10&seed=${seed}` });
    await sleep(800);
    return (await animalsOnBoard()).join();
  };
  check("the same seed deals the same puzzle", (await castForSeed(SEED)) === busyCast.join());
  const deals = new Set();
  for (const seed of [11, 22, 33, 44, 55, 66]) deals.add(await castForSeed(seed));
  check(`different seeds deal different puzzles (${deals.size} of 6)`, deals.size >= 4);
  await shot("15-another-deal");
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
