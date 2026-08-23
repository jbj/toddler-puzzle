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
import { fork } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { openChrome } from "./chrome.mjs";
import { browserSlots, freeDebugPort, listenOnFreePort } from "./concurrency.mjs";
import { buildSheet } from "./shot-sheet.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const shotsDir = join(root, ".art/shots");
// The game deals its animals at random; `?seed=` pins them down so the
// screenshots from two runs show the same puzzle.
const SEED = 20260726;
const workerArg = process.argv.find((arg) => arg.startsWith("--worker="));
const workerName = workerArg?.slice("--worker=".length) ?? null;
const verbose = process.argv.includes("--verbose");
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlySource = onlyArg?.slice("--only=".length) ?? null;
if (onlySource === "") {
  console.error("--only needs a non-empty regular-expression pattern.");
  process.exit(1);
}
let only;
try {
  only = onlySource === null ? null : new RegExp(onlySource, "i");
} catch (error) {
  console.error(`Invalid --only pattern "${onlySource}": ${error.message}`);
  process.exit(1);
}
const captureEveryShot = process.argv.includes("--all-shots");

// --- preflight ------------------------------------------------------------
//
// This file is a script, not a module: everything below runs at import time.
// Both checks here exist because the failure they replace arrives much later
// and points somewhere else.

// Importing this file *is* running it - there is no exported entry point to
// call, so `await import("./scripts/shot.mjs")` launches a browser, serves the
// build and plays the game. That is a surprising way to find out, especially
// for anyone reaching for it as a way to check the syntax.
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (!invokedDirectly()) {
  throw new Error(
    "scripts/shot.mjs is a script, not a module: importing it runs the whole " +
      "check.\nRun it with `npm run shot`, or check its syntax with " +
      "`node --check scripts/shot.mjs`.",
  );
}

// The run serves `dist/`, so without a build there is nothing to serve: the
// page comes back empty and the first thing to notice is a null `#stage`, deep
// in the run and far from the cause.
if (!existsSync(join(dist, "index.html"))) {
  console.error("There is no build to serve (dist/index.html is missing).\n\n    npm run build\n");
  process.exit(1);
}

// A build older than the code is worse than no build: every assertion below
// would be about code that is no longer in the tree, and would pass or fail on
// its own terms. `npm run build` type-checks first, so a type error in a test
// leaves the previous `dist/` standing - which is exactly when this bites.
const built = statSync(join(dist, "index.html")).mtimeMs;
const newer = ["src", "public", "index.html"]
  .map((path) => join(root, path))
  .flatMap((path) => filesUnder(path))
  .filter((file) => statSync(file).mtimeMs > built);
if (newer.length > 0) {
  const shown = newer.slice(0, 3).map((file) => file.slice(root.length));
  console.error(
    `The build is older than the code (${newer.length} file(s) changed since, ` +
      `including ${shown.join(", ")}).\nThe run would be checking something ` +
      "other than the working tree.\n\n    npm run build\n",
  );
  process.exit(1);
}

