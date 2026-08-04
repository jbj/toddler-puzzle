/**
 * The one pre-PR check, scheduled as the work actually depends on itself.
 *
 * Most checks inspect the source tree independently. Running them in an `&&`
 * chain made the five-minute browser run wait for every short check before it
 * could begin, while tools with their own workers could assume they owned the
 * whole machine. This runner gives every task an explicit cost and keeps the
 * only real build edges visible: the budget reads Vite's report, and the shot
 * run serves Vite's `dist/`.
 *
 * Output is held per task. A passing run says one line unless asked for
 * `--verbose`; a failure prints only the failed tasks in fixed order, so the
 * useful line is never buried under hundreds of browser assertions.
 */
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

import { browserSlots as availableBrowserSlots } from "./concurrency.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const node = process.execPath;
const script = (name) => [node, join(root, "scripts", name)];
const packageTool = (packageName, entry, ...args) => [
  node,
  join(root, "node_modules", packageName, entry),
  ...args,
];

const FIX_COMMANDS = new Map([
  ["lint", "npm run lint:fix"],
  ["format:check", "npm run format"],
]);
const CHEAP_TASKS = new Set(["typecheck", "lint", "format:check", "docs:check"]);
const VERBOSE_TASKS = new Set(["docs:check", "budget", "art:check"]);

export function verifyTasks(cpuCapacity, browserCapacity) {
  const shotCpuSlots = Math.min(browserCapacity, Math.max(1, cpuCapacity - 2));
  // The two long tasks overlap, so between them they are the machine. The art
  // check measures the artwork with a worker per slot, and the number it gets
  // is what is left once the browser run has been promised its share; giving it
  // one slot while it spread itself over every core is the oversubscription
  // this budget exists to prevent.
  const artCpuSlots = Math.max(1, cpuCapacity - shotCpuSlots);
  return [
    {
      name: "typecheck",
      run: packageTool("typescript", "bin/tsc", "--noEmit"),
      needs: [],
      inputs: [],
      slots: { cpu: 1, browser: 0 },
    },
    {
      name: "lint",
      run: packageTool("eslint", "bin/eslint.js", "."),
      needs: [],
      inputs: [],
      slots: { cpu: 1, browser: 0 },
    },
    {
      name: "format:check",
      run: packageTool("prettier", "bin/prettier.cjs", "--check", "."),
      needs: [],
      inputs: [],
      slots: { cpu: 1, browser: 0 },
    },
    {
      name: "docs:check",
      run: script("check-docs.mjs"),
      needs: [],
      inputs: [],
      slots: { cpu: 1, browser: 0 },
    },
    {
      name: "test",
      // Vitest brings its own worker pool, so it does not use the CPUs it is
      // given so much as take the ones that are there. It is charged the whole
      // machine to keep it out of everything else's way: overlapping it was
      // measured on twelve cores and on four, and the arrangements that failed
      // all failed the same real check for want of CPU. That costs the run
      // seven to ten seconds and is worth paying.
      //
      // Read the record before revisiting this. The measurement behind it
      // predates both the sixty-animal test getting faster and the art check
      // growing from one core to most of them, so overlap may now be safe - but
      // the rows that showed it was not are expired rather than wrong, and
      // rerunning them proves nothing.
      // See docs/decisions/The checks share the machine, and the tests get it to themselves.md.
      run: packageTool("vitest", "vitest.mjs", "run"),
      needs: [],
      inputs: [],
      slots: { cpu: cpuCapacity, browser: 0 },
    },
    {
      name: "bundle",
      run: packageTool("vite", "bin/vite.js", "build"),
      needs: [],
      inputs: [],
      slots: { cpu: 1, browser: 0 },
    },
    {
      name: "budget",
      run: script("check-bundle.mjs"),
      needs: ["bundle"],
      inputs: [],
      slots: { cpu: 1, browser: 0 },
    },
    {
      name: "audio:check",
      run: script("check-audio.mjs"),
      needs: [],
      inputs: [],
      slots: { cpu: 1, browser: 1 },
    },
    {
      name: "art:check",
      run: script("check-art.mjs"),
      needs: [],
      inputs: [],
      slots: { cpu: artCpuSlots, browser: 0 },
    },
    {
      name: "shot",
      run: script("shot.mjs"),
      needs: ["bundle"],
      inputs: [],
      // The browser pool is a memory ceiling, while Chrome also needs CPU. The
      // two budgets are kept separate so that three browser workers can share
      // two CPUs on CI without pretending they cost no CPU at all. What is left
      // goes to the art check, so that between them the two long tasks are the
      // machine and neither has to guess what the other took.
      slots: { cpu: shotCpuSlots, browser: browserCapacity },
    },
  ];
}

