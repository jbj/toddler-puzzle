import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Writes what the build actually produced, so `scripts/check-bundle.mjs` can
 * hold it to a budget without having to re-derive any of it.
 *
 * The interesting number is not the total: it is what a child downloads before
 * the first level appears. That is the entry chunk plus everything it imports
 * *statically*, and it is only knowable here, where the import graph is - hence
 * `imports` and `dynamicImports` per chunk rather than a flat list of files.
 *
 * `modules` is what each chunk is made of, so a failure can say what grew
 * rather than only that something did. Those lengths are measured after
 * tree-shaking but before minification, which makes them good for comparing
 * modules with each other and wrong for adding up to the file size.
 *
 * The report goes to `.art/`, not to `dist/`: it is a thing for whoever is
 * working on the game, and nothing that is not the game should be deployed.
 */
function bundleReport(): Plugin {
  return {
    name: "bundle-report",
    apply: "build",
    writeBundle(options, bundle) {
      const outDir = options.dir ?? "dist";
      const root = resolve(outDir, "..");
      const files = [];

      for (const [fileName, output] of Object.entries(bundle)) {
        const bytes = readFileSync(join(outDir, fileName));
        const chunk = output.type === "chunk" ? output : null;
        files.push({
          file: fileName,
          kind: output.type,
          isEntry: chunk?.isEntry ?? false,
          bytes: bytes.length,
          gzip: gzipSync(bytes, { level: 9 }).length,
          imports: chunk?.imports ?? [],
          dynamicImports: chunk?.dynamicImports ?? [],
          // The stylesheet a chunk pulls in with it. Vite links the entry's in
          // the head, so that one is downloaded before the first paint too.
          css: [...(chunk?.viteMetadata?.importedCss ?? [])],
          modules: chunk
            ? Object.entries(chunk.modules)
                .map(([id, module]) => ({
                  id: relative(root, id).replaceAll("\\", "/"),
                  bytes: module.renderedLength,
                }))
                .filter((module) => module.bytes > 0)
                .sort((a, b) => b.bytes - a.bytes)
            : [],
        });
      }

      const path = join(root, ".art", "bundle.json");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `${JSON.stringify({ generatedAt: new Date().toISOString(), outDir, files }, null, 2)}\n`,
      );
    },
  };
}

/**
 * The build is deliberately path-agnostic.
 *
 * GitHub Pages serves this repository at `/toddler-puzzle/`, while
 * `scripts/shot.mjs` serves `dist/` at the root of a local server, and
 * `npm run preview` does the same. A relative base emits `./assets/...`, which
 * is correct in all three, so one build artifact is the one that ships and the
 * one the screenshot run checks. See docs/decisions/20260728T103610.
 */
export default defineConfig({
  base: "./",
  plugins: [bundleReport()],
});