function filesUnder(path) {
  let entry;
  try {
    entry = statSync(path);
  } catch {
    return [];
  }
  if (!entry.isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

if (!workerName) {
  rmSync(shotsDir, { recursive: true, force: true });
  mkdirSync(shotsDir, { recursive: true });
}

// --- coverage of the sample -----------------------------------------------
// The run samples the thirty levels rather than playing them in order, which is
// what keeps it fast - but a hand-written sample decays in silence. Add a
// seventh kind, retune a chapter's kind out of the shots, or add a celebration
// the run never reaches, and every check below would go on passing while the
// harness tested less and less of the game. So the sample is held against the
// table it is meant to sample: these record what the live app actually put on
// screen as the run played, and the guard at the end of the run holds them
// against what the source of truth says must be covered. See
// docs/decisions/Guard the sample against the table, rather than shoot all
// thirty.md.
const coveredKinds = new Set();
const coveredChapters = new Set();
const coveredCelebrations = new Set();

/**
 * What the sample must cover, read from the source of truth rather than written
 * down here, so it cannot fall out of step with the table: add a kind, a chapter
 * or a celebration and this grows, and the guard starts asking the sample to
 * exercise it. Read as text because this script is plain node and cannot import
 * the app's TypeScript module chain (`celebration.ts` alone pulls in audio and
 * the DOM). The parse is aggregate and cross-checked against the live table by
 * the guard, so it needs no production hook and costs the bundle nothing.
 */
function requiredCoverage() {
  const levelsSrc = readFileSync(join(root, "src/levels.ts"), "utf8");
  // The LEVELS array only; "chapter" and "kind" appear in the prose above it too.
  const table = levelsSrc.slice(
    levelsSrc.indexOf("export const LEVELS"),
    levelsSrc.indexOf("export const LEVEL_COUNT"),
  );
  // Every row opens with these three fields, in this order and consecutive, so
  // one pass reads the whole table. A row the parse missed would drop the level
  // count below the live map and trip the guard's own sanity check.
  const rows = [
    ...table.matchAll(/level:\s*(\d+),\s*chapter:\s*"([^"]+)",\s*kind:\s*"([^"]+)"/g),
  ].map((m) => ({ level: Number(m[1]), chapter: m[2], kind: m[3] }));

  // Every celebration that exists, from the two union types it is made of: the
  // interludes, one of which ends each ordinary level, and the chapter ones.
  // The finale is among the second; it is played at the end of the game rather
  // than of a chapter. Read as two unions rather than one because `CelebrationId`
  // is now the sum of them and names nothing itself.
  const celebrationSrc = readFileSync(join(root, "src/celebration.ts"), "utf8");
  const namesIn = (type) => {
    const from = celebrationSrc.indexOf(`type ${type}`);
    const to = from < 0 ? -1 : celebrationSrc.indexOf(";", from);
    // Loudly, rather than by returning nothing. A rename that this stopped
    // finding would leave the set of celebrations empty and every coverage
    // check below trivially satisfied - a guard that inspects nothing, which
    // is the one way this whole section could fail without saying so.
    if (from < 0 || to < 0) throw new Error(`coverage: no \`type ${type}\` in src/celebration.ts`);
    const names = [...celebrationSrc.slice(from, to).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (names.length === 0) throw new Error(`coverage: \`type ${type}\` names nothing`);
    return names;
  };
  const celebrations = new Set([...namesIn("InterludeId"), ...namesIn("ChapterCelebrationId")]);

  // Kind and chapter -> the first level that would exercise it, so a miss can
  // name the line to add rather than send someone hunting.
  const kinds = new Map();
  const chapters = new Map();
  for (const row of rows) {
    if (!kinds.has(row.kind)) kinds.set(row.kind, row.level);
    if (!chapters.has(row.chapter)) chapters.set(row.chapter, row.level);
  }
  return { rows, kinds, chapters, celebrations };
}

// --- static server --------------------------------------------------------

const serve = (req, res) => {
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
};

// --- browser --------------------------------------------------------------

// Each segment owns its server, profile and Chrome. Keeping these bindings at
// module scope lets the long-established driving helpers below stay exactly as
// they were while the worker lifecycle remains in one small place.
let server;
let browser;
let send;
let evaluate;
let PORT;
let workerProfileDir;

async function openWorker(name) {
  server = createServer(serve);
  PORT = await listenOnFreePort(server);

  try {
    workerProfileDir = join(root, `.art/chrome-profile-${name}-${process.pid}`);
    browser = await openChrome({
      debugPort: freeDebugPort(),
      profileDir: workerProfileDir,
    });
  } catch (error) {
    server.close();
    throw error;
  }
  ({ send, evaluate } = browser);
}

async function closeWorker() {
  browser?.close();
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  if (!workerProfileDir) return;
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      rmSync(workerProfileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error.code) || Date.now() >= deadline) {
        throw error;
      }
      await sleep(100);
    }
  }
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
  if (only && !captureEveryShot && !only.test(name)) return null;
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = join(shotsDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
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
 * Centre of what a piece actually *draws*, the grab box left out. The grab box
 * is the drawing padded and then thickened, so for a long thin piece it is a
 * good deal taller or wider than what it covers. Where a piece has come to rest
 * is a question about its drawing, and a shadow is drawn from the same path, so
 * this is the like-for-like measurement.
 */
const drawingCentreOf = (pieceId) =>
  evaluate(
    `
  (() => {
    const piece = document.querySelector('.piece[data-piece="' + ${JSON.stringify("PIECE")} + '"]');
    if (!piece) return null;
    const art = piece.querySelector('.art');
    if (!art) return null;
    const drawn = Array.from(art.children).filter((child) => !child.classList.contains('grab-box'));
    if (drawn.length === 0) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const child of drawn) {
      const r = child.getBoundingClientRect();
      left = Math.min(left, r.x); top = Math.min(top, r.y);
      right = Math.max(right, r.x + r.width); bottom = Math.max(bottom, r.y + r.height);
    }
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  })()
`.replace("PIECE", pieceId),
  );

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
 * Which hole a piece belongs in. Usually its own, because usually a piece is
 * the whole of what fills a hole; the slices of one animal all aim at that
 * animal's hole, and say so in their ids (`slice:<animal>:<of>:<index>`).
 */
const holeFor = (pieceId) => (pieceId.startsWith("slice:") ? pieceId.split(":")[1] : pieceId);

/** Where an element's own (0,0) sits on screen, in CSS pixels. */
const originOf = (selector) =>
  evaluate(`
  (() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const m = el.getScreenCTM();
    return m ? { x: m.e, y: m.f } : null;
  })()
`);

/**
 * What to aim a piece at. A cut-up picture's hole is the whole picture, whose
 * middle is only one piece's home, so a piece of one aims at the cut its own
 * outline made in the guide (`.cell[data-piece=...]`, minted by
 * `src/picture-pieces.ts` for both the jigsaw and the shatter) - which is the
 * same path the piece is clipped from, so aiming its drawing at that cut aims
 * it at where the drawing belongs.
 *
 * A slice has no cut drawn for it - the hole is the animal, whole - so it is
 * aimed by origins instead (`sliceAim` below).
 */
const targetSelector = (pieceId) =>
  /^(jigsaw|shatter):/.test(pieceId) && pieceId.split(":").length > 2
    ? `.cell[data-piece="${pieceId}"]`
    : `.hole[data-piece="${holeFor(pieceId)}"]`;

/** Where a slice's own place inside its animal is, in CSS pixels. */
async function sliceAim(pieceId, centre) {
  const piece = await originOf(`.piece[data-piece="${pieceId}"] .art`);
  const hole = await originOf(`.hole[data-piece="${holeFor(pieceId)}"]`);
  if (!piece || !hole || !centre) return null;
  return { x: centre.x + (hole.x - piece.x), y: centre.y + (hole.y - piece.y) };
}

/**
 * Drag a piece into its hole. `grabAt` picks it up somewhere other than the
 * middle - the drop moves by the same offset, so where it lands is unchanged.
 * `onto` aims it at some other piece's hole instead of its own, which is how a
 * polygon scene's interchangeable shapes are exercised.
 */
async function dragAnimal(pieceId, { pauseAtHalfway, grabAt, onto } = {}) {
  // The grab box rather than the whole piece: it is the area a finger can
  // actually pick up, and for a slice it is the only part of the piece that is
  // anywhere near the drawing - the box around a slice is mostly the rest of
  // the animal.
  const centre = await centreOf(`.piece[data-piece="${pieceId}"] .grab-box`);
  // A slice aims at its own place inside the animal, like every other piece of
  // a bigger thing. The hole is the whole animal, so its middle is nobody's
  // home in particular; what the two share is an origin and a scale, so the
  // offset of a slice's box within its own piece is the offset of its place
  // within the hole.
  const aim =
    !onto && pieceId.startsWith("slice:")
      ? await sliceAim(pieceId, centre)
      : await centreOf(targetSelector(onto ?? pieceId));
  if (!centre || !aim) throw new Error(`Could not locate piece or hole for "${pieceId}".`);

  const from = grabAt ?? centre;
  const to = { x: aim.x + (from.x - centre.x), y: aim.y + (from.y - centre.y) };

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
/** The cut lines drawn over a jigsaw's guide, one per piece. */
const cutsInGuide = () => evaluate(`document.querySelectorAll('.hole .cell').length`);
/** Is the picture still showing under the frame it is being built in? */
const guideIsShowing = () =>
  evaluate(`Number(getComputedStyle(document.querySelector('.hole')).opacity) > 0.5`);

/**
 * The board a cut-up picture is played on, as the browser draws it: what the
 * picture covers of the stage, and whether the flat backdrop behind it is the
 * same colour as the page around the stage.
 *
 * Both are things only a rendered board can answer. The picture has to take the
 * board rather than stand in the middle of it, and the colour is one CSS
 * variable painted in two places - the page's background and the SVG rect - so
 * what is checked is that the variable actually reaches both.
 */
const pictureBoard = () =>
  evaluate(`(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const hole = document.querySelector('.hole').getBoundingClientRect();
    const backdrop = document.querySelector('#stage .backdrop rect');
    return {
      across: hole.width / stage.width,
      down: hole.height / stage.height,
      backdrop: backdrop ? getComputedStyle(backdrop).fill : null,
      page: getComputedStyle(document.body).backgroundColor,
    };
  })()`);
/**
 * What the cut edges on a set of pieces are doing: how many pieces carry one,
 * and the brightest one showing. Both numbers, because a check that only asked
 * for nothing showing would pass on a board where no edge was ever drawn -
 * which is a different bug, not this rule kept.
 */
const cutEdgesOn = (selector) =>
  evaluate(`(() => {
  const cuts = [...document.querySelectorAll(${JSON.stringify(selector)} + ' .cut')];
  const worst = cuts.reduce((most, cut) => Math.max(most, Number(getComputedStyle(cut).opacity)), 0);
  return { drawn: cuts.length, worst };
})()`);
/**
 * The same reading, taken once the fade it is watching has settled.
 *
 * A placed piece gives up its cut edge over 320ms, and `getComputedStyle`
 * reports what that transition is showing at the instant it is asked, not where
 * it is going. Nothing between the last piece landing and the reading waits for
 * that fade: `solveRemaining` returns on the celebration appearing, and the
 * check follows immediately. Ordinarily the fade wins that race - it was over
 * in all ten runs probed here, idle and under twenty busy cores - but nothing
 * makes it win, and a full `verify` failed this check once in ten runs on a
 * loaded laptop with `4 edges faded`, which is `drawn` right and `worst` not
 * zero: an edge caught still on its way out.
 *
 * The rule being kept is about an animal at rest, not about how fast it gets
 * there, so the fix is to read it at rest. The check itself is unchanged, and
 * the wait cannot turn a real fault into a pass: a board that draws no edge, or
 * one whose edges are still showing two seconds later, reaches the deadline
 * with the numbers that say so and fails the same check with the same message.
 */
const settledCutEdgesOn = (selector, drawn, within = 2000) =>
  waitUntil(
    () => cutEdgesOn(selector),
    (edges) => edges.drawn === drawn && edges.worst === 0,
    within,
  );
/**
 * The other half of that rule: which of its two clips each piece of a cut-up
 * drawing is wearing. A piece is clipped to the line it was cut along while
 * there is still a gap in the drawing, and to the same line spread by a hair
 * once the drawing is whole, so the joins close as the last piece lands. Only a
 * browser knows which one applies - it is a CSS switch on a custom property -
 * so this is the only place either can be seen.
 */
const cutClipsOn = (selector) =>
  evaluate(`(() => {
  const arts = [...document.querySelectorAll(${JSON.stringify(selector)} + ' .cut-art')];
  const wearing = (art) => {
    const applied = getComputedStyle(art).clipPath.replaceAll('"', '');
    const named = (name) => art.style.getPropertyValue(name).trim().replaceAll('"', '');
    if (applied === named('--cut-spread')) return 'spread';
    if (applied === named('--cut-exact')) return 'exact';
    return applied;
  };
  const worn = arts.map(wearing);
  return { drawn: arts.length, spread: worn.filter((w) => w === 'spread').length,
           exact: worn.filter((w) => w === 'exact').length };
})()`);
/**
 * The level on screen. Reads the chapter and kind alongside it in the same
 * round-trip and records them as covered, so the coverage guard at the end of
 * the run sees every kind and chapter the sample put up - however the run
 * reached the level, and without a single extra request.
 */
const levelNumber = async () => {
  const stage = await evaluate(`(() => {
    const s = document.querySelector('#stage');
    if (!s) return null;
    return { level: Number(s.dataset.level), chapter: s.dataset.chapter ?? '', kind: s.dataset.kind ?? '' };
  })()`);
  if (!stage) return NaN;
  if (stage.kind) coveredKinds.add(stage.kind);
  if (stage.chapter) coveredChapters.add(stage.chapter);
  return stage.level;
};
const chapterName = async () => {
  const chapter = await evaluate(`document.querySelector('#stage').dataset.chapter`);
  if (chapter) coveredChapters.add(chapter);
  return chapter;
};
/** Which kind is playing. */
const kindName = async () => {
  const kind = await evaluate(`document.querySelector('#stage').dataset.kind`);
  if (kind) coveredKinds.add(kind);
  return kind;
};
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

/**
 * Wait for the way onwards to arrive. It never arrives at once any more: every
 * level ends with a celebration, and the button comes up `WAY_OUT_MS` after the
 * level does - about the time a balloon takes to climb the board - so that the
 * pause between one puzzle and the next is a pause with something in it. The
 * default here is that wait with room to spare on a slow machine, and it is
 * *not* a measurement: what the run checks about the pause it checks by asking
 * for the button before the wait is over. See WAY_OUT_MS in src/celebrate.ts.
 */
async function waitForFinishButton(within = 9000) {
  const deadline = Date.now() + within;
  while (Date.now() < deadline) {
    if ((await finishButtons()) > 0) return true;
    await sleep(100);
  }
  return false;
}

/** Press the big button that ends a level, then wait for the next board. */
async function pressFinishButton() {
  if (!(await waitForFinishButton())) throw new Error("The way onwards did not arrive.");
  const before = await levelNumber();
  await evaluate(`document.querySelector('#stage .fx [role="button"]').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )`);
  const after = await waitForDifferentLevel(before, 5000);
  if (after === before) throw new Error(`The way onwards left the game on level ${before}.`);
}

// --- celebrations, and what a finger can land on ---------------------------

/**
 * Everything a finger could actually land on, and where to land on it. A thing
 * is only counted while most of it is inside the board - a balloon on its way
 * in from below the bottom edge is not something a child can touch yet, so
 * counting it would let a nearly empty sky pass for a full one - and the point
 * returned is the middle of the part that *is* on the board.
 *
 * The scope is a parameter because the same question is asked of every kind of
 * celebration, and of the finale's bare sky. All of them are the same promise -
 * something is there and it answers.
 */
const thingsToTouch = (scope = "#stage .celebration") =>
  evaluate(`
  (() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const things = [];
    for (const el of document.querySelectorAll('${scope} [data-touch]')) {
      const r = el.getBoundingClientRect();
      const left = Math.max(r.x, stage.x);
      const right = Math.min(r.right, stage.right);
      const top = Math.max(r.y, stage.y);
      const bottom = Math.min(r.bottom, stage.bottom);
      if (right <= left || bottom <= top) continue;
      const shown = ((right - left) * (bottom - top)) / (r.width * r.height);
      if (shown < 0.7) continue;
      // What a finger could land on, not merely what is drawn. The button
      // onwards sits above the celebration, so a balloon that drifts behind it
      // genuinely cannot be popped - and a run that aimed there would press the
      // button and take the level away instead, which is how this was found.
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (hit && hit.closest('[role="button"]')) continue;
      things.push({
        touch: el.dataset.touch,
        x: (left + right) / 2,
        y: (top + bottom) / 2,
        width: right - left,
        height: bottom - top,
        size: Math.max(r.width, r.height),
        shown,
      });
    }
    return things;
  })()
`);

// --- celebrations -----------------------------------------------------------
// Every level ends with one. Twenty-five of them end with an interlude - paper,
// balloons, beach balls, ribbon - and the five that end a chapter end with
// something bigger, because six levels finishing is a bigger moment than one.
// All of them are played rather than watched: a two-year-old will not sit
// through a cutscene, they will put a finger on it. What this run is really
// checking is that none of it is a trap at either end - the way onwards always
// arrives, and things keep arriving for a child who has popped the lot. See
// src/celebration.ts.

/** Which celebration is on screen, or "" if the level is not finished. */
const celebrationName = async () => {
  const name = await evaluate(
    `document.querySelector('#stage .celebration')?.dataset.celebration ?? ''`,
  );
  if (name) coveredCelebrations.add(name);
  return name;
};

/** How many things the child has made answer, counted across a rotation. */
const celebrationPlayed = () =>
  evaluate(`Number(document.querySelector('#stage .celebration')?.dataset.played ?? -1)`);

/** What a finger could land on in the celebration itself. */
const celebrationThings = () => thingsToTouch("#stage .celebration");

/** Who is walking in the parade, by piece id. */
const paradingPieces = () =>
  evaluate(
    `[...document.querySelectorAll('#stage .celebration [data-piece]')].map((el) => el.dataset.piece)`,
  );

/** How many things the celebration has added to the board, for the rule above. */
const parading = async () => (await paradingPieces()).length;

/** How much of the rainbow is up. */
const rainbowArcs = () =>
  evaluate(`document.querySelectorAll('#stage .celebration .rainbow-arc').length`);

/** Whether night has fallen over the finished picture, for the fireworks. */
const nightHasFallen = () =>
  evaluate(`
  (() => {
    const night = document.querySelector('#stage .celebration .night');
    if (!night) return false;
    return Number(getComputedStyle(night).opacity) > 0.3;
  })()
`);

/**
 * What a finger could land on in the celebration itself, waiting a moment for
 * something to arrive. A celebration is allowed a tick with a thin sky - a
 * balloon leaves the top the instant before its replacement clears the bottom -
 * but not a second of an empty one, which is why the wait is short.
 */
async function somethingToTouch(within = 1200) {
  const deadline = Date.now() + within;
  for (;;) {
    const things = await celebrationThings();
    if (things.length > 0) return things;
    if (Date.now() >= deadline) {
      // An empty sky is a real failure, and a rare one, so say enough about it
      // to diagnose from a log rather than from a guess.
      console.log("EMPTY SKY", JSON.stringify(await celebrationReport()));
      return things;
    }
    await sleep(100);
  }
}

/** Everything worth knowing about a celebration that has stopped offering. */
const celebrationReport = () =>
  evaluate(`
  (() => {
    const layer = document.querySelector('#stage .celebration');
    const stage = document.querySelector('#stage').getBoundingClientRect();
    return {
      level: document.querySelector('#stage')?.dataset.level ?? null,
      celebration: layer?.dataset.celebration ?? null,
      played: layer?.dataset.played ?? null,
      children: layer ? layer.childElementCount : -1,
      stage: [Math.round(stage.x), Math.round(stage.y), Math.round(stage.width), Math.round(stage.height)],
      things: [...(layer?.querySelectorAll('[data-touch]') ?? [])].map((el) => {
        const r = el.getBoundingClientRect();
        return [el.dataset.touch, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      }),
    };
  })()
`);

/**
 * Tap the things a celebration is offering, one at a time, and report what
 * answered. Every tap is on something that was on screen when it was aimed at,
 * so a tap that does not register is the celebration failing to answer a finger.
 */
async function playCelebration(taps) {
  let answered = 0;
  let missed = 0;
  const startedOn = await levelNumber();
  for (let tap = 0; tap < taps; tap++) {
    if ((await levelNumber()) !== startedOn) {
      throw new Error(`Playing the celebration moved the game off level ${startedOn}.`);
    }
    const things = await somethingToTouch();
    if (things.length === 0) throw new Error("The celebration has nothing to touch.");
    const thing = things[tap % things.length];
    const before = await celebrationPlayed();
    await tapAt(thing.x, thing.y);
    const after = await celebrationPlayed();
    if (after > before) answered++;
    else missed++;
  }
  return { answered, missed };
}

/**
 * A point on the board with nothing on it: no thing to touch, no button. A
 * touch there must do nothing whatever - not a wobble, not a warning - so the
 * run needs somewhere it is certain nothing lives.
 */
const emptySpotOnBoard = () =>
  evaluate(`
  (() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    for (let fy = 0.1; fy <= 0.9; fy += 0.1) {
      for (let fx = 0.1; fx <= 0.9; fx += 0.1) {
        const x = stage.x + fx * stage.width;
        const y = stage.y + fy * stage.height;
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit.closest('[data-touch], [role="button"], .piece')) continue;
        return { x, y };
      }
    }
    return null;
  })()
`);

/** A tap, the way a small hand makes one: down and up in the same place. */
async function tapAt(x, y) {
  await mouse("mousePressed", x, y);
  await mouse("mouseReleased", x, y);
  await sleep(160);
}

/**
 * Deal this level again, by pressing the child's own reset button. It is the
 * child's own way of starting a board over, and it is also how this run gets a
 * board it knows the age of: everything a fresh deal puts on screen arrives
 * after the press rather than before it.
 */
async function dealAgain() {
  await evaluate(`(window.__shotPreviousStage = document.querySelector('#stage')) !== null`);
  await holdResetButton();
  const rebuilt = await waitUntil(
    () => evaluate(`document.querySelector('#stage') !== window.__shotPreviousStage`),
    Boolean,
    5000,
  );
  if (!rebuilt) throw new Error("Starting a fresh puzzle did not rebuild the board.");
}

/** The button in the corner, which is held rather than tapped. */
const RESET_BUTTON = ".reset-button";

/** Press and release it the way a small hand would: nothing should happen. */
async function tapResetButton() {
  const at = await centreOf(RESET_BUTTON);
  if (!at) throw new Error("No reset button on screen.");
  await mouse("mousePressed", at.x, at.y);
  await sleep(70);
  await mouse("mouseReleased", at.x, at.y);
  await sleep(180);
}

/** Hold it the way a grown-up watching the ring fill would. */
async function holdResetButton({ pauseAtHalfway } = {}) {
  const at = await centreOf(RESET_BUTTON);
  if (!at) throw new Error("No reset button on screen.");
  await mouse("mousePressed", at.x, at.y);
  await sleep(1100);
  if (pauseAtHalfway) await pauseAtHalfway();
  await sleep(1300);
  await mouse("mouseReleased", at.x, at.y);
  await sleep(200);
}

/** How full the ring round the reset button is, 0 to 1. */
const resetRingFill = () =>
  evaluate(
    `Number((document.querySelector('.reset-ring')?.getAttribute('stroke-dasharray') ?? '0 1').split(' ')[0])`,
  );

/**
 * A stamp on the board that a re-deal wipes off, since `buildBoard` replaces
 * everything inside `#app`. Cheaper and more direct than comparing line-ups:
 * the question is only whether this board is the board that was there before.
 */
const markTheBoard = () =>
  evaluate(`(document.querySelector('#stage').dataset.mark = 'same') === 'same'`);
const boardIsTheSameOne = () =>
  evaluate(`document.querySelector('#stage')?.dataset.mark === 'same'`);

// --- the grown-up panel ---------------------------------------------------
// The one part of the game that is not for the child, and the only place
// progress can be cleared. It is opened by holding a labelled button for two
// seconds; tapping it, however often, must never get in. See src/hold.ts.

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

/**
 * How many rows of squares each chapter's strip of the map is laid out over,
 * measured from rendered positions. A chapter is meant to read as one line of
 * the ramp, so anything but 1 means the squares no longer fit the panel.
 */
const chapterRowCounts = () =>
  evaluate(`
  (() => {
    const strips = [...document.querySelectorAll('.grownups-chapter-levels')];
    return strips.map((strip) => {
      const tops = [...strip.querySelectorAll('.grownups-level')].map(
        (square) => Math.round(square.getBoundingClientRect().top),
      );
      return new Set(tops).size;
    });
  })()
`);

const soundIsOn = () =>
  evaluate(
    `document.querySelector('.grownups-switch[data-setting="sound"]').getAttribute('aria-checked') === 'true'`,
  );

/** How many squares the map is showing as stepped over, because their kind is off. */
const skippedSquares = () =>
  evaluate(`document.querySelectorAll('.grownups-level.is-skipped').length`);

const kindIsOn = (kind) =>
  evaluate(
    `document.querySelector('.grownups-switch[data-kind="${kind}"]').getAttribute('aria-checked') === 'true'`,
  );

/** Whether a kind's switch is the last one on, and so refuses to be moved. */
const kindIsHeldOn = (kind) =>
  evaluate(`document.querySelector('.grownups-switch[data-kind="${kind}"]').disabled === true`);

/**
 * Every option the panel offers, by the label a grown-up reads. A switch that
 * does nothing is worse than no switch at all, so the panel is checked rather
 * than assumed.
 */
const panelOptions = () =>
  evaluate(`[...document.querySelectorAll('.grownups-option-label')].map((el) => el.textContent)`);

/**
 * What each option says about itself. A note that admits the switch above it
 * does nothing yet is the same failure as a switch that does nothing at all, so
 * the admission is checked for rather than trusted to be removed by hand.
 */
const panelNotes = () =>
  evaluate(`[...document.querySelectorAll('.grownups-option-note')].map((el) => el.textContent)`);

/** The record as it actually sits in storage, which is what a reload will read. */
const savedRecord = () =>
  evaluate(`JSON.parse(window.localStorage.getItem('animal-puzzle') ?? 'null')`);

/** A click on something inside the panel, scrolled into view first. */
async function pressInPanel(selector) {
  await evaluate(
    `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`,
  );
  await nextFrame();
  const at = await centreOf(selector);
  if (!at) throw new Error(`Nothing to press at "${selector}".`);
  await mouse("mousePressed", at.x, at.y);
  await mouse("mouseReleased", at.x, at.y);
  await nextFrame();
}

/**
 * Watch the long timers the page arms from now on, and how long each is for.
 * The prompt that answers a tap is taken down on a timer of its own, and a
 * toddler taps far faster than it expires, so the interesting question is
 * whether the tenth tap leaves ten timers pending or one each. Only long timers
 * are counted, which leaves the two-second one that arms the opening out of it.
 *
 * Two things arm one: "Hold to open" (`PROMPT_MS` in src/hold.ts) and the
 * wait before the page puts itself to sleep (`REST_DELAY_MS` in src/rest.ts),
 * which every tap re-arms. Reporting the delays rather than a bare count is
 * what makes a third one show up as itself rather than as an off-by-one.
 */
const watchLongTimers = () =>
  evaluate(`
  (() => {
    const armed = new Map();
    const setLater = window.setTimeout.bind(window);
    const clearLater = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms, ...rest) => {
      let id;
      id = setLater((...args) => { armed.delete(id); fn(...args); }, ms, ...rest);
      if (ms > 3000) armed.set(id, ms);
      return id;
    };
    window.clearTimeout = (id) => { armed.delete(id); clearLater(id); };
    window.__longTimers = () => [...armed.values()].sort((a, b) => a - b);
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
  await nextFrame();
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
  await nextFrame();
}

/**
 * Start at a given level. `?level=` exists for this script and for whoever is
 * working on the game, and is not a difficulty picker: nothing in the game
 * offers it, and the player cannot read.
 *
 * `restAfter` is the same sort of tool: seconds of nobody playing before the
 * page freezes itself, instead of the two minutes a child gets. Without it this
 * run could not watch the game go to sleep at all.
 */
let navigation = 0;

async function waitForNavigation(token, wanted, within = 5000) {
  const arrived = await waitUntil(
    () =>
      evaluate(`(() => {
        const stage = document.querySelector('#stage');
        return {
          token: new URLSearchParams(location.search).get('shot'),
          level: stage ? Number(stage.dataset.level) : 0,
          controls: !!document.querySelector('.grownups-key'),
          ready: document.readyState === 'complete'
        };
      })()`),
    (state) =>
      state.ready &&
      state.controls &&
      state.token === String(token) &&
      (!wanted || state.level === wanted),
    within,
  );
  if (
    !arrived.ready ||
    !arrived.controls ||
    arrived.token !== String(token) ||
    (wanted && arrived.level !== wanted)
  ) {
    throw new Error(
      wanted
        ? `Navigation did not build level ${wanted} (level ${arrived.level}).`
        : "Navigation did not build a board.",
    );
  }
}

async function goToLevel(level, { restAfter } = {}) {
  const rest = restAfter === undefined ? "" : `&rest=${restAfter}`;
  const token = ++navigation;
  await send("Page.navigate", {
    url: `http://127.0.0.1:${PORT}/?level=${level}&seed=${SEED}${rest}&shot=${token}`,
  });
  await waitForNavigation(token, level);
}

/** Reload the way a child's grown-up would open it: no level in the URL. */
async function reopenTheGame() {
  const token = ++navigation;
  await send("Page.navigate", {
    url: `http://127.0.0.1:${PORT}/?seed=${SEED}&shot=${token}`,
  });
  await waitForNavigation(token);
}

// --- the network, taken away ----------------------------------------------
// The game is split into a chunk per chapter, so two things have to be true
// that are invisible on a fast connection: once the warm has finished nothing
// more is fetched, and a chunk that has not arrived leaves the board alone
// rather than blanking it. Neither happens by accident, so both are staged.

/** Cut the connection, or give it back. */
const setOffline = (offline) =>
  send("Network.emulateNetworkConditions", {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
  });

/**
 * How many things the page has fetched since it loaded, counted by the page
 * itself. `PerformanceObserver` would need installing before the fetches it is
 * meant to see; the resource timeline is already there and remembers them.
 */
const resourceCount = () => evaluate(`performance.getEntriesByType('resource').length`);

/** Is there a board at all? The question a blank screen would answer "no" to. */
const stageIsThere = () => evaluate(`!!document.querySelector('#stage')`);

/**
 * Anything that would tell a child to wait. There is deliberately nothing in
 * the game that does - a board to touch beats a spinner - so this is a check
 * that one has not crept in as a way of covering a slow chunk.
 */
const spinnerCount = () =>
  evaluate(`document.querySelectorAll('.spinner, .loading, [aria-busy="true"]').length`);

/** Wait for the board to become a given level, or give up and say what it is. */
async function waitForLevel(wanted, within) {
  return waitUntil(levelNumber, (level) => level === wanted, within, 100);
}

async function waitForDifferentLevel(previous, within) {
  return waitUntil(levelNumber, (level) => level !== previous, within, 50);
}

async function waitUntil(read, accepts, within, every = 50) {
  const until = Date.now() + within;
  let value = await read();
  while (!accepts(value) && Date.now() < until) {
    await sleep(every);
    value = await read();
  }
  return value;
}

const nextFrame = () =>
  evaluate(`new Promise((resolve) => requestAnimationFrame(() => resolve(true)))`);

/** Go to a level the way a grown-up does, without reloading the page. */
async function jumpToLevelFromPanel(level, { waitForArrival = true } = {}) {
  await holdGrownUps();
  await pressInPanel(`.grownups-level[data-level="${level}"]`);
  if (!waitForArrival) return;
  const arrived = await waitForLevel(level, 5000);
  if (arrived !== level) throw new Error(`The grown-up panel did not reach level ${level}.`);
}

async function waitForLayout(wanted, within = 3000) {
  const arrived = await waitUntil(layoutName, (layout) => layout === wanted, within);
  if (arrived !== wanted) throw new Error(`The board did not switch to the ${wanted} layout.`);
}

async function waitForResourcesToSettle(within = 5000, quietFor = 750) {
  const deadline = Date.now() + within;
  let previous = await resourceCount();
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await sleep(100);
    const current = await resourceCount();
    if (current !== previous) {
      previous = current;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietFor) {
      return current;
    }
  }
  throw new Error("The production chunks did not finish warming.");
}

