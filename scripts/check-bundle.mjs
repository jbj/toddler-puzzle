/**
 * The bundle budget.
 *
 * "Nothing to download and nothing to fail to load" is a stated property of
 * this game, not an accident: a two-year-old's iPad should reach the first
 * level immediately. Nothing was measuring that, so it drifted - the bundle was
 * 24 kB when the ramp was five levels of one kind, and 142 kB by the time six
 * chapters, five kinds, a scene library, six celebrations and a vocabulary of
 * sounds had all landed. Every one of those was a good change. Together they
 * were a regression nobody decided on.
 *
 * So this holds the build to four numbers, and prints the table whether it
 * passes or fails, because the point is to make the size visible rather than to
 * catch somebody out:
 *
 *   npm run budget          # against the last build
 *   npm run build           # runs it, and fails on it
 *
 * It reads `.art/bundle.json`, written by the `bundle-report` plugin in
 * `vite.config.ts`, which is where the import graph is known. See
 * [decision 20260729T223500](../docs/decisions/20260729T223500-a-chapter-is-warmed-before-it-is-needed.md)
 * for why the initial figure is the one that matters and the total is still
 * worth watching.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPORT = fileURLToPath(new URL("../.art/bundle.json", import.meta.url));

/** A kilobyte, counted the way `vite build` counts it, so the two agree. */
const kB = 1000;

/**
 * The budgets, in bytes.
 *
 * **initial** is what a child downloads and parses before the first level can
 * appear: `index.html`, the stylesheet in its head, the entry chunk and
 * everything the entry imports statically. This is the number the game is
 * actually judged on, and the one code-splitting exists to hold down.
 *
 * **total** is everything the build produced, including the chapter chunks that
 * arrive later. It is a slower-moving number and a laxer one, but it is not
 * unlimited: every byte of it is still fetched during the first sitting, so a
 * chapter that doubled would be felt by a child on a slow connection.
 *
 * `gzip` is what actually crosses the network; `raw` is what the device has to
 * parse, which is the part that costs a mid-range iPad time. Both are budgeted
 * because either can grow without the other.
 *
 * Each figure is the measurement at the time it was set, rounded up with about
 * a tenth of headroom - enough that an ordinary change does not have to touch
 * this file, and little enough that a chapter's worth of new art does.
 *
 * Raising one is allowed. Raising one *quietly* is not: say in the pull request
 * what grew and why it was worth it. Never lower the amount of art the game
 * needs, or weaken a check, to stay underneath. If the truth does not fit, the
 * budget is wrong - move it, and say so.
 */
const BUDGET = {
  // measured 2026-07-29: 92.7 kB raw, 30.1 kB gzipped
  initialRaw: 102 * kB,
  initialGzip: 33 * kB,
  // measured 2026-07-29: 152.1 kB raw, 51.8 kB gzipped
  totalRaw: 167 * kB,
  totalGzip: 57 * kB,
};

/** How many of a chunk's biggest modules to name when a budget is blown. */
const CULPRITS = 6;

function readReport() {
  try {
    return JSON.parse(readFileSync(REPORT, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`No bundle report at ${REPORT}.\nRun \`npm run build\` first.`);
      process.exit(1);
    }
    throw error;
  }
}

const report = readReport();
const byFile = new Map(report.files.map((file) => [file.file, file]));

const entry = report.files.find((file) => file.isEntry);
if (!entry) {
  console.error("The build produced no entry chunk, which cannot be right.");
  process.exit(1);
}

/**
 * Everything the browser has to have before the first level can be drawn.
 *
 * Static imports only: a dynamic import is a chunk that arrives later, which is
 * the whole point of splitting. `index.html` and the stylesheet it links are
 * part of it too - the page waits for both.
 */
function initialFiles() {
  const found = new Set();
  const queue = [entry.file];
  while (queue.length > 0) {
    const name = queue.pop();
    if (found.has(name)) continue;
    found.add(name);
    const file = byFile.get(name);
    if (!file) continue;
    for (const css of file.css) found.add(css);
    queue.push(...file.imports);
  }
  for (const file of report.files) {
    if (file.file.endsWith(".html")) found.add(file.file);
  }
  return found;
}

const initial = initialFiles();
const isInitial = (file) => initial.has(file.file);

const sum = (files, field) => files.reduce((total, file) => total + file[field], 0);
const size = (bytes) => `${(bytes / kB).toFixed(1)} kB`;
const pad = (text, width) => text.padStart(width);

function table(title, files) {
  if (files.length === 0) return;
  console.log(`\n${title}`);
  for (const file of [...files].sort((a, b) => b.bytes - a.bytes)) {
    console.log(`  ${file.file.padEnd(34)}${pad(size(file.bytes), 10)}${pad(size(file.gzip), 10)}`);
  }
}

const initialSet = report.files.filter(isInitial);
const deferred = report.files.filter((file) => !isInitial(file));

console.log("what a child downloads before the first level appears");
table("  loaded first", initialSet);
console.log(
  `\n  ${"initial".padEnd(34)}${pad(size(sum(initialSet, "bytes")), 10)}${pad(size(sum(initialSet, "gzip")), 10)}`,
);

if (deferred.length > 0) {
  console.log("\nwhat arrives later, warmed while the child is playing");
  table("  deferred", deferred);
  console.log(
    `\n  ${"deferred".padEnd(34)}${pad(size(sum(deferred, "bytes")), 10)}${pad(size(sum(deferred, "gzip")), 10)}`,
  );
}

console.log(
  `\n  ${"total".padEnd(34)}${pad(size(sum(report.files, "bytes")), 10)}${pad(size(sum(report.files, "gzip")), 10)}`,
);

// --- the budgets -----------------------------------------------------------

const measurements = [
  { label: "initial, raw", used: sum(initialSet, "bytes"), budget: BUDGET.initialRaw },
  { label: "initial, gzipped", used: sum(initialSet, "gzip"), budget: BUDGET.initialGzip },
  { label: "total, raw", used: sum(report.files, "bytes"), budget: BUDGET.totalRaw },
  { label: "total, gzipped", used: sum(report.files, "gzip"), budget: BUDGET.totalGzip },
];

console.log("");
const over = [];
for (const { label, used, budget } of measurements) {
  const ok = used <= budget;
  if (!ok) over.push({ label, used, budget });
  const share = Math.round((used / budget) * 100);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label.padEnd(20)}${pad(size(used), 10)} of ${size(budget)} (${share}%)`,
  );
}

if (over.length === 0) {
  console.log("\nWithin budget.");
  process.exit(0);
}

// --- what grew -------------------------------------------------------------

console.log("\nThe biggest things in the bundle, largest first:");
const culprits = over.some(({ label }) => label.startsWith("initial")) ? initialSet : report.files;
const modules = culprits
  .flatMap((file) => file.modules.map((module) => ({ ...module, file: file.file })))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, CULPRITS);
for (const module of modules) {
  console.log(`  ${module.id.padEnd(40)}${pad(size(module.bytes), 10)}  in ${module.file}`);
}
console.log("  (measured before minification, so good for comparing, not for adding up)");

console.log(
  `\n${over.length} budget${over.length === 1 ? "" : "s"} exceeded:\n` +
    over
      .map(({ label, used, budget }) => `  ${label} is ${size(used - budget)} over ${size(budget)}`)
      .join("\n") +
    "\n\nEither make it smaller, or raise the budget in scripts/check-bundle.mjs and say" +
    "\nin the pull request what grew and why it earned the space.",
);
process.exit(1);
