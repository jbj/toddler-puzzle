import { describe, expect, it } from "vitest";
import manifestRaw from "../public/manifest.webmanifest?raw";
import iconRaw from "../public/icon.svg?raw";
import htmlRaw from "../index.html?raw";

/**
 * The add-to-home-screen contract. iPad is the target device, and a toddler
 * will poke the address bar and the tab strip if they are on screen, so the
 * game has to install fullscreen. This checks the manifest and the meta tags
 * that get it there - and that the promise the no-binary-assets invariant makes
 * is kept: everything the manifest points at is hand-authored SVG, not a
 * committed binary. See the iPad decision record.
 *
 * The files are pulled in with Vite's `?raw` loader rather than `node:fs`,
 * because the test build types only `vite/client`, not Node.
 */
const publicFiles = import.meta.glob("../public/*", { query: "?raw", eager: true });

describe("the web-app manifest", () => {
  const manifest = JSON.parse(manifestRaw) as {
    name?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    display_override?: string[];
    background_color?: string;
    theme_color?: string;
    orientation?: string;
    icons?: { src: string; type?: string }[];
  };

  it("names itself and installs fullscreen", () => {
    expect(manifest.name).toBeTruthy();
    // Fullscreen loses even the status bar; standalone is the fallback for a
    // browser that will not do fullscreen. Either way, no browser chrome.
    expect(manifest.display).toBe("fullscreen");
    expect(manifest.display_override).toContain("standalone");
  });

  it("is relative, so one build works under the Pages sub-path", () => {
    // A leading slash would send add-to-home to the server root, which is not
    // where the game lives on GitHub Pages. See
    // docs/decisions/Deploy to GitHub Pages from a verified commit.md.
    for (const url of [manifest.start_url, manifest.scope]) {
      expect(url).toBeTruthy();
      expect(url?.startsWith("/")).toBe(false);
    }
  });

  it("does not lock the orientation, because the game reflows to both", () => {
    expect(manifest.orientation).toBeUndefined();
  });

  it("dresses the launch in the sky colour the page already uses", () => {
    const themeColor = /name="theme-color"\s+content="([^"]+)"/.exec(htmlRaw)?.[1];
    expect(themeColor).toBeTruthy();
    expect(manifest.background_color).toBe(themeColor);
    expect(manifest.theme_color).toBe(themeColor);
  });

  it("points only at hand-authored SVG, and names the icon that exists", () => {
    expect(manifest.icons?.length).toBeGreaterThan(0);
    for (const icon of manifest.icons ?? []) {
      expect(icon.type).toBe("image/svg+xml");
      expect(icon.src).toBe("icon.svg");
    }
    expect(iconRaw).toContain("<svg");
  });

  it("keeps public/ free of binary assets", () => {
    const paths = Object.keys(publicFiles);
    // A bare loop over a glob is a vacuous pass if the glob finds nothing: zero
    // iterations, zero assertions, green having inspected nothing. Assert it
    // actually saw the files, and name them, before trusting the loop below.
    expect(paths.length, `public/ glob matched nothing: [${paths.join(", ")}]`).toBeGreaterThan(0);
    for (const path of paths) {
      // No `.ico`: it is a binary format, and this test exists to keep binaries
      // out - the audience downloads nothing that could fail to load.
      expect(/\.(svg|webmanifest|json|xml|txt)$/.test(path)).toBe(true);
    }
  });
});

describe("the iPad meta tags", () => {
  it("asks iOS and the rest to run as an installed app", () => {
    expect(htmlRaw).toMatch(/name="apple-mobile-web-app-capable"\s+content="yes"/);
    expect(htmlRaw).toMatch(/name="mobile-web-app-capable"\s+content="yes"/);
  });

  it("links the manifest and an apple-touch-icon", () => {
    expect(htmlRaw).toMatch(/rel="manifest"\s+href="manifest\.webmanifest"/);
    expect(htmlRaw).toMatch(/rel="apple-touch-icon"/);
  });

  it("covers the safe area, so env(safe-area-inset-*) has something to give", () => {
    // Without viewport-fit=cover the insets are all zero and the home-indicator
    // padding in style.css does nothing.
    expect(htmlRaw).toMatch(/viewport-fit=cover/);
    expect(htmlRaw).toMatch(/name="apple-mobile-web-app-status-bar-style"/);
  });
});