/** A tap on a part of the board with nothing on it: the smallest interaction. */
async function tapEmptySpot() {
  const spot = await emptySpotOnBoard();
  if (!spot) throw new Error("Nowhere empty on the board to tap.");
  await tapAt(spot.x, spot.y);
}

// --- the game asleep ------------------------------------------------------
// Two quiet minutes and the page stops drawing altogether: every animation
// paused where it stood, every repeating timer stopped, the speakers put down.
// The first touch undoes all of it, and does whatever it was going to do as
// well. Only a real browser can show any of that, so it is checked here.
// `?rest=` shortens the two minutes so the run does not have to sit through
// them. See src/rest.ts.

/** Whether the page has frozen itself. */
const isAsleep = () => evaluate(`document.documentElement.dataset.asleep === 'true'`);

/**
 * How many animations are actually running. This is the number the whole thing
 * is about: a sleeping game has to be at zero, and a woken one above it.
 */
const runningAnimations = () =>
  evaluate(`document.getAnimations().filter((a) => a.playState === 'running').length`);

/**
 * How many running animations are drawing something that is no longer on the
 * page. Waking a board that was rebuilt while it slept is where these would
 * come from, and a board nobody can see is the one thing worse than a board
 * that moves when it should be still.
 */
const orphanAnimations = () =>
  evaluate(`
  document
    .getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.target && !a.effect.target.isConnected)
    .length
`);

/**
 * What the game's own `AudioContext` is doing, once `stageRefusedResume` below
 * has caught hold of it, or null before then.
 */
const speakerState = () => evaluate(`window.__speakers ? window.__speakers.state : null`);

/**
 * Make the page's speakers able to refuse to get up, the way a browser that
 * wants a gesture does. No browser can be asked for a refusal on demand, so it
 * is staged: `resume` is wrapped so that `window.__refuse` decides the answer,
 * and both it and `suspend` hand back the context they were called on so the
 * checks can read its state. Wrapping the prototype catches the game's context
 * whether it was built at load or by the first touch.
 */
const stageRefusedResume = () =>
  evaluate(`
  (() => {
    const proto = window.AudioContext.prototype;
    const resume = proto.resume;
    const suspend = proto.suspend;
    window.__refuse = false;
    window.__speakers = null;
    proto.resume = function () {
      window.__speakers = this;
      return window.__refuse
        ? Promise.reject(new Error('a gesture, please'))
        : resume.call(this);
    };
    proto.suspend = function () {
      window.__speakers = this;
      return suspend.call(this);
    };
    return true;
  })()
`);

/** Whether the staged speakers say no to the next `resume`. */
const refuseResume = (refuse) => evaluate(`(window.__refuse = ${refuse ? "true" : "false"})`);

/** Drag every animal still in the tray into its hole. */
async function solveRemaining() {
  for (const animal of await unplacedAnimals()) await dragAnimal(animal);
  await waitUntil(
    async () => ({ celebration: await celebrationName(), buttons: await finishButtons() }),
    ({ celebration, buttons }) => celebration !== "" || buttons > 0,
    5000,
  );
}

/**
 * Two pieces on the board that are the same shape as each other, or null.
 *
 * Worked out from what they draw rather than from what they are called: a fish
 * has two fins with the same name, one pointing up and one down, which are not
 * interchangeable at all. Two paths are the same shape when they match once the
 * first point of each is taken as its origin - the arcs of a circle are already
 * relative, so they compare as they stand.
 */
/**
 * A snippet, not a function: the page needs this inside each `evaluate`, and two
 * copies of a shape-comparison rule would be two chances to compare differently.
 *
 * Two paths are the same shape when they match once the first point of each is
 * taken as its origin - the arcs of a circle are already relative, so they
 * compare as they stand. Names are no help: a fish has two fins called the same
 * thing, one pointing up and one down, which are not interchangeable at all.
 */
const SHAPE_KEY = `
    const key = (d) => {
      const tokens = d.match(/[A-Za-z]|-?[\\d.]+/g) ?? [];
      const out = [];
      let cmd = '';
      let ox = null;
      let oy = null;
      for (let i = 0; i < tokens.length; ) {
        const token = tokens[i];
        if (/[A-Za-z]/.test(token)) { cmd = token; out.push(token); i++; continue; }
        if (cmd === 'M' || cmd === 'L') {
          const x = Number(tokens[i]);
          const y = Number(tokens[i + 1]);
          if (ox === null) { ox = x; oy = y; }
          out.push((x - ox).toFixed(2), (y - oy).toFixed(2));
          i += 2;
          continue;
        }
        out.push(token);
        i++;
      }
      return out.join(' ');
    };
`;

const twinShapes = () =>
  evaluate(`
  (() => {
${SHAPE_KEY}
    const groups = new Map();
    for (const piece of document.querySelectorAll('.piece')) {
      const path = piece.querySelector('.art > path');
      if (!path) continue;
      const shape = key(path.getAttribute('d'));
      groups.set(shape, [...(groups.get(shape) ?? []), piece.dataset.piece]);
    }
    for (const ids of groups.values()) if (ids.length > 1) return ids.slice(0, 2);
    return null;
  })()
`);

