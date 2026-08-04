import { createServer } from "node:http";
import { availableParallelism, totalmem } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  browserSlots,
  cpuSlots,
  freeDebugPort,
  listenOnFreePort,
} from "../scripts/concurrency.mjs";

const originalOverride = process.env.VERIFY_BROWSER_SLOTS;
const originalCpuOverride = process.env.VERIFY_CPU_SLOTS;

afterEach(() => {
  if (originalOverride === undefined) delete process.env.VERIFY_BROWSER_SLOTS;
  else process.env.VERIFY_BROWSER_SLOTS = originalOverride;
  if (originalCpuOverride === undefined) delete process.env.VERIFY_CPU_SLOTS;
  else process.env.VERIFY_CPU_SLOTS = originalCpuOverride;
});

describe("browser concurrency", () => {
  it("binds an HTTP server to an OS-assigned loopback port", async () => {
    const server = createServer((_request, response) => response.end("ok"));
    try {
      const port = await listenOnFreePort(server);
      expect(port).toBeGreaterThan(0);
      expect(server.address()).toMatchObject({ address: "127.0.0.1", port });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("asks Chrome to assign the DevTools port without a reservation race", () => {
    expect(freeDebugPort()).toBe(0);
  });

  it("keeps Chrome under the CPU, memory, and six-browser ceilings", () => {
    delete process.env.VERIFY_BROWSER_SLOTS;
    const expected = Math.max(
      1,
      Math.min(
        availableParallelism() - 1,
        Math.floor(totalmem() / 2 / (2 * 1024 * 1024 * 1024)),
        6,
      ),
    );
    expect(browserSlots()).toBe(expected);
  });

  it("uses the configured slot count only as a tighter ceiling", () => {
    delete process.env.VERIFY_BROWSER_SLOTS;
    const machineLimit = browserSlots();
    process.env.VERIFY_BROWSER_SLOTS = "1";
    expect(browserSlots()).toBe(1);
    process.env.VERIFY_BROWSER_SLOTS = String(machineLimit + 1);
    expect(browserSlots()).toBe(machineLimit);
  });

  it.each(["0", "-1", "1.5", "many"])("refuses an invalid slot override (%s)", (configured) => {
    process.env.VERIFY_BROWSER_SLOTS = configured;
    expect(() => browserSlots()).toThrow("VERIFY_BROWSER_SLOTS must be a positive integer.");
  });
});

describe("CPU concurrency", () => {
  it("offers the whole machine to a check nobody has divided it for", () => {
    delete process.env.VERIFY_CPU_SLOTS;
    expect(cpuSlots()).toBe(Math.max(1, availableParallelism()));
  });

  it("uses the configured slot count only as a tighter ceiling", () => {
    delete process.env.VERIFY_CPU_SLOTS;
    const machineLimit = cpuSlots();
    process.env.VERIFY_CPU_SLOTS = "1";
    expect(cpuSlots()).toBe(1);
    process.env.VERIFY_CPU_SLOTS = String(machineLimit + 1);
    expect(cpuSlots()).toBe(machineLimit);
  });

  it.each(["0", "-1", "1.5", "many"])("refuses an invalid slot override (%s)", (configured) => {
    process.env.VERIFY_CPU_SLOTS = configured;
    expect(() => cpuSlots()).toThrow("VERIFY_CPU_SLOTS must be a positive integer.");
  });
});
