import { availableParallelism, totalmem } from "node:os";

// Measured 2026-08-04 under the machine's exclusive browser lock with no other
// check running, sampling `ps` every 100ms through a complete `npm run shot`.
// Start at the exact Chromium parent the harness launched and sum every
// descendant by PPID; never select by process name, because the developer's
// desktop Chromium is another, much larger tree. Of 2,293 samples, 2,214 held a
// live tree: median 1,219 MiB, p90 1,307 MiB, p99 1,373 MiB, maximum 1,387 MiB
// across 11 processes. 2 GiB rounds that distribution up; redo the same
// one-instance process-tree measurement before changing it.
const PER_CHROME = 2 * 1024 * 1024 * 1024;

/** Bind a Node HTTP server to an OS-assigned loopback port. */
export function listenOnFreePort(server) {
  return new Promise((resolve, reject) => {
    const failed = (error) => {
      server.off("listening", listening);
      reject(error);
    };
    const listening = () => {
      server.off("error", failed);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The HTTP server did not expose an assigned TCP port."));
        return;
      }
      resolve(address.port);
    };

    server.once("error", failed);
    server.once("listening", listening);
    server.listen(0, "127.0.0.1");
  });
}

/**
 * Ask Chrome to choose its own DevTools port.
 *
 * Port zero is the only reservation that cannot race: Chrome binds it itself,
 * then writes the assigned port into its run-owned `DevToolsActivePort` file.
 */
export function freeDebugPort() {
  return 0;
}

/**
 * How many CPUs a check may keep busy at once.
 *
 * The companion to `browserSlots`, and read the same way: a runner that has
 * already divided the machine between concurrent jobs says so in
 * `VERIFY_CPU_SLOTS`, and a check that spreads itself over workers asks here
 * rather than counting the machine's cores itself. Without it a task that
 * `scripts/verify.mjs` charges one CPU can quietly spawn a worker per core
 * beside another task that was promised the rest of them.
 */
export function cpuSlots() {
  const machineLimit = Math.max(1, availableParallelism());
  const configured = process.env.VERIFY_CPU_SLOTS;
  if (configured === undefined) return machineLimit;

  if (!/^[1-9]\d*$/.test(configured) || !Number.isSafeInteger(Number(configured))) {
    throw new Error("VERIFY_CPU_SLOTS must be a positive integer.");
  }
  // Same bargain as the browser pool: a caller may divide the machine's
  // capacity among its jobs, but may not claim more of it than there is.
  return Math.min(machineLimit, Number(configured));
}

/** How many complete Chrome process trees this machine may carry at once. */
export function browserSlots() {
  const machineLimit = Math.max(
    1,
    Math.min(availableParallelism() - 1, Math.floor(totalmem() / 2 / PER_CHROME), 6),
  );
  const configured = process.env.VERIFY_BROWSER_SLOTS;
  if (configured === undefined) return machineLimit;

  if (!/^[1-9]\d*$/.test(configured) || !Number.isSafeInteger(Number(configured))) {
    throw new Error("VERIFY_BROWSER_SLOTS must be a positive integer.");
  }
  // A runner may divide the machine's safe budget among its jobs, but may not
  // raise it: half of RAM is a machine limit, not a caller preference.
  return Math.min(machineLimit, Number(configured));
}