/** Which piece each shadow on the board is waiting for, in document order. */
const shadowOwners = () =>
  evaluate(`[...document.querySelectorAll('.hole')].map((hole) => hole.dataset.piece)`);

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

const checks = [];
const check = (label, ok) => {
  checks.push({ label, ok });
};

async function runOpening() {
  // The cast is dealt at random; a seed keeps the screenshots comparable
  // between runs. Randomness itself is checked at the end. The Chrome profile
  // is thrown away each run, so this is a child who has never played.
  await reopenTheGame();

  const bootError = await evaluate(`document.querySelector('#stage') ? '' : 'stage missing'`);
  check("app boots and renders the stage", bootError === "");

  // --- level 1: the first drag ---------------------------------------------
  // The game opens on the smallest drag it can ask for: one huge animal, one
  // huge hole, the most forgiving snap in the table. The first win is meant to
  // arrive in the first few seconds, before a child has to learn anything at
  // all. See the first row of the table in src/levels.ts.
  check("a new player starts on level 1", (await levelNumber()) === 1);
  check("level 1 is in the first chapter", (await chapterName()) === "animals");
  check("level 1 is dragged", (await kindName()) === "shape-match");
  const firstCount = await pieceCount();
  check(`level 1 is a single huge piece (${firstCount})`, firstCount === 1);
  check("the one piece has a hole of its own", (await holeCount()) === 1);
  check("nothing starts on the board", (await placedCount()) === 0);
  const dots = await chapterDots();
  check(
    `five chapter dots, one filled (${dots.filled} of ${dots.total})`,
    dots.total === 5 && dots.filled === 1,
  );

  // The one thing on the board is a whole hand's worth: it is more than a
  // tenth of the board across, which is the floor every target in the game is
  // held to.
  const stage = await evaluate(`document.querySelector('#stage').getBoundingClientRect().width`);
  const opening = await evaluate(`
    (() => {
      const box = document.querySelector('.piece .grab-box').getBoundingClientRect();
      return Math.max(box.width, box.height);
    })()
  `);
  check(
    `the first piece is big enough to grab (${((opening / stage) * 100).toFixed(0)}% of the board)`,
    opening / stage >= 0.1,
  );
  await checkGrabBoxes(1);
  await shot("01-level1-start");

  // There is no way to be wrong here either: a touch that lands on nothing does
  // nothing at all, and there is only one hole to aim at.
  const nowhere = await emptySpotOnBoard();
  check("there is empty board to touch", nowhere !== null);
  if (nowhere) {
    await tapAt(nowhere.x, nowhere.y);
    check("touching nothing does nothing", (await placedCount()) === 0);
  }

  await dragAnimal((await animalsOnBoard())[0], { pauseAtHalfway: () => shot("02-level1-drag") });
  check("dragged piece snapped into its hole", (await placedCount()) === 1);
  await waitUntil(celebrationName, (name) => name !== "", 5000);
  check("level 1 can be completed", (await placedCount()) === firstCount);

  // --- the interlude after level 1: balloons --------------------------------
  // Every level ends with a celebration, and the first one a child ever sees is
  // the balloons. It has to be *played*: a two-year-old will not sit through a
  // cutscene, they will put a finger on it.
  const firstInterlude = await celebrationName();
  check(`level 1 ends with an interlude (${firstInterlude})`, firstInterlude === "balloons");
  check("the celebration starts with nothing played with", (await celebrationPlayed()) === 0);
  // The beat. By level 25 the big yellow button is the most conditioned thing on
  // the screen, so a celebration arrives before it does - and for that first
  // moment the only thing on offer is something to play with.
  check("the celebration has the screen to itself first", (await finishButtons()) === 0);
  const openingBalloons = await celebrationThings();
  check(
    `there is already something to pop in that first moment (${openingBalloons.length})`,
    openingBalloons.length >= 4,
  );
  await shot("03-level1-first-instant");
  // Popping works before the way out has arrived, or the beat would be a wait.
  const early = await playCelebration(1);
  check("the first instant already answers a finger", early.answered === 1);

  check(
    "the way onwards arrives on its own",
    (await waitForFinishButton()) === true && (await finishButtons()) === 1,
  );
  check("the first level offers the next puzzle", (await finishLabel()) === "Next puzzle");

  const balloons = await celebrationThings();
  check(`balloons are up to be popped (${balloons.length})`, balloons.length >= 4);
  const boardWidth = await evaluate(
    `document.querySelector('#stage').getBoundingClientRect().width`,
  );
  const narrowest = Math.min(...balloons.map((thing) => thing.width)) / boardWidth;
  check(
    `every balloon is a big target (${(narrowest * 100).toFixed(1)}% of the board)`,
    narrowest >= 0.1,
  );
  // The way onwards is up for the whole of the party after that one beat. A
  // child who pops everything in four seconds is never left with an empty
  // screen and no way out.
  check("the way onwards is up during the celebration", (await finishButtons()) === 1);
  await shot("04-level1-balloons");

  const bang = await playCelebration(5);
  check(`every balloon touched popped (${bang.missed} missed)`, bang.missed === 0);
  const burst = early.answered + bang.answered;
  check(`popping is counted (${burst})`, (await celebrationPlayed()) === burst);
  // Long enough for a replacement to have climbed into reach, and no longer:
  // the sky a child is looking at a second after popping the lot has to have
  // something in it.
  await sleep(2000);
  const topUp = await celebrationThings();
  check(`the sky fills itself back up (${topUp.length})`, topUp.length >= 4);
  // And goes on having something in it. Seven balloons released together reach
  // the top together, so a replacement that only starts when one leaves opens a
  // hole of a second or two - which is what a child who looked away would come
  // back to. Watched across a stretch rather than sampled once, because that
  // hole is exactly the kind of thing a single sample walks straight past.
  let thinnestSky = Infinity;
  for (let look = 0; look < 24; look++) {
    thinnestSky = Math.min(thinnestSky, (await celebrationThings()).length);
    await sleep(250);
  }
  check(`the sky is never empty while the party runs (${thinnestSky} at worst)`, thinnestSky >= 2);
  check("the celebration never takes the level away", (await levelNumber()) === 1);
  check("the way onwards is still there after playing", (await finishButtons()) === 1);
  await shot("05-level1-balloons-popped");

  // A celebration is drawn under the effects layer for exactly one reason: a
  // balloon must never float over the button out.
  const buttonIsReachable = await evaluate(`
    (() => {
      const button = document.querySelector('#stage .fx [role="button"]');
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit?.closest('[role="button"]');
    })()
  `);
  check("nothing floats over the button out", buttonIsReachable === true);

  // Turning the tablet mid-party keeps what has been played with, because it is
  // counted outside the board that gets rebuilt.
  const playedBeforeTurn = await celebrationPlayed();
  await setViewport(900, 1300);
  await waitForLayout("portrait");
  check("the celebration survives a rotation", (await celebrationName()) === "balloons");
  check("a rotation keeps what was played with", (await celebrationPlayed()) === playedBeforeTurn);
  check("a rotation keeps the way onwards", (await finishButtons()) === 1);
  await setViewport(1280, 800);
  await waitForLayout("landscape");

  // --- level 2: two animals, and a drop that must not stick -----------------
  await pressFinishButton();
  check("moves on to level 2", (await levelNumber()) === 2);

  // The button in the corner throws away the puzzle the child is part way
  // through, so it is held rather than tapped, exactly like the "Grown-ups"
  // button (src/hold.ts). A hand resting on the corner of the screen must not
  // be able to take the animals away, and the ring is the only thing that says
  // a press is being counted - there is no wording for a child who cannot read.
  await markTheBoard();
  for (let tap = 0; tap < 6; tap++) await tapResetButton();
  check("tapping the reset button, over and over, deals nothing", await boardIsTheSameOne());
  check("the ring is empty once the button is let go", (await resetRingFill()) === 0);
  let ringHalfway = 0;
  await holdResetButton({ pauseAtHalfway: async () => (ringHalfway = await resetRingFill()) });
  check(
    `the ring fills as the button is held (${(ringHalfway * 100).toFixed(0)}% halfway through)`,
    ringHalfway > 0.3 && ringHalfway < 1,
  );
  check("holding the reset button deals the level again", (await boardIsTheSameOne()) === false);
  check("a re-deal stays on the same level", (await levelNumber()) === 2);

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
  await shot("06-after-wrong-drop");

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
  const secondInterlude = await celebrationName();
  check(`level 2 ends with its own interlude (${secondInterlude})`, secondInterlude !== "");
  await shot("07-level2-interlude");
  // The interlude a level ends into is rotated by level number, so no two
  // levels in a row rest the same way.
  check(
    `two levels, two different interludes (${firstInterlude}, ${secondInterlude})`,
    firstInterlude !== secondInterlude,
  );
  // An interlude is weather rather than an event, but it is still played rather
  // than watched: a finger on it has to do something, or the twenty-five levels
  // that end in one have a screen the child is locked out of for four seconds.
  const playedInterlude = await playCelebration(3);
  check(
    `the interlude answers a finger (${playedInterlude.missed} missed)`,
    playedInterlude.missed === 0,
  );
  check("and playing it does not move the game on", (await levelNumber()) === 2);

  // --- coming back to it tomorrow ------------------------------------------
  // The level being played is remembered, and reopening the game starts there.
  // This is the only place that path is exercised end to end: a real browser,
  // a real reload, a real localStorage.
  await pressFinishButton();
  check("moves on to level 3", (await levelNumber()) === 3);
  await reopenTheGame();
  check("reopening the game resumes where the child stopped", (await levelNumber()) === 3);
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
  // One wait each, re-armed rather than piled up: the prompt coming down, and
  // the page's own wait before it goes to sleep. Ten taps that left ten of
  // either behind would be a leak.
  check(
    `ten taps leave one wait each behind, not ten (${pending.join("ms, ")}ms)`,
    pending.length === 2 && new Set(pending).size === 2,
  );
  await stopWatchingTimers();

  await holdGrownUps({ pauseAtHalfway: () => shot("08-grownups-hold") });
  check("holding the button opens the panel", (await panelIsOpen()) === true);
  const map = await levelSquares();
  check(`the level map shows all thirty levels (${map.total})`, map.total === 30);
  check(`the map marks the three levels played (${map.reached})`, map.reached === 3);
  check("the map marks the level being played", map.current === 3);
  const chapterRows = await chapterRowCounts();
  check(
    `each chapter is one row of squares (${chapterRows.join(", ")})`,
    chapterRows.length === 5 && chapterRows.every((rows) => rows === 1),
  );
  const options = await panelOptions();
  check(
    `the panel offers exactly the options that do something (${options.join(", ")})`,
    JSON.stringify(options) ===
      JSON.stringify([
        "Sound",
        "Whole animals",
        "Sliced animals",
        "Shape pictures",
        "Jigsaws",
        "Shattered pictures",
        "Start again",
      ]),
  );
  const unfulfilled = (await panelNotes()).filter((note) =>
    /not in play|coming soon|not yet|does nothing/i.test(note),
  );
  check(
    `no option admits to doing nothing (${unfulfilled.join(" / ") || "none does"})`,
    unfulfilled.length === 0,
  );
  await shot("09-grownups-panel");

  // A level chosen here moves the child; it does not claim they got there.
  await pressInPanel('.grownups-level[data-level="12"]');
  check("choosing a level closes the panel", (await panelIsOpen()) === false);
  check("choosing a level deals it", (await levelNumber()) === 12);
  check("a chosen level starts empty", (await placedCount()) === 0);
  const afterJump = await savedRecord();
  check("a chosen level is remembered", afterJump?.level === 12);
  check(`reading the map does not fill it in (${afterJump?.furthest})`, afterJump?.furthest === 3);

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

  // Five switches, one per kind of puzzle, so a grown-up can fit the thirty
  // levels to the child in front of them. A kind switched off is stepped over
  // wherever it sits, and the last one on cannot be turned off - there has to
  // be a game left. See src/grownups.ts.
  check("every kind starts in play", (await skippedSquares()) === 0);
  await pressInPanel('.grownups-switch[data-kind="shatter"]');
  check("a kind can be switched off", (await kindIsOn("shatter")) === false);
  const skipped = await skippedSquares();
  check(`the map fades the levels being skipped (${skipped})`, skipped === 3);
  check(
    "a kind switched off is remembered",
    (await savedRecord())?.settings?.kinds?.shatter === false,
  );

  // Switching the kind out from under the child moves them on rather than
  // leaving them on a level their grown-up has just said no to.
  check("the child is on level 1 after the reset", (await levelNumber()) === 1);
  await pressInPanel('.grownups-switch[data-kind="shape-match"]');
  check("switching off the kind being played moves the child", (await levelNumber()) === 7);

  for (const kind of ["sliced", "polygon"]) {
    await pressInPanel(`.grownups-switch[data-kind="${kind}"]`);
  }
  check("the last kind left is held on", (await kindIsHeldOn("jigsaw")) === true);
  await pressInPanel('.grownups-switch[data-kind="jigsaw"]');
  check("and cannot be switched off", (await kindIsOn("jigsaw")) === true);
  await shot("09b-grownups-kinds");

  for (const kind of ["shape-match", "sliced", "polygon", "shatter"]) {
    await pressInPanel(`.grownups-switch[data-kind="${kind}"]`);
  }
  check("every kind can be put back", (await skippedSquares()) === 0);
  check("nothing is held on once there is a choice", (await kindIsHeldOn("jigsaw")) === false);

  // Back where the rest of this run expects the child to be.
  await pressInPanel('.grownups-level[data-level="6"]');
  check("a grown-up can put the child back", (await levelNumber()) === 6);
}

