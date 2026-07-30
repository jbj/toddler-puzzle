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
import { createConnection } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = process.env.CHROME_BIN || "chromium";

/**
 * Is anything already listening on the debugging port?
 *
 * A plain TCP connect rather than an HTTP request, so that whatever holds the
 * port is found - a browser, a forgotten server, anything.
 */
function somethingAnswersOn(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const settle = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

/** Best effort: ask an occupied port to name itself, for the error message. */
async function whoIsThere(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    const version = await response.json();
    return version.Browser ?? null;
  } catch {
    return null;
  }
}

/**
 * Launch a headless Chrome and connect to it.
 *
 * Returns `send` for raw DevTools Protocol calls, `evaluate` for running an
 * expression in the page and getting the value back, and `close` for shutting
 * the browser down. `close` is safe to call more than once.
 */
export async function openChrome({ debugPort, profileDir, windowSize = "1280,800" }) {
  // Refuse to attach to a browser this script did not start.
  //
  // Chrome cannot bind a port that is already taken, but the connect below does
  // not care who answers: it would find the *old* browser's page and drive
  // that, on whatever the interrupted run left on screen. The checks then fail
  // somewhere with no connection to the real problem - a screenshot run
  // reporting that a new player does not start on level 1, because it is
  // looking at a browser parked on level 12. Half an hour goes into the wrong
  // question. So say what is actually wrong, once, and stop.
  if (await somethingAnswersOn(debugPort)) {
    const browser = await whoIsThere(debugPort);
    console.error(
      `Something is already listening on 127.0.0.1:${debugPort}, which is the ` +
        `port this check talks to its own browser on.\n` +
        (browser ? `It says it is ${browser}.\n` : "") +
        "\nThat is nearly always a headless browser left behind by an " +
        "interrupted run.\nIt has to go, because attaching to it would drive " +
        "the wrong browser and fail\nsomewhere unrelated. Find it and stop it:\n\n" +
        `    ps -eo pid,cmd | grep '[r]emote-debugging-port=${debugPort}'\n` +
        "    kill <pid>\n",
    );
    process.exit(1);
  }

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

  return {
    send,
    evaluate,
    close() {
      socket.close();
      chrome.kill();
    },
  };
}