function validateTasks(tasks, capacities) {
  const names = new Set(tasks.map(({ name }) => name));
  if (names.size !== tasks.length) throw new Error("Verify task names must be unique.");

  for (const task of tasks) {
    if (!Array.isArray(task.run) || task.run.length === 0) {
      throw new Error(`${task.name}: run must name a command.`);
    }
    if (!Array.isArray(task.needs) || !Array.isArray(task.inputs)) {
      throw new Error(`${task.name}: needs and inputs must be arrays.`);
    }
    for (const need of task.needs) {
      if (!names.has(need)) throw new Error(`${task.name}: unknown dependency ${need}.`);
    }
    for (const pool of ["cpu", "browser"]) {
      const slots = task.slots[pool];
      if (!Number.isInteger(slots) || slots < 0 || slots > capacities[pool]) {
        throw new Error(
          `${task.name}: asks for ${slots} ${pool} slots, but the pool has ${capacities[pool]}.`,
        );
      }
    }
    if (task.slots.cpu === 0 && task.slots.browser === 0) {
      throw new Error(`${task.name}: must use at least one slot.`);
    }
  }
}

export function spawnTask(task, { noCache, verbose = false }) {
  const started = performance.now();
  const [command, ...baseArgs] = task.run;
  const args = verbose && VERBOSE_TASKS.has(task.name) ? [...baseArgs, "--verbose"] : baseArgs;
  const output = [];

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env: {
        ...process.env,
        VERIFY_CPU_SLOTS: String(task.slots.cpu),
        VERIFY_BROWSER_SLOTS: String(task.slots.browser),
        VERIFY_NO_CACHE: noCache ? "1" : "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk) => output.push(chunk.toString()));
    child.once("error", (error) => {
      output.push(`${error.stack ?? error.message}\n`);
      resolve({ exitCode: 1, output: output.join(""), durationMs: performance.now() - started });
    });
    child.once("close", (code, signal) => {
      if (signal) output.push(`Process ended by signal ${signal}.\n`);
      resolve({
        exitCode: code ?? 1,
        output: output.join(""),
        durationMs: performance.now() - started,
      });
    });
  });
}

/**
 * Nothing new starts after the first failure, but everything already holding a
 * slot gets to finish. That keeps the result useful without paying for a
 * five-minute check after a one-second formatting failure.
 */
export async function runTasks(
  tasks,
  { cpuSlots, browserSlots, noCache = false, verbose = false, executeTask = spawnTask },
) {
  const capacities = { cpu: cpuSlots, browser: browserSlots };
  validateTasks(tasks, capacities);

  const pending = new Set(tasks.map(({ name }) => name));
  const cheapTasks = tasks.filter(({ name }) => CHEAP_TASKS.has(name));
  const running = new Map();
  const results = new Map();
  const used = { cpu: 0, browser: 0 };
  let firstFailure = null;

  return await new Promise((resolve, reject) => {
    const finish = () => {
      if (running.size > 0) return;
      if (pending.size > 0 && firstFailure === null) {
        reject(new Error(`Verify task graph cannot make progress: ${[...pending].join(", ")}.`));
        return;
      }
      for (const task of tasks) {
        if (!pending.has(task.name)) continue;
        results.set(task.name, {
          status: "skipped",
          output: "",
          durationMs: 0,
          reason: `not run after ${firstFailure} failed`,
        });
      }
      resolve(tasks.map(({ name }) => ({ name, ...results.get(name) })));
    };

    const schedule = () => {
      if (firstFailure === null) {
        for (const task of tasks) {
          if (!pending.has(task.name)) continue;
          // The long work waits for the four quick diagnostics. This is a
          // scheduling priority, not a dependency: the graph still describes
          // only files one task produces for another. Paying a few seconds here
          // avoids launching art or Chrome for an auto-fixable failure.
          if (
            !CHEAP_TASKS.has(task.name) &&
            !cheapTasks.every(({ name }) => results.get(name)?.status === "passed")
          ) {
            continue;
          }
          if (!task.needs.every((name) => results.get(name)?.status === "passed")) continue;
          if (
            used.cpu + task.slots.cpu > capacities.cpu ||
            used.browser + task.slots.browser > capacities.browser
          ) {
            continue;
          }

          pending.delete(task.name);
          used.cpu += task.slots.cpu;
          used.browser += task.slots.browser;
          const promise = executeTask(task, {
            noCache,
            verbose,
            browserSlots: task.slots.browser,
            inputs: task.inputs,
          });
          running.set(task.name, promise);
          promise
            .then((result) => {
              const status = result.exitCode === 0 ? "passed" : "failed";
              results.set(task.name, { ...result, status });
              if (status === "failed" && firstFailure === null) firstFailure = task.name;
            })
            .catch((error) => {
              results.set(task.name, {
                status: "failed",
                exitCode: 1,
                output: `${error.stack ?? error.message}\n`,
                durationMs: 0,
              });
              if (firstFailure === null) firstFailure = task.name;
            })
            .finally(() => {
              used.cpu -= task.slots.cpu;
              used.browser -= task.slots.browser;
              running.delete(task.name);
              schedule();
            });
        }
      }
      finish();
    };

    schedule();
  });
}