async function runRest() {
  await goToLevel(6);
  // --- the game asleep ------------------------------------------------------
  // Nothing on this screen moves while nobody is playing with it. `?rest=`
  // makes the two minutes a few seconds; everything else is the game as a child
  // would leave it. See src/rest.ts.

  await goToLevel(6, { restAfter: 7 });
  await waitUntil(isAsleep, (asleep) => asleep === true, 10_000);
  check("the game sleeps when nobody plays with it", (await isAsleep()) === true);
  const asleepOn6 = await runningAnimations();
  check(`nothing is left running on a sleeping board (${asleepOn6})`, asleepOn6 === 0);

  // Turning a tablet that is already asleep rebuilds the board for the new
  // shape, and the rebuilt board must arrive as still as the one it replaced.
  await setViewport(480, 900);
  await waitUntil(
    async () => ({
      layout: await layoutName(),
      asleep: await isAsleep(),
      running: await runningAnimations(),
    }),
    (state) => state.layout === "portrait" && state.asleep && state.running === 0,
    3000,
  );
  check("turning a sleeping tablet leaves it asleep", (await isAsleep()) === true);
  const turnedAsleep = await runningAnimations();
  check(`a board rebuilt while asleep stays still (${turnedAsleep} running)`, turnedAsleep === 0);
  await setViewport(1280, 800);
  await waitUntil(
    async () => ({
      layout: await layoutName(),
      asleep: await isAsleep(),
      running: await runningAnimations(),
    }),
    (state) => state.layout === "landscape" && state.asleep && state.running === 0,
    3000,
  );
  check("nothing has woken the board up", (await isAsleep()) === true);
  const turnedBack = await runningAnimations();
  check(`and turning it back leaves it still too (${turnedBack} running)`, turnedBack === 0);
  const boardOrphans = await orphanAnimations();
  check(
    `and nothing woke up on the board it replaced (${boardOrphans} off the page)`,
    boardOrphans === 0,
  );

  await tapEmptySpot();
  check("a touch wakes it", (await isAsleep()) === false);

  // A celebration is the busiest thing the game leaves running by itself, and
  // the likeliest thing of all for a tablet to be put down on: every balloon
  // hands its place on to the next one on a timer of its own, and the next one
  // climbs with an animation of its own. A sleeping party has to stop filling
  // its sky. Level 1 is one drag away from raising one.
  await goToLevel(1, { restAfter: 3 });
  await solveRemaining();
  check("finishing a level raises a celebration to sleep on", (await celebrationName()) !== "");
  const awakeParty = await runningAnimations();
  check(`the balloons are moving to begin with (${awakeParty})`, awakeParty > 0);
  await sleep(4200);
  check("a celebration left alone goes to sleep", (await isAsleep()) === true);
  const sleepingParty = await runningAnimations();
  check(`a sleeping party stands still (${sleepingParty} running)`, sleepingParty === 0);
  const skyAtOnce = (await celebrationThings()).length;
  await sleep(2500);
  const skyLater = (await celebrationThings()).length;
  check(`and stops arriving (${skyAtOnce} up, ${skyLater} a moment later)`, skyLater === skyAtOnce);

  // Waking has to do two things at once: the finger that wakes the page is the
  // finger that pops the balloon it landed on.
  const frozen = await celebrationThings();
  const poppedBefore = await celebrationPlayed();
  check("a sleeping party still has its balloons on it", frozen.length > 0);
  if (frozen[0]) await tapAt(frozen[0].x, frozen[0].y);
  check("a touch wakes the party", (await isAsleep()) === false);
  const wokenParty = await runningAnimations();
  check(`and the sky fills again (${wokenParty} running)`, wokenParty > 0);
  const orphans = await orphanAnimations();
  check(`and nothing woke up on the board it replaced (${orphans} off the page)`, orphans === 0);
  check(
    "and the touch that woke it popped the balloon it landed on",
    (await celebrationPlayed()) > poppedBefore,
  );
  // The pause before the way onwards is a wait in time somebody was there for.
  // A tablet put down during it must not have the button arrive behind the
  // freeze - fading up and pulsing on a page that is meant to be standing
  // still, and waiting there having been missed. So it is still to come when
  // the child gets back, and it comes.
  check("the way onwards did not arrive behind the freeze", (await finishButtons()) === 0);
  check("and it arrives once somebody is there", (await waitForFinishButton()) === true);

  // The speakers are the one thing here that can say no. A tab looked at again
  // wakes the page with no finger in it, and a browser is entitled to turn down
  // a `resume()` that came from nobody - which leaves the game silent, since a
  // suspended context swallows every sound played to it. So the refusal is
  // staged, and what has to be true is that the next touch asks again.
  await goToLevel(1, { restAfter: 2 });
  await stageRefusedResume();
  // On the piece rather than on the board: the speakers are woken by a sound
  // being played, and a tap that lands on nothing plays none. A piece picked up
  // and put straight back down is the smallest thing that does.
  const toLift = await centreOf(`.piece[data-piece="${(await animalsOnBoard())[0]}"]`);
  await tapAt(toLift.x, toLift.y);
  await sleep(3200);
  check("a sleeping board puts the speakers down", (await speakerState()) === "suspended");
  await refuseResume(true);
  await tapEmptySpot();
  check("a wake the speakers refuse still wakes the board", (await isAsleep()) === false);
  check(
    "but leaves them down rather than counting them up",
    (await speakerState()) === "suspended",
  );
  await refuseResume(false);
  await tapEmptySpot();
  await waitUntil(speakerState, (state) => state === "running", 2000);
  check("and the next touch asks them again", (await speakerState()) === "running");
}

async function runAnimals() {
  // --- levels 3 and 4: the other two interludes -----------------------------
  // Four interludes are rotated by level number, and the opening segment sees
  // the first two. The other two are picked up here, on the cheapest levels
  // that raise them, which is what keeps the coverage guard at the end of the
  // run satisfied by playing rather than by a detour.
  for (const level of [3, 4]) {
    await goToLevel(level);
    check(`jumps to level ${level}`, (await levelNumber()) === level);
    await solveRemaining();
    const interlude = await celebrationName();
    check(`level ${level} ends with its own interlude (${interlude})`, interlude !== "");
    const inIt = await celebrationThings();
    check(`and there is something in it to touch (${inIt.length})`, inIt.length >= 3);
  }

  // --- level 6: the busiest board of animals -------------------------------
  // `?level=` starts partway along the ramp. It is for this script and for
  // whoever is working on the game; nothing in the game offers it.
  await goToLevel(6);
  check("jumps to level 6", (await levelNumber()) === 6);
  check("level 6 is in the animals chapter", (await chapterName()) === "animals");
  const busyCast = await animalsOnBoard();
  check("level 6 deals six different animals", new Set(busyCast).size === 6);
  const busyDots = await chapterDots();
  check(`one chapter dot filled by level 6 (${busyDots.filled})`, busyDots.filled === 1);
  // Six smaller pieces: the grab boxes have to hold their shape at this size
  // too, where the tray leaves least room between them.
  await checkGrabBoxes(6);
  await shot("10-level6-start");

  await dragAnimal(busyCast[0]);
  await dragAnimal(busyCast[1]);
  check("the pieces snap into their holes", (await placedCount()) === 2);
  await shot("11-level6-two-placed");

  // Rotating mid-puzzle must reflow and keep progress.
  await setViewport(480, 900);
  await waitForLayout("portrait");
  check("switches to the portrait layout", (await layoutName()) === "portrait");
  check("rotation preserves placed pieces", (await placedCount()) === 2);
  check("rotation stays on the same level", (await levelNumber()) === 6);
  await shot("12-portrait-level6");

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
  // All of it, not most of it: the canvas is composed for the board's container,
  // which fills the window here, so the only thing left over is the half unit
  // the long side is rounded to.
  check(`portrait fills the screen (${(coverage * 100).toFixed(1)}%)`, coverage > 0.99);

  await solveRemaining();
  check("dragging works in the portrait layout", (await placedCount()) === 6);
  await shot("13-portrait-complete");

  // --- the end of chapter 1: a rainbow --------------------------------------
  // The first of the five chapter moments, and the one celebration the child
  // *makes*. A tap anywhere paints the next arc, and an arc arrives by itself
  // every second or two - so it draws itself for a child who is only watching,
  // and is painted by a child who is not. In portrait as it happens, which is
  // the point: a celebration is composed from the layout like everything else.
  check("finishing chapter 1 raises the rainbow", (await celebrationName()) === "rainbow");
  check("the rainbow has the screen to itself first", (await finishButtons()) === 0);
  // The rule the first chapter's celebration is chosen by: a celebration is
  // never made of what the board is made of, so a board of animals gets one with
  // no animal in it. See docs/decisions/A celebration is not made of the board.md.
  check("nothing on a board of animals is celebrated with more animals", (await parading()) === 0);
  const arcsAtFirst = await rainbowArcs();
  const skyOverAnimals = await celebrationThings();
  check(
    "the whole sky is the target",
    skyOverAnimals.some((thing) => thing.touch === "sky"),
  );
  await playCelebration(4);
  const arcsAfter = await rainbowArcs();
  check(`tapping paints arcs (${arcsAtFirst} to ${arcsAfter})`, arcsAfter > arcsAtFirst);
  await sleep(2200);
  const arcsAlone = await rainbowArcs();
  check(`an arc arrives even if nobody taps (${arcsAlone})`, arcsAlone > arcsAfter);
  check("the rainbow lets the way onwards through", (await waitForFinishButton()) === true);
  check("a middle level offers the next puzzle", (await finishLabel()) === "Next puzzle");
  await shot("13b-chapter1-rainbow");
}

async function runSliced() {
  // The opening segment has already exercised the real write and reload path.
  // This worker needs the same precondition in its fresh profile so the check
  // below can still ask whether a `?level=` visit leaves an existing place alone.
  await goToLevel(1);
  await evaluate(`localStorage.setItem('animal-puzzle', JSON.stringify({
    version: 1, level: 6, furthest: 6,
    settings: { sound: true }
  }))`);

  // --- a place the child had got to, left alone ----------------------------
  await setViewport(1280, 800);
  // A whole level has just been played from `?level=`, which is a tool for
  // working on the game rather than a way into it: the place the child had got
  // to is exactly where they left it.
  await reopenTheGame();
  check("a level played from ?level= leaves the saved level alone", (await levelNumber()) === 6);
  // --- level 11: one animal, arriving in four slices -----------------------
  // The chapter that asks for a picture rather than a match: four pieces, one
  // hole, and the hole stays visible underneath as the guide to what is being
  // built.
  await goToLevel(11);
  check("jumps to level 11", (await levelNumber()) === 11);
  check("the sliced kind plays its own levels", (await kindName()) === "sliced");
  const sliceCast = await animalsOnBoard();
  check("level 11 deals four slices", sliceCast.length === 4);
  check("four slices, one hole", (await holeCount()) === 1);
  check("every slice is a slice of the same animal", new Set(sliceCast.map(holeFor)).size === 1);
  await shot("14-level11-sliced");

  await dragAnimal(sliceCast[0]);
  await dragAnimal(sliceCast[1]);
  check("a slice settles into its animal's hole", (await placedCount()) === 2);
  await shot("15-level11-half-built");

  await solveRemaining();
  check("the animal can be put back together", (await placedCount()) === 4);
  // The cut edges are for a slice that is still loose. An assembled animal is
  // an animal, not an animal with a grid over it.
  const sliceEdges = await settledCutEdgesOn(".piece.is-placed", 4);
  check(
    `an assembled animal has no lines across it (${sliceEdges.drawn} edges faded)`,
    sliceEdges.drawn === 4 && sliceEdges.worst === 0,
  );
  const sliceClips = await cutClipsOn("#stage");
  check(
    `an assembled animal closes over its joins (${sliceClips.spread}/${sliceClips.drawn})`,
    sliceClips.drawn === 4 && sliceClips.spread === 4,
  );
  await shot("16-level11-assembled");
}

