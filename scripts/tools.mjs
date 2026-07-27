/**
 * External tools the art scripts shell out to.
 *
 * The art checks rasterise SVGs and measure the pixels, which needs two
 * programs that are not npm packages. Resolving them here means one clear
 * message naming the package to install, rather than a bare ENOENT from
 * whichever call happened to run first.
 *
 * ImageMagick is the awkward one: version 7 renames `convert` to `magick`, and
 * which of the two exists depends on the distribution rather than on anything
 * this project controls. Every call site below is written in the argument order
 * both accept, so picking the binary once is enough.
 */
import { execFileSync } from "node:child_process";

function have(binary) {
  try {
    execFileSync("/bin/sh", ["-c", `command -v -- "$1"`, "sh", binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function missing(what, packages) {
  console.error(
    `Cannot find ${what}.\n` +
      `Install it first - on Debian or Ubuntu: sudo apt-get install ${packages}`,
  );
  process.exit(1);
}

// Resolved on first use rather than on import, so that merely importing this
// module cannot end the process. `npm run shot` pulls it in only to build a
// contact sheet at the end, and a missing tool there must not fail a run whose
// screenshots and checks are already done.
const once = (resolve) => {
  let value;
  return () => (value ??= resolve());
};

const imagemagick = once(
  () => process.env.IMAGEMAGICK_BIN ?? ["magick", "convert"].find(have) ?? null,
);
const rsvgConvert = once(() => (have("rsvg-convert") ? "rsvg-convert" : null));

/** Whether ImageMagick is installed, without exiting if it is not. */
export const haveImageMagick = () => imagemagick() !== null;

/**
 * Fail now, with the package name, rather than part-way through a run. For
 * scripts that cannot do anything useful without both rasterisers.
 */
export function requireArtTools() {
  if (rsvgConvert() === null) missing("rsvg-convert", "librsvg2-bin");
  if (imagemagick() === null) missing("ImageMagick", "imagemagick");
}

/** Rasterise an SVG. Arguments are passed straight to rsvg-convert. */
export const rsvg = (args) =>
  execFileSync(rsvgConvert() ?? missing("rsvg-convert", "librsvg2-bin"), args);

/**
 * Run ImageMagick. Arguments must be in `<inputs> <operations> <output>` order,
 * which is what ImageMagick 6's `convert` and 7's `magick` both understand.
 */
export const magick = (args) =>
  execFileSync(imagemagick() ?? missing("ImageMagick", "imagemagick"), args);
