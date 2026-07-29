/**
 * A headless Chrome to drive, and a way to talk to it.
 *
 * Two checks need a real browser: `shot.mjs`, which plays the game with real
 * pointer drags, and `check-audio.mjs`, which renders every sound the game can
 * make through a real `OfflineAudioContext` and measures the samples. Finding a
 * browser, launching it, waiting for it to expose a page and speaking the
 * DevTools Protocol at it is the same work both times, and it is the sort of
 * thing that drifts into two slightly different versions if it is written
 * twice.
 *
 * Which Chrome is on PATH depends on the machine: `chromium` on a Debian
 * desktop, `google-chrome` on a GitHub Actions runner. `CHROME_BIN` lets the
 * caller say, so CI does not need a different script.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = process.env.CHROME_BIN || "chromium";

/**
 * Launch a headless Chrome and connect to it.
 *
 * Returns `send` for raw DevTools Protocol calls, `evaluate` for running an
 * expression in the page and getting the value back, and `close` for shutting
 * the browser down. `close` is safe to call more than once.
 */
export async function openChrome({ debugPort, profileDir, windowSize = "1280,800" }) {
  rmSync(profileDir, { recursive: true, force: true });

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${windowSize}`,
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
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
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

  let closed = false;
  return {
    send,
    evaluate,
    // Idempotent on purpose: a caller that closes in a `finally` and again on
    // the way out of an error path must not have the second call throw over
    // the first one's exception, which is the one worth reading.
    close() {
      if (closed) return;
      closed = true;
      socket.close();
      chrome.kill();
    },
  };
}
