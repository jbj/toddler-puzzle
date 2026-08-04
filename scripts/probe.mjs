/**
 * Ask the real game one small geometry question without writing a test to do it.
 *
 * Vite is the loader because the game is TypeScript and its shapes import SVG
 * source. Starting it in middleware mode gives this script the same transformed
 * modules as the application without opening a port or adding another tool to
 * the repository.
 */
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const MODULE_PATHS = {
  assets: "/src/assets.ts",
  geometry: "/src/geometry.ts",
  jigsaw: "/src/jigsaw.ts",
  layout: "/src/layout.ts",
  levels: "/src/levels.ts",
  pictures: "/src/pictures.ts",
  piece: "/src/piece.ts",
  registry: "/src/kinds/registry.ts",
  scenes: "/src/scenes.ts",
  shatter: "/src/shatter.ts",
  slices: "/src/slices.ts",
};

const HELP = `Usage:
  npm run probe -- --level <n> --seed <s> [--view landscape|portrait]
  npm run probe -- --level <n> --seed <s> --viewport <width>x<height>
  npm run probe -- --eval "<expression>"`;

function argumentsOf(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (name === "--help" || name === "-h") return { help: true };
    if (!["--level", "--seed", "--view", "--viewport", "--eval"].includes(name)) {
      throw new Error(`Unknown option "${name}".\n${HELP}`);
    }
    if (values[name] !== undefined) throw new Error(`Option "${name}" was given twice.`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option "${name}" needs a value.\n${HELP}`);
    }
    values[name] = value;
  }

  const expression = values["--eval"];
  const level = values["--level"];
  if ((expression === undefined) === (level === undefined)) {
    throw new Error(`Choose exactly one of --level and --eval.\n${HELP}`);
  }
  if (expression !== undefined) {
    const extras = ["--seed", "--view", "--viewport"].filter((name) => values[name] !== undefined);
    if (extras.length > 0) throw new Error(`${extras.join(", ")} only applies to --level.`);
    return { expression };
  }

  if (values["--seed"] === undefined) throw new Error(`--level also needs --seed.\n${HELP}`);
  const levelNumber = Number(level);
  const seed = Number(values["--seed"]);
  if (!Number.isSafeInteger(levelNumber) || levelNumber < 1) {
    throw new Error(`Level "${level}" is not a positive integer.`);
  }
  if (!Number.isSafeInteger(seed)) throw new Error(`Seed "${values["--seed"]}" is not an integer.`);
  if (values["--view"] !== undefined && values["--viewport"] !== undefined) {
    throw new Error("Choose --view or --viewport, not both.");
  }
  const view = values["--view"] ?? "landscape";
  if (!["landscape", "portrait"].includes(view)) {
    throw new Error(`View "${view}" is not landscape or portrait.`);
  }

  let viewport;
  if (values["--viewport"] !== undefined) {
    const match = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(values["--viewport"]);
    if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) {
      throw new Error(`Viewport "${values["--viewport"]}" is not WIDTHxHEIGHT.`);
    }
    viewport = { width: Number(match[1]), height: Number(match[2]) };
  }
  return { level: levelNumber, seed, view, viewport };
}

const json = (value) =>
  JSON.stringify(
    value,
    (_key, found) => {
      if (found instanceof Map) return Object.fromEntries(found);
      if (found instanceof Set) return [...found];
      if (typeof found === "bigint") return String(found);
      if (typeof found === "function") return `[Function ${found.name || "anonymous"}]`;
      return found;
    },
    2,
  ) ?? String(value);

/**
 * Flatten exports that have one unambiguous home while keeping every module
 * under its own name. This is the useful middle ground: `gripOf(...)` and
 * `sliceShapes(...)` work directly, and a future collision remains reachable as
 * `piece.name` or `slices.name` rather than silently choosing one.
 */
function evaluationScope(modules) {
  const owners = new Map();
  for (const [moduleName, module] of Object.entries(modules)) {
    for (const name of Object.keys(module)) {
      if (/^[A-Za-z_$][\w$]*$/.test(name) && name !== "default") {
        const found = owners.get(name) ?? [];
        found.push(moduleName);
        owners.set(name, found);
      }
    }
  }

  const scope = { ...modules };
  for (const [name, ownersOfName] of owners) {
    if (ownersOfName.length === 1 && scope[name] === undefined) {
      scope[name] = modules[ownersOfName[0]][name];
    }
  }
  return scope;
}

async function run() {
  const options = argumentsOf(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const server = await createServer({
    root,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const entries = await Promise.all(
      Object.entries(MODULE_PATHS).map(async ([name, path]) => [
        name,
        await server.ssrLoadModule(path),
      ]),
    );
    const modules = Object.fromEntries(entries);

    /**
     * Layout only reads a shape's committed geometry. The browser's asset loader
     * also parses SVG markup to draw it, which needs `DOMParser`; asking Node to
     * grow a partial DOM would add machinery unrelated to the question. These
     * are the same ids, boxes, ink, anchors and themes from `assets.ts`, with the
     * drawing fields left empty exactly as the geometry tests leave them.
     */
    const animalShapes = modules.assets.ANIMAL_IDS.map((id) => ({
      id: modules.piece.pieceId(id),
      outline: "",
      artwork: "",
      box: modules.assets.ANIMAL_BOX,
      inked: modules.assets.animalInk(id),
      anchor: modules.assets.animalAnchor(id),
      label: id[0].toUpperCase() + id.slice(1),
      themes: modules.assets.animalThemes(id),
    }));
    modules.assets = { ...modules.assets, loadAnimalShapes: () => animalShapes };

    const probeLevel = async (levelNumber, seed, view = "landscape") => {
      await modules.registry.loadAllKinds();
      const level = modules.levels.levelSpec(levelNumber);
      const kind = modules.registry.kindFor(level);
      const random = modules.geometry.seededRandom(seed);
      const puzzle = kind.deal({ level, shapes: modules.assets.loadAnimalShapes() }, random);
      const on =
        typeof view === "string"
          ? view
          : modules.layout.viewFor({ width: view.width, height: view.height });
      const composed = modules.layout.buildLevelLayout(on, level, puzzle.pieces, puzzle.targets);

      return {
        level: level.level,
        seed,
        kind: kind.id,
        chapter: level.chapter,
        view: composed.id,
        canvas: composed.canvas,
        cast: puzzle.targets.map(({ id, label }) => ({ id, label })),
        pieces: puzzle.pieces.map(({ id, label }) => ({
          id,
          label,
          box: modules.layout.boxOf(composed, id),
          target: kind.target(puzzle, composed, id),
        })),
        holes: puzzle.targets.map(({ id, label }) => ({
          id,
          label,
          at: modules.layout.holeOf(composed, id),
          box: modules.layout.boxOf(composed, id),
        })),
        trayCells: puzzle.pieces.map(({ id }) => ({
          piece: id,
          cell: composed.trayCells.get(id),
          home: modules.layout.trayHome(composed, id),
          waiting: modules.layout.waitingHome(composed, id),
        })),
        slotSize: composed.slotSize,
        waitingScale: composed.waitingScale,
      };
    };

    if (options.expression !== undefined) {
      const scope = { ...evaluationScope(modules), probeLevel };
      const names = Object.keys(scope).sort();
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const evaluate = new AsyncFunction(
          ...names,
          `"use strict"; return await (${options.expression});`,
        );
        console.log(json(await evaluate(...names.map((name) => scope[name]))));
      } catch (error) {
        console.error(
          `Expression failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.error(`Resolved names: ${names.join(", ")}`);
        process.exitCode = 1;
      }
      return;
    }

    const view = options.viewport ?? options.view;
    console.log(json(await probeLevel(options.level, options.seed, view)));
  } finally {
    await server.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