async function runPolygon() {
  // --- levels 13-18: a picture built out of plain shapes -------------------
  // The chapter where several pieces make one thing and each piece is still a
  // whole shape a child can name. Level 13 is three shapes; level 18 is six,
  // and is where the rule this chapter exists for is exercised: two shapes the
  // same fill either of their shadows.
  await goToLevel(13);
  check("jumps to level 13", (await levelNumber()) === 13);
  check("the polygon kind plays its own levels", (await kindName()) === "polygon");
  check("level 13 is in the shapes chapter", (await chapterName()) === "shapes");
  check("level 13 deals three shapes", (await pieceCount()) === 3);
  check("one shadow per shape", (await holeCount()) === 3);
  await shot("17-level13-shapes");
  await solveRemaining();
  check("a picture of three shapes can be built", (await placedCount()) === 3);
  await shot("18-level13-built");

  await goToLevel(18);
  check("jumps to level 18", (await levelNumber()) === 18);
  const shapeCast = await animalsOnBoard();
  check("level 18 deals six shapes", shapeCast.length === 6);
  check("six shapes, six shadows, one picture", (await holeCount()) === 6);
  check(
    "every shape belongs to the same picture",
    new Set(shapeCast.map((id) => id.split(":")[1])).size === 1,
  );
  await shot("19-level18-shapes");

  // Portrait as well, because a picture is one target with several pieces and
  // the tray is what holds it down: the orientation that stacks the tray is
  // where a scene would be squeezed if any of it were composed wrongly.
  await setViewport(480, 900);
  await waitForLayout("portrait");
  check("a picture composes in portrait too", (await layoutName()) === "portrait");
  check("portrait keeps all six shadows", (await holeCount()) === 6);
  await shot("20-level18-portrait");
  await setViewport(1280, 800);
  await waitForLayout("landscape");

  // Two shapes the same, and the child aims one of them at the other's shadow.
  // Being told "no" for a placement that is visibly right is the one thing this
  // must never do, so the piece is taken and the picture rearranges itself.
  const [oneShape, itsTwin] = (await twinShapes()) ?? [];
  check("a picture of six shapes has two the same in it", Boolean(oneShape && itsTwin));
  const twinShadow = await centreOf(`.hole[data-piece="${itsTwin}"]`);

  await dragAnimal(oneShape, { onto: itsTwin });
  check("a shape is taken by its twin's shadow", (await placedCount()) === 1);
  const landed = await drawingCentreOf(oneShape);
  const drift = Math.hypot(landed.x - twinShadow.x, landed.y - twinShadow.y);
  check(`it settles where it was aimed (${drift.toFixed(1)}px out)`, drift < 2);
  const owners = await shadowOwners();
  check("the shadows still name one shape each", new Set(owners).size === 6);
  check("the shape it displaced is now expected elsewhere", owners.includes(itsTwin));
  await shot("21-level18-swapped");

  await solveRemaining();
  check("the picture finishes however the twins were shared out", (await placedCount()) === 6);
  await shot("22-level18-built");

  // --- the end of chapter 3: a parade ---------------------------------------
  // Animals walk across the finished sunflower, and every one of them hops and
  // sings when it is poked. The board underneath is built of plain coloured
  // shapes, so the only animals on the screen are the ones walking: a
  // celebration is never made of what the board is made of, which is why the
  // parade ends this chapter rather than the chapter of animals. See
  // docs/decisions/A celebration is not made of the board.md.
  check("finishing chapter 3 raises the parade", (await celebrationName()) === "parade");
  check("the parade has the screen to itself first", (await finishButtons()) === 0);
  const marchers = await paradingPieces();
  check(
    `animals parade, each of them once (${marchers.length})`,
    marchers.length === 5 && new Set(marchers).size === 5,
  );
  const shapesPlaced = await animalsOnBoard();
  check(
    "none of them is a piece the finished board is already holding",
    marchers.every((piece) => !shapesPlaced.includes(piece)),
  );
  const hops = await playCelebration(3);
  check(`a poked animal answers (${hops.missed} missed)`, hops.missed === 0);
  check("the parade lets the way onwards through", (await waitForFinishButton()) === true);
  await shot("22b-chapter3-parade");

  // Portrait is where a parade over a finished board reads busiest. The same
  // moment, turned: the celebration is built again from the new layout, and what
  // has been played with is counted outside the board and survives.
  await setViewport(480, 900);
  await waitForLayout("portrait");
  check("the parade is turned with the board", (await layoutName()) === "portrait");
  check("rotation stays on the same level", (await levelNumber()) === 18);
  check("the parade is rebuilt rather than lost", (await celebrationName()) === "parade");
  // A re-mounted parade is dealt again from the level's own random, which has
  // moved on - so it is a full parade rather than the same five animals.
  const stillWalking = await paradingPieces();
  check(
    `a whole parade is dealt again in portrait (${stillWalking.length})`,
    stillWalking.length === 5,
  );
  check("the way onwards does not make the child wait twice", (await finishButtons()) > 0);
  await shot("22c-chapter3-parade-portrait");
  await setViewport(1280, 800);
  await waitForLayout("landscape");
}

async function runJigsaw() {
  // --- level 19: a picture cut up -------------------------------------------
  // The jigsaw chapter. One picture is one hole however many pieces it is in,
  // and the picture stays under the empty frame so the child can see what they
  // are making - a blank frame at two years old is a memory game.
  await goToLevel(19);
  check("jumps to level 19", (await levelNumber()) === 19);
  check("level 19 is a jigsaw", (await kindName()) === "jigsaw");
  const jigsawPieces = await pieceCount();
  check(`a 2x2 board deals four pieces (${jigsawPieces})`, jigsawPieces === 4);
  check("four pieces, one picture to build them in", (await holeCount()) === 1);
  check("every piece has a cut of its own in the guide", (await cutsInGuide()) === jigsawPieces);
  check("the picture shows under the empty frame", await guideIsShowing());
  // The picture takes the board rather than standing in the middle of it, and
  // what is left over is the page's own colour rather than a landscape. Both
  // are only visible on a rendered board; see docs/decisions/Let a picture take
  // the whole board.md.
  const board = await pictureBoard();
  check(
    `the picture takes the board (${(board.across * 100).toFixed(0)}% across, ` +
      `${(board.down * 100).toFixed(0)}% down)`,
    Math.max(board.across, board.down) > 0.6,
  );
  check(
    `the blue behind the picture is the blue behind the page (${board.backdrop} / ${board.page})`,
    board.backdrop !== null && board.backdrop === board.page,
  );
  // The other half of the rule the finished board is checked against below: a
  // piece waiting in the tray is a piece, and its edge is what says so.
  const looseEdges = await cutEdgesOn(".piece:not(.is-placed)");
  check(
    `a piece waiting to be placed shows its cut (${looseEdges.worst.toFixed(2)})`,
    looseEdges.drawn === jigsawPieces && looseEdges.worst > 0.5,
  );
  await shot("23-level19-jigsaw");

  // Aimed at its own cut, and it has to land there: a jigsaw piece dropped
  // where it belongs is the whole of the game.
  const [firstPiece] = await unplacedAnimals();
  const itsCut = await centreOf(`.cell[data-piece="${firstPiece}"]`);
  await dragAnimal(firstPiece);
  check("a piece is taken by its own place", (await placedCount()) === 1);
  // The piece's own cut rather than its grab box: the grab box is padded, and
  // the padding is clipped by the picture's edge, so on an edge piece its middle
  // is not the middle of the drawing. The cut is the same path both sides draw.
  const settled = await centreOf(`.piece[data-piece="${firstPiece}"] .cut`);
  const off = Math.hypot(settled.x - itsCut.x, settled.y - itsCut.y);
  check(`a piece settles into the cut it came from (${off.toFixed(1)}px out)`, off < 6);
  // One piece in, three cells still empty: every piece is clipped to the line
  // it was cut along, so nothing spills over a gap it has no business in.
  const building = await cutClipsOn("#stage");
  check(
    `a half-built picture is cut where it was cut (${building.exact}/${building.drawn})`,
    building.drawn === jigsawPieces && building.exact === jigsawPieces,
  );
  await shot("24-level19-first-piece");

  await solveRemaining();
  check("a jigsaw can be finished", (await placedCount()) === jigsawPieces);
  check("the guide goes once the picture is whole", !(await guideIsShowing()));
  const jigsawEdges = await settledCutEdgesOn(".piece.is-placed", jigsawPieces);
  check(
    `a finished jigsaw is a picture, not a grid (${jigsawEdges.drawn} edges faded)`,
    jigsawEdges.drawn === jigsawPieces && jigsawEdges.worst === 0,
  );
  // And the guide going is what the wider clip is for: with the white lines
  // gone and nothing dimmed behind the joins, the pieces have to overlap or the
  // seams are all there is left to see.
  const built = await cutClipsOn("#stage");
  check(
    `a finished picture closes over its joins (${built.spread}/${built.drawn})`,
    built.drawn === jigsawPieces && built.spread === jigsawPieces,
  );
  // The last piece is still sliding home when the picture is declared whole,
  // and a piece that is not yet where it belongs would wear its overlap where
  // everyone could see it. Put a piece back into the settle it just came out of
  // rather than racing the animation: the rule is about the class, and a check
  // that has to be quick enough to catch it is a check that fails on a slow day.
  await evaluate(`(() => {
    document.querySelector('.piece').classList.add('is-settling');
    return true;
  })()`);
  const settling = await cutClipsOn(".piece.is-settling");
  check(
    `a piece still on its way keeps the cut it was made with (${settling.exact}/${settling.drawn})`,
    settling.drawn === 1 && settling.exact === 1,
  );
  // And the same piece on a device that asked for less motion, which is home
  // the instant it is dropped: the class outlives the movement it stands for,
  // and waiting it out would put the seam back for a third of a second.
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  const stillSettling = await cutClipsOn(".piece.is-settling");
  await send("Emulation.setEmulatedMedia", { features: [] });
  check(
    `a piece that asked for less motion has nothing to wait for (${stillSettling.spread}/${stillSettling.drawn})`,
    stillSettling.drawn === 1 && stillSettling.spread === 1,
  );
  await evaluate(`(() => {
    document.querySelector('.piece').classList.remove('is-settling');
    return true;
  })()`);
  await shot("25-level19-built");
}

async function runFinale() {
  // --- level 26: a picture broken into shards -------------------------------
  // The other way of cutting a picture up. A jigsaw's pieces are all the same
  // rectangle, so the game is to read the picture; a shatter's are all
  // different shapes, so the game is to match an outline - which is why this
  // one is worth looking at rather than only counting. The shots are the only
  // place a partition of splinters would show.
  await goToLevel(26);
  check("jumps to level 26", (await levelNumber()) === 26);
  check("level 26 is a shatter", (await kindName()) === "shatter");
  const shardCount = await pieceCount();
  check(`a shattered picture deals six shards (${shardCount})`, shardCount === 6);
  check("six shards, one picture to build them in", (await holeCount()) === 1);
  check("every shard has a cut of its own in the guide", (await cutsInGuide()) === shardCount);
  check("the picture shows under the empty frame", await guideIsShowing());
  await shot("26-level26-shatter");

  const [firstShard] = await unplacedAnimals();
  const itsPlace = await centreOf(`.cell[data-piece="${firstShard}"]`);
  await dragAnimal(firstShard);
  check("a shard is taken by its own place", (await placedCount()) === 1);
  const shardAt = await centreOf(`.piece[data-piece="${firstShard}"] .cut`);
  const shardOff = Math.hypot(shardAt.x - itsPlace.x, shardAt.y - itsPlace.y);
  check(`a shard settles into the cut it came from (${shardOff.toFixed(1)}px out)`, shardOff < 6);
  await shot("27-level26-first-shard");

  await solveRemaining();
  check("a shatter can be finished", (await placedCount()) === shardCount);
  check("the guide goes once the picture is whole", !(await guideIsShowing()));
  const shardEdges = await settledCutEdgesOn(".piece.is-placed", shardCount);
  check(
    `a mended picture shows none of the breaks (${shardEdges.drawn} edges faded)`,
    shardEdges.drawn === shardCount && shardEdges.worst === 0,
  );
  const shardClips = await cutClipsOn("#stage");
  check(
    `a mended picture closes over its breaks (${shardClips.spread}/${shardClips.drawn})`,
    shardClips.drawn === shardCount && shardClips.spread === shardCount,
  );
  await shot("28-level26-built");

  // --- the ends of chapters 2 and 4 -----------------------------------------
  // Blossom over the animal that has just been put back together, and fireworks
  // over the picture that has just been finished. Both are here to be looked at
  // as much as checked: a celebration that has gone wrong is something a person
  // sees in the contact sheet long before a check catches it.
  await goToLevel(12);
  await solveRemaining();
  check("finishing chapter 2 raises the petals", (await celebrationName()) === "petals");
  const blossom = await celebrationThings();
  check(`blossom is falling to be caught (${blossom.length})`, blossom.length >= 6);
  check("the blossom has the screen to itself first", (await finishButtons()) === 0);
  const caught = await playCelebration(3);
  check(`a caught petal scatters (${caught.missed} missed)`, caught.missed === 0);
  check("blossom lets the way onwards through", (await waitForFinishButton()) === true);
  await shot("28b-chapter2-petals");

  await goToLevel(24);
  await solveRemaining();
  check("finishing chapter 4 raises the fireworks", (await celebrationName()) === "fireworks");
  await waitUntil(nightHasFallen, Boolean, 3000);
  check("the night sky falls over the finished picture", (await nightHasFallen()) === true);
  // A tap anywhere sets one off there, in the tick the finger landed. Three
  // spread across the sky, and the shot taken while they are still open.
  const board24 = await evaluate(`
    (() => {
      const r = document.querySelector('#stage').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()
  `);
  const beforeBangs = await celebrationPlayed();
  // Clear of the button, which lives above the celebration at the top middle.
  for (const [fx, fy] of [
    [0.22, 0.3],
    [0.45, 0.55],
    [0.78, 0.26],
  ]) {
    await tapAt(board24.x + fx * board24.w, board24.y + fy * board24.h);
  }
  check("a tap anywhere sets one off", (await celebrationPlayed()) === beforeBangs + 3);
  check("the night lets the way onwards through", (await waitForFinishButton()) === true);
  await shot("28c-chapter4-fireworks");

  await goToLevel(30);
  check("jumps to the last level", (await levelNumber()) === 30);
  check("the last level is in the mastery chapter", (await chapterName()) === "mastery");
  const lastDots = await chapterDots();
  check(`every chapter dot filled on level 30 (${lastDots.filled})`, lastDots.filled === 5);
  const lastCount = await pieceCount();
  await shot("29-level30-start");

  await solveRemaining();
  check("the last level can be completed", (await placedCount()) === lastCount);
  await shot("30-level30-complete");

  // --- the finale -----------------------------------------------------------
  // The finale keeps answering the child and never winds down: the end of the
  // game is a room to stay in rather than a wall. The ordinary way onward
  // restarts the ramp.
  check("the last level ends with the finale", (await celebrationName()) === "finale");
  const finale = await celebrationThings();
  const kindsInFinale = new Set(finale.map((thing) => thing.touch));
  check(
    `the finale offers several things at once (${[...kindsInFinale].sort().join(", ")})`,
    kindsInFinale.size >= 3,
  );
  check(
    "the finale offers a way out, once it has been seen",
    (await waitForFinishButton()) === true,
  );
  check("the last level offers a replay", (await finishLabel()) === "Play again");
  await shot("30b-finale");

  const playedFinale = await playCelebration(6);
  check(
    `the finale answers every touch (${playedFinale.missed} missed)`,
    playedFinale.missed === 0,
  );
  // A tap that lands on nothing at all still sets off a firework, so no part of
  // the board is dead. The sky is the last thing under a finger.
  const emptySky = await evaluate(`
    (() => {
      const stage = document.querySelector('#stage').getBoundingClientRect();
      for (let fy = 0.15; fy <= 0.6; fy += 0.05) {
        for (let fx = 0.1; fx <= 0.9; fx += 0.05) {
          const x = stage.x + fx * stage.width;
          const y = stage.y + fy * stage.height;
          const hit = document.elementFromPoint(x, y)?.closest('[data-touch], [role="button"]');
          if (hit?.dataset.touch === 'sky') return { x, y };
        }
      }
      return null;
    })()
  `);
  check("there is bare sky to tap in the finale", emptySky !== null);
  const playedBeforeSky = await celebrationPlayed();
  await tapAt(emptySky.x, emptySky.y);
  check("a tap on the empty sky is still answered", (await celebrationPlayed()) > playedBeforeSky);
  await sleep(1200);
  const stillGoing = await celebrationThings();
  check(`the finale does not run out (${stillGoing.length} to touch)`, stillGoing.length >= 3);
  check("the finale never takes the game away", (await levelNumber()) === 30);
  await shot("30c-finale-played");

  await pressFinishButton();
  check("play again loops back to level 1", (await levelNumber()) === 1);
  check("looping back clears the board", (await placedCount()) === 0);
  check("looping back deals the one huge animal again", (await pieceCount()) === 1);
  check("looping back takes the finale away", (await celebrationName()) === "");
  await shot("31-looped-back");
}

