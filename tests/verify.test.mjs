import { describe, expect, it } from "vitest";

import { formatReport, runTasks, verifyFailed, verifyTasks } from "../scripts/verify.mjs";

const capacities = { cpu: 12, browser: 1 };
const tasks = verifyTasks(capacities.cpu, capacities.browser);

describe("the verify runner", () => {
  it("keeps the task-record contract and threads caching inputs through", async () => {
    const [task] = tasks;
    let options;
    await runTasks([task], {
      cpuSlots: capacities.cpu,
      browserSlots: capacities.browser,
      noCache: true,
      executeTask: async (_task, received) => {
        options = received;
        return { exitCode: 0, output: "", durationMs: 10 };
      },
    });

    expect(Object.keys(task)).toEqual(["name", "run", "needs", "inputs", "slots"]);
    expect(options).toMatchObject({ noCache: true, inputs: task.inputs });
  });

  it("gives shot the whole browser pool after audio releases it", async () => {
    const browserTasks = verifyTasks(12, 3).filter(({ name }) =>
      ["audio:check", "shot"].includes(name),
    );
    browserTasks.find(({ name }) => name === "shot").needs = [];
    const active = [];
    let mostActive = 0;

    await runTasks(browserTasks, {
      cpuSlots: 12,
      browserSlots: 3,
      executeTask: async (task, { browserSlots }) => {
        active.push(browserSlots);
        mostActive = Math.max(
          mostActive,
          active.reduce((total, slots) => total + slots, 0),
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
        active.splice(active.indexOf(browserSlots), 1);
        return { exitCode: 0, output: "", durationMs: 10 };
      },
    });

    expect(mostActive).toBe(3);
  });

  it.each(tasks.map(({ name }) => [name]))("fails when %s alone fails", async (failedName) => {
    const results = await runTasks(tasks, {
      cpuSlots: capacities.cpu,
      browserSlots: capacities.browser,
      executeTask: async ({ name }) => ({
        exitCode: name === failedName ? 1 : 0,
        output: `${name} output`,
        durationMs: 10,
      }),
    });

    expect(verifyFailed(results)).toBe(true);
    expect(results.find(({ name }) => name === failedName)?.status).toBe("failed");
    expect(formatReport(results, capacities)).toContain(`FAIL  ${failedName}`);
  });

  it("prints task output in task order even when completion order differs", async () => {
    const completed = [];
    const results = await runTasks(tasks.slice(0, 4), {
      cpuSlots: 4,
      browserSlots: 1,
      executeTask: async ({ name }) => {
        await new Promise((resolve) => setTimeout(resolve, name === "typecheck" ? 10 : 0));
        completed.push(name);
        return { exitCode: 0, output: `${name} output`, durationMs: 10 };
      },
    });
    const report = formatReport(results, { cpu: 4, browser: 1 });

    expect(completed[0]).not.toBe("typecheck");
    expect(report.indexOf("typecheck output")).toBeLessThan(report.indexOf("lint output"));
    expect(report.indexOf("lint output")).toBeLessThan(report.indexOf("format:check output"));
  });

  it("stops scheduling after a failure and keeps results from running work", async () => {
    const smallTasks = tasks.slice(0, 3);
    const started = [];
    const results = await runTasks(smallTasks, {
      cpuSlots: 2,
      browserSlots: 1,
      executeTask: async ({ name }) => {
        started.push(name);
        await new Promise((resolve) => setTimeout(resolve, name === "typecheck" ? 0 : 10));
        return { exitCode: name === "typecheck" ? 1 : 0, output: name, durationMs: 10 };
      },
    });

    expect(started).toEqual(["typecheck", "lint"]);
    expect(results.map(({ status }) => status)).toEqual(["failed", "passed", "skipped"]);
  });

  it("names the automatic fix for a formatting failure", () => {
    const report = formatReport(
      [
        {
          name: "format:check",
          status: "failed",
          output: "bad format",
          durationMs: 10,
        },
      ],
      capacities,
    );

    expect(report).toContain("fix with: npm run format");
  });
});
