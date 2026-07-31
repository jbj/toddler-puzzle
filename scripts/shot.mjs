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

rmSync(shotsDir, { recursive: true, force: true });
mkdirSync(shotsDir, { recursive: true });

// --- coverage of the sample -----------------------------------------------
// The run samples the thirty levels rather than playing them in order, which is
// what keeps it fast - but a hand-written sample decays in silence. Add a
// seventh kind, retune a chapter's kind out of the shots, or add a celebration
// the run never reaches, and every check below would go on passing while the
// harness tested less and less of the game. So the sample is held against the
// table it is meant to sample: these record what the live app actually put on
// screen as the run played, and the guard at the end of the run holds them
// against what the source of truth says must be covered. See
// docs/decisions/20260730T005900-guard-the-sample-against-the-table.md.
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

  // Every celebration that exists, from its own union type. The finale is one of
  // them; it is played at the end of the game rather than a chapter.
  const celebrationSrc = readFileSync(join(root, "src/celebration.ts"), "utf8");
  const union = celebrationSrc.slice(
    celebrationSrc.indexOf("type CelebrationId"),
    celebrationSrc.indexOf(";", celebrationSrc.indexOf("type CelebrationId")),
  );
  const celebrations = new Set([...union.matchAll(/"([^"]+)"/g)].map((m) => m[1]));

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

// Launching Chrome and speaking the DevTools Protocol is `chrome.mjs`, shared
// with the audio check so there is one version of it rather than two.
let browser;
try {
  browser = await openChrome({ debugPort: DEBUG_PORT, profileDir });
} catch (error) {
  server.close();
  throw error;
}
const { send, evaluate } = browser;

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
 * Centre of what a piece actually *draws*, the grab box left out. The grab box
 * is the ink padded and then clipped to the piece's own box, so for a piece cut
 * out of a picture it sits a few pixels off-centre - by the padding it lost at
 * the edge it was clipped against, which grows with the picture. Where a piece
 * has come to rest is a question about its drawing, and a shadow is drawn from
 * the same path, so this is the like-for-like measurement.
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

/**
 * What to aim a piece at. A cut-up picture's hole is the whole picture, whose
 * middle is only one piece's home, so a piece of one aims at the cut its own
 * outline made in the guide (`.cell[data-piece=...]`, minted by
 * `src/picture-pieces.ts` for both the jigsaw and the shatter) - which is the
 * same path the piece is clipped from, so aiming its drawing at that cut aims
 * it at where the drawing belongs.
 */
const targetSelector = (pieceId) =>
  /^(jigsaw|shatter):/.test(pieceId) && pieceId.split(":").length > 2
    ? `.cell[data-piece="${pieceId}"]`
    : `.hole[data-piece="${holeFor(pieceId)}"]`;

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
  const hole = await centreOf(targetSelector(onto ?? pieceId));
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
 * Wait for the way onwards to arrive. On an ordinary level it is there the
 * instant the level is finished; at the end of a chapter it holds back for a
 * beat so the celebration is the first thing seen. See FINISH_BUTTON_BEAT_MS.
 */
async function waitForFinishButton(within = 5000) {
  const deadline = Date.now() + within;
  while (Date.now() < deadline) {
    if ((await finishButtons()) > 0) return true;
    await sleep(100);
  }
  return false;
}

/** Press the big button that ends a level, then wait for the next board. */
async function pressFinishButton() {
  await waitForFinishButton();
  await evaluate(`document.querySelector('#stage .fx [role="button"]').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )`);
  await sleep(500);
}

// --- levels played by touching --------------------------------------------
// The first chapter alternates: bubbles, one animal to drag, peekaboo, two
// animals, and a scene where everything answers. The touch levels have no
// tray and no drag, and the three things this run is really checking are that
// a touch registers at once, that the level can be finished by touching alone,
// and that there is no way to be stuck or wrong. See src/kinds/play.ts.

/** Which activity is on screen, or "" if this level is not one. */
const activityName = () =>
  evaluate(`document.querySelector('#stage .activity')?.dataset.activity ?? ''`);

/** How many things the level wants touched, and how many have been. */
const activityProgress = () =>
  evaluate(`
  (() => {
    const layer = document.querySelector('#stage .activity');
    if (!layer?.dataset.activity) return null;
    return { goal: Number(layer.dataset.goal), touched: Number(layer.dataset.touched) };
  })()
`);

/**
 * Everything a finger could actually land on, and where to land on it. A thing
 * is only counted while most of it is inside the board - a bubble on its way in
 * from below the bottom edge is not something a child can touch yet, so
 * counting it would let a nearly empty sky pass for a full one - and the point
 * returned is the middle of the part that *is* on the board.
 *
 * The scope is a parameter because the same question is asked of two layers:
 * the activity of a touch level, and the celebration a chapter ends with. Both
 * are the same promise - something is there and it answers.
 */
const thingsToTouch = (scope = "#stage .activity") =>
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

// --- the end of a chapter --------------------------------------------------
// Five levels finishing is a bigger moment than one level finishing, and the
// moment is played rather than watched: balloons to pop, a rainbow to paint, a
// sky to fire into. What this run is really checking is that it is not a trap
// at either end - the way onwards is up from the first instant, and things keep
// arriving for a child who has popped the lot. See src/celebration.ts.

/** Which celebration is on screen, or "" if this level did not end a chapter. */
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
 * Touch things until the level says it is done, one at a time, checking as it
 * goes that progress only ever climbs and that there is always something left
 * to touch. Throws if the board ever runs dry, which is the shape a stuck level
 * would take. Returns how many taps it took and how many of them the game did
 * not answer: a touch level whose touches do not register is not a level.
 */
async function playActivity({ shotAt } = {}) {
  let taps = 0;
  let missed = 0;
  for (let guard = 0; guard < 40; guard++) {
    const before = await activityProgress();
    if (!before) throw new Error("This level is not played by touching.");
    if (before.touched >= before.goal) break;

    const things = await thingsToTouch();
    if (things.length === 0) throw new Error("Nothing left on screen to touch.");
    const thing = things[taps % things.length];
    await tapAt(thing.x, thing.y);
    taps++;

    const after = await activityProgress();
    if (after.touched < before.touched) throw new Error("Progress went backwards.");
    if (after.touched === before.touched) missed++;
    if (shotAt && taps === shotAt.after) await shot(shotAt.name);
  }
  await sleep(500);
  return { taps, missed };
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

/**
 * Every option the panel offers, by the label a grown-up reads. A switch that
 * does nothing is worse than no switch at all, so what is on this panel is
 * checked rather than assumed - rotation mode was dropped
 * (decision 20260730T203000) and its row went with it.
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
  const until = Date.now() + within;
  while (Date.now() < until) {
    if ((await levelNumber()) === wanted) return wanted;
    await sleep(250);
  }
  return levelNumber();
}

/** Go to a level the way a grown-up does, without reloading the page. */
async function jumpToLevelFromPanel(level) {
  await holdGrownUps();
  await pressInPanel(`.grownups-level[data-level="${level}"]`);
  await sleep(1200);
}

/** A tap on a part of the board with nothing on it: the smallest interaction. */
async function tapEmptySpot() {
  const spot = await emptySpotOnBoard();
  if (!spot) throw new Error("Nowhere empty on the board to tap.");
  await tapAt(spot.x, spot.y);
}

// --- the idle hint --------------------------------------------------------
// After a stretch with nothing happening, a glow where the next piece wants to
// go. Silent, and it never goes away by itself: touch anything and it goes.
// See src/hint.ts.

/** Must match `HINT_DELAY_MS.sooner` in src/hint.ts. */
const HINT_SOONER_MS = 5000;

/**
 * How long this run gives a hint to appear. Deliberately much longer than the
 * delay itself: a loaded machine can lose a second or two anywhere, and a check
 * that fails for that reason teaches nobody anything.
 */
const HINT_WINDOW_MS = HINT_SOONER_MS + 2500;

/**
 * The hint as it stands on the board: which piece it is about, whether that
 * piece is still waiting, and where its ends have landed. Centres rather than
 * boxes, because a mark is the piece's own outline *stroked*, so it is a few
 * pixels bigger than the hole it is drawn over and only the middles compare.
 *
 * `brights` is a list, and `bright` the first of them: a kind with a *choice*
 * of place is hinted at every place that would take the piece, so there is not
 * always exactly one.
 */
const hintOnBoard = () =>
  evaluate(`
  (() => {
    const hint = document.querySelector('#stage .hint');
    if (!hint) return null;
    const middle = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
    };
    const piece = hint.dataset.piece;
    const escaped = JSON.stringify(piece);
    const pieceEl = document.querySelector('.piece[data-piece=' + escaped + ']');
    const art = pieceEl?.querySelector('.art > path');
    return {
      piece,
      marks: hint.querySelectorAll('.hint-mark').length,
      filled: hint.querySelectorAll('[fill]:not([fill="none"])').length,
      placed: pieceEl ? pieceEl.classList.contains('is-placed') : null,
      bright: middle(hint.querySelector('.hint-mark:not(.is-quiet)')),
      brights: [...hint.querySelectorAll('.hint-mark:not(.is-quiet)')].map(middle),
      quiet: middle(hint.querySelector('.hint-mark.is-quiet')),
      hole: middle(document.querySelector('.hole[data-piece=' + escaped + ']')),
      waiting: middle(art),
    };
  })()
`);

const away = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Every free shadow on the board that wants the same shape as this piece -
 * which, on a kind that treats identical shapes as interchangeable, is exactly
 * the set of places a drop would be taken. Worked out from what the shadows
 * *draw*, so it owes nothing to what the game says about itself.
 */
const placesFor = (piece) =>
  evaluate(`
  (() => {
${SHAPE_KEY}
    const art = document.querySelector(${JSON.stringify(`.piece[data-piece="${piece}"] .art > path`)});
    if (!art) return null;
    const wanted = key(art.getAttribute('d'));
    const out = [];
    for (const hole of document.querySelectorAll('#stage .hole')) {
      if (Number(hole.style.opacity) === 0) continue;
      const path = hole.querySelector('path');
      if (!path || key(path.getAttribute('d')) !== wanted) continue;
      const r = hole.getBoundingClientRect();
      out.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height });
    }
    return out;
  })()
`);

/** Wait out a generous window and report whatever is glowing, or null. */
async function hintAfterAWhile() {
  await sleep(HINT_WINDOW_MS);
  return hintOnBoard();
}

/** Drag every animal still in the tray into its hole. */
async function solveRemaining() {
  for (const animal of await unplacedAnimals()) await dragAnimal(animal);
  await sleep(700);
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

  // --- level 1: bubbles ----------------------------------------------------
  // The game opens with something to touch rather than something to drag,
  // because dragging is beyond a one-year-old and a first screen they cannot
  // work is a closed door. See docs/decisions/20260729T072100 and
  // src/kinds/play.ts.
  check("a new player starts on level 1", (await levelNumber()) === 1);
  check("level 1 is in the first chapter", (await chapterName()) === "first-touches");
  check("level 1 is played by touching", (await kindName()) === "play");
  check("level 1 is the bubbles", (await activityName()) === "bubbles");
  check("nothing waits in a tray on a touch level", (await pieceCount()) === 0);
  check("nothing has to be aimed at a hole", (await holeCount()) === 0);
  const dots = await chapterDots();
  check(
    `six chapter dots, one filled (${dots.filled} of ${dots.total})`,
    dots.total === 6 && dots.filled === 1,
  );

  const bubbles = await thingsToTouch();
  const opening = await activityProgress();
  check(`bubbles are on screen to touch (${bubbles.length})`, bubbles.length >= opening.goal);
  check("nothing has been touched yet", opening.touched === 0);
  // Every target on a touch level is a whole hand's worth: the smallest of them
  // is still more than a tenth of the board across.
  const stage = await evaluate(`document.querySelector('#stage').getBoundingClientRect().width`);
  const smallest = Math.min(...bubbles.map((b) => b.size));
  check(
    `every bubble is big enough to hit (${((smallest / stage) * 100).toFixed(0)}% of the board)`,
    smallest / stage >= 0.1,
  );
  await shot("01-level1-bubbles");

  // There is no way to be wrong here: a touch that lands on nothing does
  // nothing at all, and there is nothing to drop in the wrong place.
  const nowhere = await emptySpotOnBoard();
  check("there is empty sky to touch", nowhere !== null);
  if (nowhere) {
    await tapAt(nowhere.x, nowhere.y);
    check("touching nothing does nothing", (await activityProgress()).touched === 0);
  }

  // And no way to get stuck: pop them and more arrive.
  const pops = await playActivity({ shotAt: { after: 3, name: "02-level1-popping" } });
  const popped = await activityProgress();
  check(`the level finishes on touches alone (${pops.taps} taps)`, popped.touched >= popped.goal);
  check(`every touch on a bubble popped it (${pops.missed} missed)`, pops.missed === 0);
  check("finish button appears when complete", (await finishButtons()) === 1);
  check("level 1 offers the next puzzle", (await finishLabel()) === "Next puzzle");
  const refilled = await thingsToTouch();
  check(`bubbles keep arriving (${refilled.length} still afloat)`, refilled.length >= 1);

  // --- level 2: the first drag ----------------------------------------------
  // One huge animal, one huge hole: the smallest drag the game can ask for,
  // and it comes after a level that needed no drag at all.
  await pressFinishButton();
  check("moves on to level 2", (await levelNumber()) === 2);
  check("level 2 is dragged", (await kindName()) === "shape-match");
  const firstCount = await pieceCount();
  check(`level 2 is a single huge piece (${firstCount})`, firstCount === 1);
  check("every piece has a hole", (await holeCount()) === firstCount);
  await dragAnimal((await animalsOnBoard())[0], { pauseAtHalfway: () => shot("03-level2-drag") });
  check("dragged piece snapped into its hole", (await placedCount()) === 1);
  await sleep(700);
  check("level 2 can be completed", (await placedCount()) === firstCount);

  // --- level 3: peekaboo ----------------------------------------------------
  // A bush per animal, and a touch takes the bush away. What has been uncovered
  // stays uncovered; nothing can be covered up again by mistake.
  await pressFinishButton();
  check("moves on to level 3", (await levelNumber()) === 3);
  check("level 3 is played by touching", (await kindName()) === "play");
  check("level 3 is peekaboo", (await activityName()) === "peekaboo");
  check("peekaboo has nothing in a tray either", (await pieceCount()) === 0);
  const hidden = await activityProgress();
  const bushes = await thingsToTouch();
  check(`a bush for each animal to find (${bushes.length})`, bushes.length >= hidden.goal);
  await shot("04-level3-peekaboo");
  const uncovered = await playActivity();
  const found = await activityProgress();
  check(`peekaboo finishes on touches alone (${uncovered.taps} taps)`, found.touched >= found.goal);
  check(`every touch uncovered an animal (${uncovered.missed} missed)`, uncovered.missed === 0);
  check("peekaboo offers the next puzzle", (await finishLabel()) === "Next puzzle");
  await shot("05-level3-uncovered");

  // --- level 4: two animals, and a drop that must not stick -----------------
  await pressFinishButton();
  check("moves on to level 4", (await levelNumber()) === 4);
  const secondCast = await animalsOnBoard();
  check("level 4 deals two different animals", new Set(secondCast).size === 2);
  check("level 4 starts empty", (await placedCount()) === 0);

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
  check("level 4 can be completed", (await placedCount()) === 2);

  // --- level 5: a scene where everything answers ----------------------------
  // The animals, the sun and the clouds all do something when they are touched,
  // and there are more of them than the level asks for, so a child who ignores
  // one is not stuck with it.
  await pressFinishButton();
  check("moves on to level 5", (await levelNumber()) === 5);
  check("level 5 is played by touching", (await kindName()) === "play");
  check("level 5 is the scene that answers", (await activityName()) === "alive");
  const scene = await activityProgress();
  const alive = await thingsToTouch();
  check(
    `more things answer than the level asks for (${alive.length} for ${scene.goal})`,
    alive.length > scene.goal,
  );
  check(
    "the sun and the clouds answer too",
    ["sun", "cloud"].every((what) => alive.some((thing) => thing.touch === what)),
  );
  await shot("07-level5-alive");
  const answers = await playActivity();
  const done = await activityProgress();
  check(`the scene finishes on touches alone (${answers.taps} taps)`, done.touched >= done.goal);
  check(`everything touched answered (${answers.missed} missed)`, answers.missed === 0);
  check("touching one thing twice does not undo it", done.touched <= alive.length);

  // --- the end of chapter 1: balloons ---------------------------------------
  // The first of the five chapter moments. It has to be bigger than the 700 ms
  // sparkle every other level ends with, and it has to be *played*: a
  // two-year-old will not sit through a cutscene, they will put a finger on it.
  check("finishing a chapter raises a celebration", (await celebrationName()) === "balloons");
  check("the celebration starts with nothing played with", (await celebrationPlayed()) === 0);
  // The beat. By level 25 the big yellow button is the most conditioned thing on
  // the screen, so at the end of a chapter it arrives rather than sitting there
  // - and for that first moment the only thing on offer is something to play
  // with.
  check("the celebration has the screen to itself first", (await finishButtons()) === 0);
  const openingBalloons = await celebrationThings();
  check(
    `there is already something to pop in that first moment (${openingBalloons.length})`,
    openingBalloons.length >= 4,
  );
  await shot("07a-chapter1-first-instant");
  // Popping works before the way out has arrived, or the beat would be a wait.
  const early = await playCelebration(1);
  check("the first instant already answers a finger", early.answered === 1);

  check(
    "the way onwards arrives on its own",
    (await waitForFinishButton()) === true && (await finishButtons()) === 1,
  );
  check("the first chapter still offers the next puzzle", (await finishLabel()) === "Next puzzle");

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
  await shot("07b-chapter1-balloons");

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
  check("the celebration never takes the level away", (await levelNumber()) === 5);
  check("the way onwards is still there after playing", (await finishButtons()) === 1);
  await shot("07c-chapter1-balloons-popped");

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
  await sleep(700);
  check("the celebration survives a rotation", (await celebrationName()) === "balloons");
  check("a rotation keeps what was played with", (await celebrationPlayed()) === playedBeforeTurn);
  check("a rotation keeps the way onwards", (await finishButtons()) === 1);
  await setViewport(1280, 800);
  await sleep(700);

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

  await holdGrownUps({ pauseAtHalfway: () => shot("08-grownups-hold") });
  check("holding the button opens the panel", (await panelIsOpen()) === true);
  const map = await levelSquares();
  check(`the level map shows all thirty levels (${map.total})`, map.total === 30);
  check(`the map marks the six levels played (${map.reached})`, map.reached === 6);
  check("the map marks the level being played", map.current === 6);
  const options = await panelOptions();
  check(
    `the panel offers exactly the options that do something (${options.join(", ")})`,
    JSON.stringify(options) === JSON.stringify(["Sound", "Idle hints", "Start again"]),
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

  // --- the idle hint --------------------------------------------------------
  // The anti-frustration valve, and the one part of the game that happens when
  // nothing happens - so it cannot be checked any other way than by leaving a
  // real board alone in a real browser. Driven from the panel, on "Sooner", so
  // the run waits seconds rather than a quarter of a minute. See src/hint.ts.
  await holdGrownUps();
  await pressInPanel('.grownups-choice[data-value="sooner"]');
  await pressInPanel(".grownups-done");
  check("nothing glows the instant the panel closes", (await hintOnBoard()) === null);

  const glow = await hintAfterAWhile();
  check(`a board left alone gets a hint (${glow ? glow.piece : "nothing glowed"})`, glow !== null);
  if (glow) {
    check(`the hint points at both ends (${glow.marks} marks)`, glow.marks === 2);
    // A filled target in this game is an opaque animal in its hole. The hint is
    // stroke only, so it cannot be mistaken for one.
    check(`nothing about the hint is filled in (${glow.filled} filled shapes)`, glow.filled === 0);
    check("the hint is about a piece still waiting", glow.placed === false);
    const onTarget = glow.bright && glow.hole ? away(glow.bright, glow.hole) : Infinity;
    const tolerance = glow.hole ? Math.max(glow.hole.width, glow.hole.height) * 0.08 : 0;
    check(
      `the bright end sits on that piece's hole (${onTarget.toFixed(1)}px out of ${tolerance.toFixed(1)} allowed)`,
      onTarget <= tolerance,
    );
    const onPiece = glow.quiet && glow.waiting ? away(glow.quiet, glow.waiting) : Infinity;
    check(
      `the quiet end sits under the piece it means (${onPiece.toFixed(1)}px out of ${tolerance.toFixed(1)} allowed)`,
      onPiece <= tolerance,
    );
  }
  await shot("09b-idle-hint");

  // Any interaction at all takes it down, including one that achieves nothing.
  await tapEmptySpot();
  check("a touch anywhere takes the hint away", (await hintOnBoard()) === null);
  const again = await hintAfterAWhile();
  check("and it comes back if the child goes quiet again", again !== null);

  // A piece going home is progress, so the hint goes with it.
  if (again) await dragAnimal(again.piece);
  check("placing a piece takes the hint away", (await hintOnBoard()) === null);
  check("the hinted piece was one that fitted", (await placedCount()) === 1);

  // A level played by touching has no tray, no target and no wrong place: a
  // finger anywhere already lands on something that answers, so there is
  // nothing for a hint to point at. See docs/decisions/20260730T213000.
  await goToLevel(3);
  check("level 3 is played by touching", (await kindName()) === "play");
  const onTouchLevel = await hintAfterAWhile();
  check("a level played by touching is never hinted at", onTouchLevel === null);

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
  await shot("10-level10-start");

  await dragAnimal(busyCast[0]);
  await dragAnimal(busyCast[1]);
  check("the pieces snap into their holes", (await placedCount()) === 2);
  await shot("11-level10-two-placed");

  // Rotating mid-puzzle must reflow and keep progress.
  await setViewport(480, 900);
  await sleep(600);
  check("switches to the portrait layout", (await layoutName()) === "portrait");
  check("rotation preserves placed pieces", (await placedCount()) === 2);
  check("rotation stays on the same level", (await levelNumber()) === 10);
  await shot("12-portrait-level10");

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
  await shot("13-portrait-complete");

  // --- the end of chapter 2: a parade ---------------------------------------
  // The animals just matched walk across the board, and every one of them hops
  // and sings when it is poked. In portrait as it happens, which is the point:
  // a celebration is composed from the layout like everything else.
  check("finishing chapter 2 raises the parade", (await celebrationName()) === "parade");
  check("the parade has the screen to itself first", (await finishButtons()) === 0);
  const marchers = await evaluate(
    `[...document.querySelectorAll('#stage .celebration [data-piece]')].map((el) => el.dataset.piece)`,
  );
  check(
    `every animal just placed is parading, once each (${marchers.length})`,
    marchers.length === 6 && new Set(marchers).size === 6,
  );
  const hops = await playCelebration(3);
  check(`a poked animal answers (${hops.missed} missed)`, hops.missed === 0);
  check("the parade lets the way onwards through", (await waitForFinishButton()) === true);
  check("a middle level offers the next puzzle", (await finishLabel()) === "Next puzzle");
  // A celebration is never interrupted by a hint. The board it was armed
  // against finished before the parade was built, and the hint went with it.
  const duringParade = await hintAfterAWhile();
  check("nothing is hinted at during a celebration", duringParade === null);
  await shot("13b-chapter2-parade");

  // Hints back off, so the rest of the run's screenshots show the levels rather
  // than a glow that happened to be due when the shutter went.
  await holdGrownUps();
  await pressInPanel('.grownups-choice[data-value="off"]');
  await pressInPanel(".grownups-done");

  // --- level 30: the last one, and the loop back ---------------------------
  await setViewport(1280, 800);
  // A whole level has just been played from `?level=`, which is a tool for
  // working on the game rather than a way into it: the place the child had got
  // to is exactly where they left it.
  await reopenTheGame();
  check("a level played from ?level= leaves the saved level alone", (await levelNumber()) === 6);
  // --- level 14: one animal, arriving in four slices -----------------------
  // The first level of the game that asks for a picture rather than a match:
  // four pieces, one hole, and the hole stays visible underneath as the guide
  // to what is being built.
  await goToLevel(14);
  check("jumps to level 14", (await levelNumber()) === 14);
  check("the sliced kind plays its own levels", (await kindName()) === "sliced");
  const sliceCast = await animalsOnBoard();
  check("level 14 deals four slices", sliceCast.length === 4);
  check("four slices, one hole", (await holeCount()) === 1);
  check("every slice is a slice of the same animal", new Set(sliceCast.map(holeFor)).size === 1);
  await shot("14-level14-sliced");

  await dragAnimal(sliceCast[0]);
  await dragAnimal(sliceCast[1]);
  check("a slice settles into its animal's hole", (await placedCount()) === 2);
  await shot("15-level14-half-built");

  await solveRemaining();
  check("the animal can be put back together", (await placedCount()) === 4);
  await shot("16-level14-assembled");

  // --- levels 16-20: a picture built out of plain shapes -------------------
  // The chapter where several pieces make one thing and each piece is still a
  // whole shape a child can name. Level 16 is three shapes; level 20 is six,
  // and is where the rule this chapter exists for is exercised: two shapes the
  // same fill either of their shadows.
  await goToLevel(16);
  check("jumps to level 16", (await levelNumber()) === 16);
  check("the polygon kind plays its own levels", (await kindName()) === "polygon");
  check("level 16 is in the shapes chapter", (await chapterName()) === "shapes");
  check("level 16 deals three shapes", (await pieceCount()) === 3);
  check("one shadow per shape", (await holeCount()) === 3);
  await shot("17-level16-shapes");
  await solveRemaining();
  check("a picture of three shapes can be built", (await placedCount()) === 3);
  await shot("18-level16-built");

  await goToLevel(20);
  check("jumps to level 20", (await levelNumber()) === 20);
  const shapeCast = await animalsOnBoard();
  check("level 20 deals six shapes", shapeCast.length === 6);
  check("six shapes, six shadows, one picture", (await holeCount()) === 6);
  check(
    "every shape belongs to the same picture",
    new Set(shapeCast.map((id) => id.split(":")[1])).size === 1,
  );
  await shot("19-level20-shapes");

  // Portrait as well, because a picture is one target with several pieces and
  // the tray is what holds it down: the orientation that stacks the tray is
  // where a scene would be squeezed if any of it were composed wrongly.
  await setViewport(480, 900);
  await sleep(600);
  check("a picture composes in portrait too", (await layoutName()) === "portrait");
  check("portrait keeps all six shadows", (await holeCount()) === 6);
  await shot("20-level20-portrait");
  await setViewport(1280, 800);
  await sleep(600);

  // Two shapes the same, and the child aims one of them at the other's shadow.
  // Being told "no" for a placement that is visibly right is the one thing this
  // must never do, so the piece is taken and the picture rearranges itself.
  const [oneShape, itsTwin] = (await twinShapes()) ?? [];
  check("a picture of six shapes has two the same in it", Boolean(oneShape && itsTwin));
  const twinShadow = await centreOf(`.hole[data-piece="${itsTwin}"]`);

  // A hint here must offer *both* shadows a twin could fill. Naming one of two
  // equally right places would teach a rule the game does not have - and the
  // child being hinted at is the least able to find that out. So hints go back
  // on for one check, aimed at a piece with a twin by touching it first.
  const ownShadow = await centreOf(`.hole[data-piece="${oneShape}"]`);
  await holdGrownUps();
  await pressInPanel('.grownups-choice[data-value="sooner"]');
  await pressInPanel(".grownups-done");
  const grabbed = await drawingCentreOf(oneShape);
  await tapAt(grabbed.x, grabbed.y);
  check("a drag that goes nowhere leaves the board alone", (await placedCount()) === 0);
  const choice = await hintAfterAWhile();
  check(
    `the hint follows the piece last touched (${choice ? choice.piece : "nothing glowed"})`,
    choice?.piece === oneShape,
  );
  const offered = choice?.brights ?? [];
  const couldTake = (await placesFor(oneShape)) ?? [];
  check(
    `every place that would take it is offered, and nothing else (${offered.length} bright for ${couldTake.length} free places)`,
    couldTake.length > 1 && offered.length === couldTake.length,
  );
  for (const [name, shadow] of [
    ["its own", ownShadow],
    ["its twin's", twinShadow],
  ]) {
    let closest = null;
    let nearest = Infinity;
    for (const mark of offered) {
      const gap = away(mark, shadow);
      if (gap < nearest) {
        nearest = gap;
        closest = mark;
      }
    }
    // Measured against the mark's own size: it is the shadow's outline
    // *stroked*, so it is bigger than the shadow but concentric with it.
    const room = closest ? Math.max(closest.width, closest.height) * 0.12 : 0;
    check(
      `${name} shadow is one of the places offered (${nearest.toFixed(1)}px out of ${room.toFixed(1)} allowed)`,
      nearest <= room,
    );
  }
  await shot("19b-idle-hint-every-place");
  await holdGrownUps();
  await pressInPanel('.grownups-choice[data-value="off"]');
  await pressInPanel(".grownups-done");

  await dragAnimal(oneShape, { onto: itsTwin });
  check("a shape is taken by its twin's shadow", (await placedCount()) === 1);
  const landed = await drawingCentreOf(oneShape);
  const drift = Math.hypot(landed.x - twinShadow.x, landed.y - twinShadow.y);
  check(`it settles where it was aimed (${drift.toFixed(1)}px out)`, drift < 2);
  const owners = await shadowOwners();
  check("the shadows still name one shape each", new Set(owners).size === 6);
  check("the shape it displaced is now expected elsewhere", owners.includes(itsTwin));
  await shot("21-level20-swapped");

  await solveRemaining();
  check("the picture finishes however the twins were shared out", (await placedCount()) === 6);
  await shot("22-level20-built");

  // --- the end of chapter 4: a rainbow --------------------------------------
  // The one celebration the child *makes*. A tap anywhere paints the next arc,
  // and an arc arrives by itself every second or two - so it draws itself for a
  // child who is only watching, and is painted by a child who is not.
  check("finishing chapter 4 raises the rainbow", (await celebrationName()) === "rainbow");
  const arcsAtFirst = await evaluate(
    `document.querySelectorAll('#stage .celebration .rainbow-arc').length`,
  );
  const skyToTap = await celebrationThings();
  check(
    "the whole sky is the target",
    skyToTap.some((thing) => thing.touch === "sky"),
  );
  await playCelebration(4);
  const arcsAfter = await evaluate(
    `document.querySelectorAll('#stage .celebration .rainbow-arc').length`,
  );
  check(`tapping paints arcs (${arcsAtFirst} to ${arcsAfter})`, arcsAfter > arcsAtFirst);
  await sleep(2200);
  const arcsAlone = await evaluate(
    `document.querySelectorAll('#stage .celebration .rainbow-arc').length`,
  );
  check(`an arc arrives even if nobody taps (${arcsAlone})`, arcsAlone > arcsAfter);
  check("the rainbow lets the way onwards through", (await waitForFinishButton()) === true);
  await shot("22b-chapter4-rainbow");

  // --- level 21: a picture cut up -------------------------------------------
  // The jigsaw chapter. One picture is one hole however many pieces it is in,
  // and the picture stays under the empty frame so the child can see what they
  // are making - a blank frame at two years old is a memory game.
  await goToLevel(21);
  check("jumps to level 21", (await levelNumber()) === 21);
  check("level 21 is a jigsaw", (await kindName()) === "jigsaw");
  const jigsawPieces = await pieceCount();
  check(`a 2x2 board deals four pieces (${jigsawPieces})`, jigsawPieces === 4);
  check("four pieces, one picture to build them in", (await holeCount()) === 1);
  check("every piece has a cut of its own in the guide", (await cutsInGuide()) === jigsawPieces);
  check("the picture shows under the empty frame", await guideIsShowing());
  // The picture takes the board rather than standing in the middle of it, and
  // what is left over is the page's own colour rather than a landscape. Both
  // are only visible on a rendered board; see decision 20260730T230000.
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
  await shot("23-level21-jigsaw");

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
  await shot("24-level21-first-piece");

  await solveRemaining();
  check("a jigsaw can be finished", (await placedCount()) === jigsawPieces);
  check("the guide goes once the picture is whole", !(await guideIsShowing()));
  await shot("25-level21-built");

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
  await shot("28-level26-built");

  // --- the ends of chapters 3 and 5 -----------------------------------------
  // Blossom over the animal that has just been put back together, and fireworks
  // over the picture that has just been finished. Both are here to be looked at
  // as much as checked: a celebration that has gone wrong is something a person
  // sees in the contact sheet long before a check catches it.
  await goToLevel(15);
  await solveRemaining();
  check("finishing chapter 3 raises the petals", (await celebrationName()) === "petals");
  const blossom = await celebrationThings();
  check(`blossom is falling to be caught (${blossom.length})`, blossom.length >= 6);
  check("the blossom has the screen to itself first", (await finishButtons()) === 0);
  const caught = await playCelebration(3);
  check(`a caught petal scatters (${caught.missed} missed)`, caught.missed === 0);
  check("blossom lets the way onwards through", (await waitForFinishButton()) === true);
  await shot("28b-chapter3-petals");

  await goToLevel(25);
  await solveRemaining();
  check("finishing chapter 5 raises the fireworks", (await celebrationName()) === "fireworks");
  check("the night sky falls over the finished picture", (await nightHasFallen()) === true);
  // A tap anywhere sets one off there, in the tick the finger landed. Three
  // spread across the sky, and the shot taken while they are still open.
  const board25 = await evaluate(`
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
    await tapAt(board25.x + fx * board25.w, board25.y + fy * board25.h);
  }
  check("a tap anywhere sets one off", (await celebrationPlayed()) === beforeBangs + 3);
  check("the night lets the way onwards through", (await waitForFinishButton()) === true);
  await shot("28c-chapter5-fireworks");

  await goToLevel(30);
  check("jumps to the last level", (await levelNumber()) === 30);
  check("the last level is in the mastery chapter", (await chapterName()) === "mastery");
  const lastDots = await chapterDots();
  check(`every chapter dot filled on level 30 (${lastDots.filled})`, lastDots.filled === 6);
  const lastCount = await pieceCount();
  await shot("29-level30-start");

  await solveRemaining();
  check("the last level can be completed", (await placedCount()) === lastCount);
  await shot("30-level30-complete");

  // --- the finale -----------------------------------------------------------
  // Thirty levels finished. This used to be an arrow that looped silently back
  // to level 1, which told a child who had played the whole game that nothing
  // had happened. It is now every celebration at once - a rainbow, balloons,
  // blossom, fireworks, and a parade of the animals - and unlike the five
  // chapter moments it never winds down. The end of the game is a room to stay
  // in rather than a wall, and the way out is the same big button the child has
  // pressed at the end of all thirty levels.
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
  check("looping back starts the bubbles again", (await activityName()) === "bubbles");
  check("looping back forgets what was touched", (await activityProgress()).touched === 0);
  check("looping back takes the finale away", (await celebrationName()) === "");
  await shot("31-looped-back");

  // --- a fresh deal every time ---------------------------------------------
  // Reset on a touch level has to take the old bubbles away with it, or the
  // level would go on filling up with the last board's.
  const beforeReset = await thingsToTouch();
  await tapAt(beforeReset[0].x, beforeReset[0].y);
  check("a bubble popped before the reset counted", (await activityProgress()).touched === 1);
  await evaluate(`document.querySelector('.reset-button').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )`);
  await sleep(600);
  check("reset deals a fresh puzzle", (await placedCount()) === 0);
  check("reset keeps the level", (await levelNumber()) === 1);
  check("reset starts the touching over", (await activityProgress()).touched === 0);
  const afterReset2 = await thingsToTouch();
  check(
    `reset leaves one screenful of bubbles, not two (${afterReset2.length})`,
    afterReset2.length >= 1 && afterReset2.length <= 8,
  );

  const castForSeed = async (seed) => {
    await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?level=10&seed=${seed}` });
    await sleep(800);
    return (await animalsOnBoard()).join();
  };
  check("the same seed deals the same puzzle", (await castForSeed(SEED)) === busyCast.join());
  const deals = new Set();
  for (const seed of [11, 22, 33, 44, 55, 66]) deals.add(await castForSeed(seed));
  check(`different seeds deal different puzzles (${deals.size} of 6)`, deals.size >= 4);
  await shot("32-another-deal");

  // --- a touch level held the other way up ---------------------------------
  // A tablet gets turned. A touch level has no tray to reflow, so what has to
  // hold is that everything is still on the board and still big enough to hit.
  await setViewport(700, 1000);
  await goToLevel(5);
  check("the scene composes in portrait too", (await layoutName()) === "portrait");
  const turned = await thingsToTouch();
  const turnedGoal = (await activityProgress()).goal;
  check(
    `portrait keeps everything in reach (${turned.length} for ${turnedGoal})`,
    turned.length > turnedGoal,
  );
  const turnedStage = await evaluate(
    `document.querySelector('#stage').getBoundingClientRect().width`,
  );
  check(
    "portrait keeps every target big enough to hit",
    Math.min(...turned.map((thing) => thing.size)) / turnedStage >= 0.1,
  );
  await shot("33-portrait-alive");
  const turnedPlay = await playActivity();
  check(
    `a touch level finishes in portrait too (${turnedPlay.taps} taps)`,
    (await activityProgress()).touched >= turnedGoal,
  );
  check(`every touch answered in portrait (${turnedPlay.missed} missed)`, turnedPlay.missed === 0);

  // --- what happens when a chunk is not there -------------------------------
  // The game is split by chapter, and `warm.ts` fetches every chunk during the
  // first level so a seam never waits. Both halves of that are claims about
  // conditions nobody meets by accident, so this makes them: the network is cut
  // outright, and a chunk is blocked outright. See
  // decision 20260729T223500, both halves of it.
  await setViewport(1280, 800);
  await send("Network.enable");

  // 1. Once the warm has finished, the rest of the game needs no network at
  //    all. This is the property the split has to have; without it a child on a
  //    train would stall at a chapter boundary.
  await reopenTheGame();
  await sleep(2500);
  const beforeCut = await resourceCount();
  await setOffline(true);
  const offlineChapters = [];
  for (const level of [12, 17, 22, 27]) {
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
  await jumpToLevelFromPanel(15);
  const beforeSeam = {
    level: await levelNumber(),
    kind: await kindName(),
    pieces: await pieceCount(),
  };
  check("the board before the missing chunk is whole", beforeSeam.pieces > 0);
  // Offline, so the game waits for the connection rather than reloading into
  // the same failure. This is the state a child would actually be looking at.
  await setOffline(true);
  await jumpToLevelFromPanel(16);
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
  const cameBack = await waitForLevel(16, 12000);
  check(`the game comes back by itself when the network does (level ${cameBack})`, cameBack === 16);
  check("and on the kind that was missing", (await kindName()) === "polygon");
  await shot("36-chunk-arrived-after-reconnect");

  // --- the iPad, at its real sizes ------------------------------------------
  // iPad is the target device. The board is one of two fixed canvases scaled to
  // the viewport with `meet`, so the device's aspect ratio only chooses
  // portrait or landscape and the rest is letterbox. That is easy to reason
  // about wrongly, so this drives Chromium to the real iPad point sizes and
  // looks: the whole board on screen, a piece still a tenth of the short side
  // once the letterbox scale is applied, and how much of the screen is left as
  // letterbox. A 4:3 iPad in portrait pillarboxes the 1:1.7 canvas - the floors
  // hold, but the sides go spare - which is a thing to see rather than to hide.
  // Split View is the narrow width a multitasking iPad can hand the game, and
  // the case most likely to break a layout. See the iPad decision record.
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
  ];
  for (const [name, width, height, orientation] of iPads) {
    await setViewport(width, height);
    await goToLevel(10);
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
    // Portrait on a 4:3 iPad pillarboxes the 1:1.7 canvas, so the sides go
    // spare; landscape nearly fills. Reported so the letterbox is a number a
    // reviewer can see next to the screenshot, not a surprise.
    check(
      `${name}: board covers ${(board.coverage * 100).toFixed(0)}% of the screen`,
      board.coverage >= 0.55,
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
  await goToLevel(10);
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
  await sleep(150);
  const afterInset = await evaluate(`
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

  // --- the sample still covers the game -------------------------------------
  // Everything above samples the thirty levels rather than playing them in
  // order, which is what keeps this run to a few minutes. But the sample is a
  // hand-written list of level numbers, and a hand-written sample rots quietly:
  // nothing above fails when a seventh kind is added, when a chapter's kind is
  // retuned out of the shots, or when a celebration is never reached. The run
  // would go on passing while exercising less and less of the game. So the
  // sample is held against the table it is meant to sample - what must be
  // covered read from the source of truth, what was covered taken from what the
  // live app reported putting on screen as the run played. See
  // docs/decisions/20260730T005900-guard-the-sample-against-the-table.md.
  const required = requiredCoverage();

  // Anti-vacuity first. A coverage check that requires nothing passes while
  // inspecting nothing, so this earns the right to be trusted: the requirement
  // is non-empty, the parse saw the whole table (its row count matches the live
  // level map), and the app never reported a kind or chapter the parse did not
  // know about - none of which an empty or garbled parse could survive.
  await holdGrownUps();
  const liveLevelCount = await evaluate(`document.querySelectorAll('.grownups-level').length`);
  await pressInPanel(".grownups-done");
  check(
    `coverage: the table parses to a real requirement (${required.kinds.size} kinds, ${required.chapters.size} chapters, ${required.celebrations.size} celebrations)`,
    required.kinds.size >= 2 && required.chapters.size >= 2 && required.celebrations.size >= 2,
  );
  check(
    `coverage: the parse saw every level (${required.rows.length} parsed, ${liveLevelCount} in the level map)`,
    liveLevelCount > 0 && required.rows.length === liveLevelCount,
  );
  const strays = [
    ...[...coveredKinds].filter((k) => !required.kinds.has(k)),
    ...[...coveredChapters].filter((c) => !required.chapters.has(c)),
    ...[...coveredCelebrations].filter((c) => !required.celebrations.has(c)),
  ];
  check(
    `coverage: everything the run saw is named by the table (${strays.join(", ") || "no strays"})`,
    strays.length === 0,
  );

  // The guard itself: every kind, chapter and celebration the table names was
  // put on screen by the sample. A miss names the thing and the level that would
  // cover it, so closing the gap is a line rather than a hunt.
  const missingKinds = [...required.kinds].filter(([kind]) => !coveredKinds.has(kind));
  check(
    `coverage: every puzzle kind is exercised (${missingKinds.map(([k, l]) => `${k} @ level ${l}`).join(", ") || `all ${required.kinds.size}`})`,
    missingKinds.length === 0,
  );
  const missingChapters = [...required.chapters].filter(
    ([chapter]) => !coveredChapters.has(chapter),
  );
  check(
    `coverage: every chapter is exercised (${missingChapters.map(([c, l]) => `${c} @ level ${l}`).join(", ") || `all ${required.chapters.size}`})`,
    missingChapters.length === 0,
  );
  const missingCelebrations = [...required.celebrations].filter((c) => !coveredCelebrations.has(c));
  check(
    `coverage: every celebration is played (${missingCelebrations.join(", ") || `all ${required.celebrations.size}`})`,
    missingCelebrations.length === 0,
  );
} finally {
  browser.close();
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