async function runFreshDeals() {
  await goToLevel(4);
  // --- a fresh deal every time ---------------------------------------------
  // The child's own reset button. What it has to leave behind is a board with
  // nothing on it and nothing of the last one still in the tray, on the same
  // level rather than the next one: it is a way of starting over, never a way
  // onwards.
  const beforeReset = await animalsOnBoard();
  await dragAnimal(beforeReset[0]);
  check("a piece placed before the reset counted", (await placedCount()) === 1);
  await dealAgain();
  check("reset deals a fresh puzzle", (await placedCount()) === 0);
  check("reset keeps the level", (await levelNumber()) === 4);
  const afterReset2 = await animalsOnBoard();
  check(
    `reset leaves one board of pieces, not two (${afterReset2.length})`,
    afterReset2.length === 4,
  );
  check("reset raises no celebration", (await celebrationName()) === "");
  await shot("31a-level4-dealt-again");

  const castForSeed = async (seed) => {
    const token = ++navigation;
    await send("Page.navigate", {
      url: `http://127.0.0.1:${PORT}/?level=6&seed=${seed}&shot=${token}`,
    });
    await waitForNavigation(token, 6);
    return (await animalsOnBoard()).join();
  };
  const firstSeedCast = await castForSeed(SEED);
  check("the same seed deals the same puzzle", (await castForSeed(SEED)) === firstSeedCast);
  const deals = new Set();
  for (const seed of [11, 22, 33, 44, 55, 66]) deals.add(await castForSeed(seed));
  check(`different seeds deal different puzzles (${deals.size} of 6)`, deals.size >= 4);
  await shot("32-another-deal");

  // --- the busiest board held the other way up -----------------------------
  // A tablet gets turned. The fullest board of animals is where the tray has
  // least room to reflow into, so what has to hold is that every piece is still
  // there, still big enough to grab, and still able to go home.
  await setViewport(700, 1000);
  await goToLevel(6);
  check("the busiest board composes in portrait too", (await layoutName()) === "portrait");
  await dealAgain();
  const turned = await animalsOnBoard();
  check(`portrait keeps every piece in reach (${turned.length})`, turned.length === 6);
  const turnedStage = await evaluate(
    `document.querySelector('#stage').getBoundingClientRect().width`,
  );
  const turnedSmallest = await evaluate(`
    (() => {
      const boxes = [...document.querySelectorAll('.piece .grab-box')].map((el) => {
        const r = el.getBoundingClientRect();
        return Math.max(r.width, r.height);
      });
      return Math.min(...boxes);
    })()
  `);
  check(
    `portrait keeps every piece big enough to grab (${((turnedSmallest / turnedStage) * 100).toFixed(0)}% of the board)`,
    turnedSmallest / turnedStage >= 0.1,
  );
  await shot("33-portrait-six-animals");
  await solveRemaining();
  check("the busiest board can be finished in portrait too", (await placedCount()) === 6);

  // --- a celebration for a child who asked for less motion -------------------
  // Every act stands still under `prefers-reduced-motion`, and every act but
  // one replaces what a finger takes away. Beach balls do not: a tapped ball is
  // thrown again rather than removed, so a still ball that gave up its place in
  // the air would be replaced while it was still on the screen - and, since
  // nothing here lands, replaced again immediately, for as long as the
  // celebration was arriving. That is invisible to a check that only asks
  // whether there is something to touch, so this one counts.
  await setViewport(1280, 800);
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await goToLevel(2);
  await solveRemaining();
  const stillInterlude = await celebrationName();
  const stillAtFirst = (await celebrationThings()).length;
  await sleep(1500);
  const stillAfter = (await celebrationThings()).length;
  check(
    `a still celebration is still a celebration (${stillInterlude}, ${stillAtFirst} to touch)`,
    stillInterlude !== "" && stillAtFirst >= 3,
  );
  check(
    `and it stops making them (${stillAtFirst} then ${stillAfter})`,
    stillAfter <= stillAtFirst + 2,
  );
  const stillPlayed = await playCelebration(2);
  check(
    `a still celebration still answers a finger (${stillPlayed.missed} missed)`,
    stillPlayed.missed === 0,
  );
  await send("Emulation.setEmulatedMedia", { features: [] });
}

async function runNetwork() {
  // --- what happens when a chunk is not there -------------------------------
  // The game is split by chapter, and `warm.ts` fetches every chunk during the
  // first level so a seam never waits. Both halves of that are claims about
  // conditions nobody meets by accident, so this makes them: the network is cut
  // outright, and a chunk is blocked outright. See docs/decisions/A chapter is
  // warmed before it is needed, not fetched when it is.md, both halves of it.
  await setViewport(1280, 800);
  await send("Network.enable");

  // 1. Once the warm has finished, the rest of the game needs no network at
  //    all. This is the property the split has to have; without it a child on a
  //    train would stall at a chapter boundary.
  await reopenTheGame();
  await waitForResourcesToSettle();
  const beforeCut = await resourceCount();
  await setOffline(true);
  const offlineChapters = [];
  for (const level of [8, 14, 20, 26]) {
    await jumpToLevelFromPanel(level);
    offlineChapters.push({
      level,
      arrived: await levelNumber(),
      kind: await kindName(),
      pieces: await pieceCount(),
    });
  }
  for (const seen of offlineChapters) {
    check(
      `level ${seen.level} opens with no network (${seen.kind || "nothing"}, ${seen.pieces} pieces)`,
      seen.arrived === seen.level && seen.kind !== "" && seen.pieces > 0,
    );
  }
  const afterCut = await resourceCount();
  check(
    `nothing is fetched once the warm has finished (${afterCut - beforeCut} requests)`,
    afterCut === beforeCut,
  );
  await shot("34-offline-chapters");
  await setOffline(false);

  // 2. A chunk that has not arrived must never blank the screen. Blocking one
  //    outright is the only way to see the branch a slow connection would take.
  await send("Network.setBlockedURLs", { urls: ["*polygon*"] });
  await reopenTheGame();
  await sleep(1500);
  await jumpToLevelFromPanel(12);
  const beforeSeam = {
    level: await levelNumber(),
    kind: await kindName(),
    pieces: await pieceCount(),
  };
  check("the board before the missing chunk is whole", beforeSeam.pieces > 0);
  // Offline, so the game waits for the connection rather than reloading into
  // the same failure. This is the state a child would actually be looking at.
  await setOffline(true);
  await jumpToLevelFromPanel(13, { waitForArrival: false });
  await sleep(1200);
  const heldLevel = await levelNumber();
  const heldPieces = await pieceCount();
  check("a missing chunk never empties the stage", (await stageIsThere()) === true);
  check(
    `the board that is up stays up (level ${heldLevel}, ${heldPieces} pieces)`,
    heldLevel === beforeSeam.level && heldPieces === beforeSeam.pieces,
  );
  check("nothing asks the child to wait", (await spinnerCount()) === 0);
  await shot("35-chunk-late-board-stays");

  // 3. And when the connection comes back the game arrives by itself, on the
  //    level the child asked for rather than the one behind it.
  await send("Network.setBlockedURLs", { urls: [] });
  await setOffline(false);
  const cameBack = await waitForLevel(13, 12000);
  check(`the game comes back by itself when the network does (level ${cameBack})`, cameBack === 13);
  check("and on the kind that was missing", (await kindName()) === "polygon");
  await shot("36-chunk-arrived-after-reconnect");

  // 4. The celebration chunk is the one every level waits for now, and the
  //    early levels give it the least time of any. What a blocked chunk stages
  //    is the branch where it never comes: the level has to end anyway, with
  //    its fanfare and its button, rather than hold itself open over a finished
  //    board. A chunk that is merely slow takes the same branch by a different
  //    route - `PARTY_PATIENCE_MS` in game.ts is what turns waiting into not
  //    coming - and that one is a race rather than a condition, so it is left
  //    to the bound rather than staged here.
  await send("Network.setBlockedURLs", { urls: ["*celebration*"] });
  await reopenTheGame();
  await sleep(1500);
  await goToLevel(2);
  await solveRemaining();
  await sleep(1500);
  check("a level with no celebration to raise still ends", (await celebrationName()) === "");
  check(
    "and the way onwards is not held back by a party that never came",
    (await finishButtons()) === 1,
  );
  check("the board it was raised over is still whole", (await placedCount()) > 0);
  await send("Network.setBlockedURLs", { urls: [] });
}