const duration = (milliseconds) => `${(milliseconds / 1000).toFixed(1)}s`;

export function formatReport(results, capacities, { verbose = false } = {}) {
  const failed = results.filter(({ status }) => status === "failed");
  if (!verbose) {
    if (failed.length === 0) return "Verify passed.\n";
    const lines = [];
    for (const result of failed) {
      lines.push(`FAIL  ${result.name} (${duration(result.durationMs)})`);
      const output = result.output.trimEnd();
      if (output) lines.push(output);
      const fix = FIX_COMMANDS.get(result.name);
      if (fix) lines.push(`fix with: ${fix}`);
    }
    for (const result of results.filter(({ status }) => status === "skipped")) {
      lines.push(`SKIP  ${result.name} - ${result.reason}`);
    }
    lines.push(`Verify failed: ${failed.map(({ name }) => name).join(", ")}.`);
    return `${lines.join("\n")}\n`;
  }

  const lines = [
    "",
    `Verify summary (${capacities.cpu} CPU, ${capacities.browser} browser ${
      capacities.browser === 1 ? "slot" : "slots"
    })`,
  ];

  for (const result of results) {
    const fix = result.status === "failed" ? FIX_COMMANDS.get(result.name) : null;
    const detail =
      result.status === "skipped"
        ? result.reason
        : `${duration(result.durationMs)}${fix ? `; fix with: ${fix}` : ""}`;
    lines.push(
      `${result.status === "passed" ? "PASS" : result.status === "failed" ? "FAIL" : "SKIP"}  ${result.name.padEnd(14)} ${detail}`,
    );
  }

  const withOutput = results.filter(
    (result) => result.status !== "skipped" && result.output.trim().length > 0,
  );
  if (withOutput.length > 0) lines.push("", "Task output (fixed order)");
  for (const result of withOutput) {
    lines.push("", `--- ${result.name} (${duration(result.durationMs)}) ---`);
    lines.push(result.output.trimEnd());
  }

  if (failed.length === 0) {
    lines.push("", "Every verify task passed.");
  } else {
    lines.push("", `Verify failed: ${failed.map(({ name }) => name).join(", ")}.`);
  }
  return `${lines.join("\n")}\n`;
}

export const verifyFailed = (results) => results.some(({ status }) => status === "failed");

function parseOptions(argv, env) {
  const known = new Set(["--no-cache", "--verbose"]);
  const unknown = argv.filter((argument) => !known.has(argument));
  if (unknown.length > 0) throw new Error(`Unknown verify argument: ${unknown.join(" ")}`);
  return {
    noCache:
      argv.includes("--no-cache") || ["1", "true"].includes(env.VERIFY_NO_CACHE?.toLowerCase()),
    verbose: argv.includes("--verbose"),
  };
}

async function main() {
  const capacities = {
    cpu: availableParallelism(),
    browser: availableBrowserSlots(),
  };
  const tasks = verifyTasks(capacities.cpu, capacities.browser);
  const options = parseOptions(process.argv.slice(2), process.env);
  const results = await runTasks(tasks, {
    cpuSlots: capacities.cpu,
    browserSlots: capacities.browser,
    ...options,
  });
  process.stdout.write(formatReport(results, capacities, options));
  if (verifyFailed(results)) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
