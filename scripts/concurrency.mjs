import { availableParallelism, totalmem } from "node:os";

// Measured 2026-08-04 under the machine lock on an idle host, sampling `ps`
// every 100ms through a complete screenshot run and summing the launched
// Chromium instance's parent and every descendant by PPID. Across 2,214 live
// samples the tree used 1,219 MiB at the median, 1,307 MiB at p90, 1,373 MiB at
// p99 and 1,387 MiB at its 11-process peak. An earlier 463 MiB result saw only
// six processes and had missed renderers. 2 GiB rounds the complete-tree peak
// up for a heavier page or Chrome release. Before changing it, repeat the same
// launched-profile, whole-tree-by-PPID measurement; never select Chromium by
// process name, because the developer's desktop browser is another, larger tree.
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