async function runScreens() {
  // --- real screens, at their real sizes ------------------------------------
  // iPad is the target device. The board is composed for the box it is drawn
  // in - short side always 700 logical units, long side whatever the screen
  // asks for - so a screen of any shape gets a board of its own shape and there
  // is no letterbox left to measure. That is easy to reason about wrongly, so
  // this drives Chromium to the real iPad point sizes and looks: the whole
  // board on screen, a piece still a tenth of the short side once the scale is
  // applied, and the board covering essentially all of the screen. Split View
  // is the narrow width a multitasking iPad can hand the game, and the case
  // most likely to break a layout. The last two are not devices at all: one
  // very wide screen and one very tall one, here because nothing special-cases
  // an extreme ratio and the shot is how a reviewer sees what one looks like.
  // See the iPad decision record and the screen-shaped board record.
  await send("Network.setBlockedURLs", { urls: [] });
  await setOffline(false);
  const iPads = [
    ["ipad-mini-portrait", 768, 1024, "portrait"],
    ["ipad-mini-landscape", 1024, 768, "landscape"],
    ["ipad-11-portrait", 834, 1194, "portrait"],
    ["ipad-11-landscape", 1194, 834, "landscape"],
    ["ipad-13-portrait", 1024, 1366, "portrait"],
    ["ipad-13-landscape", 1366, 1024, "landscape"],
    ["ipad-split-view", 375, 1024, "portrait"],
    ["very-wide", 2400, 800, "landscape"],
    ["very-tall", 700, 1600, "portrait"],
  ];
  for (const [name, width, height, orientation] of iPads) {
    await setViewport(width, height);
    await goToLevel(6);
    check(`${name}: picks the ${orientation} layout`, (await layoutName()) === orientation);
    const board = await evaluate(`
      (() => {
        const stage = document.querySelector('#stage');
        const r = stage.getBoundingClientRect();
        const vb = stage.viewBox.baseVal;
        // The SVG element fills the screen; the board is drawn inside it,
        // letterboxed by preserveAspectRatio="meet". Measure the drawn board,
        // not the element, or the coverage is always 100%.
        const scale = Math.min(r.width / vb.width, r.height / vb.height);
        const drawn = { width: vb.width * scale, height: vb.height * scale };
        const pieces = [...document.querySelectorAll('.piece .grab-box')].map((el) => {
          const b = el.getBoundingClientRect();
          return Math.max(b.width, b.height);
        });
        return {
          fits: r.width <= window.innerWidth + 1 && r.height <= window.innerHeight + 1,
          coverage: (drawn.width * drawn.height) / (window.innerWidth * window.innerHeight),
          shortSide: Math.min(window.innerWidth, window.innerHeight),
          smallestPiece: pieces.length ? Math.min(...pieces) : 0,
        };
      })()
    `);
    check(`${name}: the whole board is on screen`, board.fits === true);
    check(
      `${name}: a piece stays big enough to grab (${((board.smallestPiece / board.shortSide) * 100).toFixed(0)}% of the short side)`,
      board.smallestPiece > 0 && board.smallestPiece / board.shortSide >= 0.1,
    );
    // The board must use the whole screen, whatever its shape.
    check(
      `${name}: board covers ${(board.coverage * 100).toFixed(1)}% of the screen`,
      board.coverage >= 0.99,
    );
    await shot(`37-${name}`);
  }

  // --- the safe-area insets, forced to a real value -------------------------
  // Headless Chromium reports every safe-area inset as zero, so a rule written
  // against `env(safe-area-inset-*)` cannot be told apart from a misspelt one:
  // `env(...bottm)` resolves to the same zero and ships green. So the CSS reads
  // custom properties (`var(--inset-bottom)` and friends) that resolve to the
  // env value on a device and to zero here - and this forces those properties
  // to the iPad's 34px home-indicator inset and checks the controls actually
  // move by it. If a consuming rule stops reading the variable, its element
  // stops moving and this fails. The screenshot is a frame of the button
  // sitting clear of where the home indicator would be.
  const HOME_INDICATOR = 34;
  await setViewport(834, 1194);
  await goToLevel(6);
  const beforeInset = await evaluate(`
    (() => {
      const key = document.querySelector('.grownups-key').getBoundingClientRect();
      const app = getComputedStyle(document.querySelector('#app'));
      const panel = getComputedStyle(document.querySelector('.grownups-panel'));
      return {
        keyBottom: key.bottom,
        appPadBottom: parseFloat(app.paddingBottom),
        panelPadBottom: parseFloat(panel.paddingBottom),
      };
    })()
  `);
  await evaluate(`
    (() => {
      const root = document.documentElement.style;
      root.setProperty('--inset-top', '${HOME_INDICATOR}px');
      root.setProperty('--inset-right', '${HOME_INDICATOR}px');
      root.setProperty('--inset-bottom', '${HOME_INDICATOR}px');
      root.setProperty('--inset-left', '${HOME_INDICATOR}px');
      return true;
    })()
  `);
  const afterInset = await waitUntil(
    () =>
      evaluate(`
      (() => {
        const key = document.querySelector('.grownups-key').getBoundingClientRect();
        const app = getComputedStyle(document.querySelector('#app'));
        const panel = getComputedStyle(document.querySelector('.grownups-panel'));
        return {
          keyBottom: key.bottom,
          appPadBottom: parseFloat(app.paddingBottom),
          panelPadBottom: parseFloat(panel.paddingBottom),
        };
      })()
    `),
    (inset) => inset.appPadBottom >= beforeInset.appPadBottom + HOME_INDICATOR,
    2000,
  );
  // The grown-ups button reads `calc(12px + var(--inset-bottom))`, so its bottom
  // edge lifts by the whole inset.
  check(
    `safe-area: the grown-ups button lifts by the inset (moved ${(beforeInset.keyBottom - afterInset.keyBottom).toFixed(0)}px)`,
    Math.abs(beforeInset.keyBottom - afterInset.keyBottom - HOME_INDICATOR) <= 1,
  );
  // `#app` insets the whole board off the unsafe edges: its bottom padding is the
  // raw inset.
  check(
    `safe-area: the board is inset by the home indicator (padding ${afterInset.appPadBottom.toFixed(0)}px)`,
    Math.abs(afterInset.appPadBottom - beforeInset.appPadBottom - HOME_INDICATOR) <= 1,
  );
  // The grown-ups sheet reads `calc(16px + var(--inset-bottom))`, so its padding
  // grows by the inset too.
  check(
    `safe-area: the grown-ups sheet padding grows by the inset (${afterInset.panelPadBottom.toFixed(0)}px)`,
    Math.abs(afterInset.panelPadBottom - beforeInset.panelPadBottom - HOME_INDICATOR) <= 1,
  );
  await shot("37-ipad-safe-area-forced");
  await evaluate(`
    (() => {
      const root = document.documentElement.style;
      for (const p of ['--inset-top', '--inset-right', '--inset-bottom', '--inset-left']) {
        root.removeProperty(p);
      }
      return true;
    })()
  `);

  // --- the manifest, as a browser fetches it --------------------------------
  // A `?raw` import in the unit test proves the source file has the right words;
  // it cannot prove the built site serves a manifest a browser will accept. A
  // wrong MIME type, a bad `start_url`, or a `public/` file that never got
  // copied into `dist/` are all silent no-ops on a device and invisible to a
  // source import. So fetch it the way the browser does - from the built site
  // over the server - and parse it there.
  const manifestCheck = await evaluate(`
    (async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return { error: 'no <link rel="manifest">' };
      const res = await fetch(link.href);
      if (!res.ok) return { error: 'status ' + res.status };
      const type = res.headers.get('content-type') || '';
      let manifest;
      try { manifest = await res.json(); }
      catch (e) { return { error: 'not JSON: ' + e.message }; }
      return {
        type,
        display: manifest.display,
        startUrl: new URL(manifest.start_url, link.href).pathname,
        scope: new URL(manifest.scope, link.href).pathname,
        icons: (manifest.icons || []).length,
      };
    })()
  `);
  check(
    `manifest: the built site serves it as JSON (${manifestCheck.type || manifestCheck.error})`,
    !manifestCheck.error && /json/.test(manifestCheck.type),
  );
  check(
    `manifest: it launches fullscreen (display=${manifestCheck.display})`,
    manifestCheck.display === "fullscreen",
  );
  check(
    `manifest: start_url is inside scope (${manifestCheck.startUrl} in ${manifestCheck.scope})`,
    typeof manifestCheck.startUrl === "string" &&
      typeof manifestCheck.scope === "string" &&
      manifestCheck.startUrl.startsWith(manifestCheck.scope),
  );
  check(`manifest: it names at least one icon (${manifestCheck.icons})`, manifestCheck.icons >= 1);
  // The icon is a public asset; a browser fetches it lazily, so a broken path is
  // silent. Fetch it here to prove `dist/` actually holds it.
  const iconCheck = await evaluate(`
    (async () => {
      const link = document.querySelector('link[rel="icon"]');
      if (!link) return { error: 'no <link rel="icon">' };
      const res = await fetch(link.href);
      return { ok: res.ok, type: res.headers.get('content-type') || '' };
    })()
  `);
  check(
    `manifest: the home-screen icon is served (${iconCheck.type || iconCheck.error})`,
    !iconCheck.error && iconCheck.ok === true && /svg/.test(iconCheck.type),
  );

  await holdGrownUps();
  const liveLevelCount = await evaluate(`document.querySelectorAll('.grownups-level').length`);
  await pressInPanel(".grownups-done");
  return { liveLevelCount };
}

const segments = [
  { name: "opening", run: runOpening },
  { name: "rest", run: runRest },
  { name: "level3-level6-animals", run: runAnimals },
  { name: "level11-sliced", run: runSliced },
  { name: "level13-level18-polygon", run: runPolygon },
  { name: "level19-jigsaw", run: runJigsaw },
  { name: "level26-finale", run: runFinale },
  { name: "fresh-deals", run: runFreshDeals },
  { name: "network", run: runNetwork },
  { name: "screens", run: runScreens },
];

/**
 * Coverage belongs to the complete sample, not to any one segment. Workers
 * report what their live board showed; the parent merges those reports and
 * makes the same six assertions, once, after every narrative check before it.
 */
function assertCoverage(results) {
  const required = requiredCoverage();
  const seenKinds = new Set(results.flatMap((result) => result.coverage.kinds));
  const seenChapters = new Set(results.flatMap((result) => result.coverage.chapters));
  const seenCelebrations = new Set(results.flatMap((result) => result.coverage.celebrations));
  const liveLevelCount =
    results.find((result) => result.meta?.liveLevelCount)?.meta.liveLevelCount ?? 0;

  check(
    `coverage: the table parses to a real requirement (${required.kinds.size} kinds, ${required.chapters.size} chapters, ${required.celebrations.size} celebrations)`,
    required.kinds.size >= 2 && required.chapters.size >= 2 && required.celebrations.size >= 2,
  );
  check(
    `coverage: the parse saw every level (${required.rows.length} parsed, ${liveLevelCount} in the level map)`,
    liveLevelCount > 0 && required.rows.length === liveLevelCount,
  );
  const strays = [
    ...[...seenKinds].filter((k) => !required.kinds.has(k)),
    ...[...seenChapters].filter((c) => !required.chapters.has(c)),
    ...[...seenCelebrations].filter((c) => !required.celebrations.has(c)),
  ];
  check(
    `coverage: everything the run saw is named by the table (${strays.join(", ") || "no strays"})`,
    strays.length === 0,
  );

  // The guard itself: every kind, chapter and celebration the table names was
  // put on screen by the sample. A miss names the thing and the level that would
  // cover it, so closing the gap is a line rather than a hunt.
  const missingKinds = [...required.kinds].filter(([kind]) => !seenKinds.has(kind));
  check(
    `coverage: every puzzle kind is exercised (${missingKinds.map(([k, l]) => `${k} @ level ${l}`).join(", ") || `all ${required.kinds.size}`})`,
    missingKinds.length === 0,
  );
  const missingChapters = [...required.chapters].filter(([chapter]) => !seenChapters.has(chapter));
  check(
    `coverage: every chapter is exercised (${missingChapters.map(([c, l]) => `${c} @ level ${l}`).join(", ") || `all ${required.chapters.size}`})`,
    missingChapters.length === 0,
  );
  const missingCelebrations = [...required.celebrations].filter((c) => !seenCelebrations.has(c));
  check(
    `coverage: every celebration is played (${missingCelebrations.join(", ") || `all ${required.celebrations.size}`})`,
    missingCelebrations.length === 0,
  );
}

async function runWorker() {
  const segment = segments.find(({ name }) => name === workerName);
  if (!segment) throw new Error(`Unknown screenshot segment "${workerName}".`);

  let error = null;
  let meta = {};
  try {
    await openWorker(segment.name);
    await send("Page.enable");
    await send("Runtime.enable");
    await setViewport(1280, 800);
    meta = (await segment.run()) ?? {};
  } catch (caught) {
    error = caught instanceof Error ? (caught.stack ?? caught.message) : String(caught);
  } finally {
    try {
      await closeWorker();
    } catch (caught) {
      error ??= caught instanceof Error ? (caught.stack ?? caught.message) : String(caught);
    }
  }

  const result = {
    name: segment.name,
    checks,
    coverage: {
      kinds: [...coveredKinds],
      chapters: [...coveredChapters],
      celebrations: [...coveredCelebrations],
    },
    meta,
    error,
  };
  if (process.send) {
    process.send(result, () => process.disconnect());
  }
  if (error) process.exitCode = 1;
}

function runInChild(segment, allShots) {
  return new Promise((resolve) => {
    const args = [`--worker=${segment.name}`];
    if (onlySource !== null) args.push(`--only=${onlySource}`);
    if (allShots) args.push("--all-shots");
    const child = fork(fileURLToPath(import.meta.url), args, { silent: true });
    let result = null;
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("message", (message) => {
      result = message;
    });
    child.on("exit", (code, signal) => {
      resolve(
        result
          ? { ...result, diagnostics: stdout.trim() }
          : {
              name: segment.name,
              checks: [],
              coverage: { kinds: [], chapters: [], celebrations: [] },
              meta: {},
              diagnostics: stdout.trim(),
              error:
                stderr.trim() ||
                `Screenshot worker exited before reporting (${signal ? `signal ${signal}` : `status ${code}`}).`,
            },
      );
    });
  });
}

async function runParent() {
  const selected = segments
    .map((segment) => {
      const nameMatches = only ? only.test(segment.name) : true;
      const bodyMatches = only ? only.test(segment.run.toString()) : true;
      return { ...segment, selected: nameMatches || bodyMatches, allShots: !only || nameMatches };
    })
    .filter((segment) => segment.selected);

  if (selected.length === 0) {
    console.error(
      `No screenshot segment or shot matched --only=${onlySource}.\n` +
        `Segments: ${segments.map(({ name }) => name).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const results = new Array(selected.length);
  let next = 0;
  const takeWork = async () => {
    for (;;) {
      const index = next++;
      if (index >= selected.length) return;
      results[index] = await runInChild(selected[index], selected[index].allShots);
    }
  };
  const slots = Math.min(browserSlots(), selected.length);
  await Promise.all(Array.from({ length: slots }, takeWork));

  const workerErrors = results.filter((result) => result.error);
  const orderedChecks = results.flatMap((result) => result.checks);
  if (!only && workerErrors.length === 0) {
    assertCoverage(results);
    orderedChecks.push(...checks);
  }

  // Built even when checks fail: a failed run is exactly when someone wants to
  // look at the pictures. A sheet is a convenience, so losing it must not turn
  // a reporting problem into a failed verification.
  let sheetError = null;
  try {
    buildSheet();
  } catch (error) {
    sheetError = error.message;
  }

  if (verbose) {
    for (const result of orderedChecks) {
      console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.label}`);
    }
    for (const result of results) {
      if (result.diagnostics) console.log(`${result.name}\n${result.diagnostics}`);
    }
  }

  const failed = orderedChecks.filter((result) => !result.ok);
  if (workerErrors.length > 0 || failed.length > 0) {
    for (const result of workerErrors) {
      console.error(
        `ERROR ${result.name}\n${result.error}` +
          (result.diagnostics ? `\n${result.diagnostics}` : ""),
      );
    }
    for (const result of failed) console.error(`FAIL  ${result.label}`);
    if (sheetError) console.error(`Could not build the contact sheet: ${sheetError}`);
    console.error(
      `${failed.length} check(s) failed; ${workerErrors.length} worker(s) did not complete.`,
    );
    process.exitCode = 1;
    return;
  }

  if (only) {
    console.log(
      `Partial screenshot run (${selected.map(({ name }) => name).join(", ")}): ` +
        "coverage was not asserted.",
    );
  }
}

if (workerName) await runWorker();
else await runParent();
