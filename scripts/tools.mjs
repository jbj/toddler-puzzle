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

const imagemagick =
  process.env.IMAGEMAGICK_BIN ??
  ["magick", "convert"].find(have) ??
  missing("ImageMagick", "imagemagick");

if (!have("rsvg-convert")) missing("rsvg-convert", "librsvg2-bin");

/** Rasterise an SVG. Arguments are passed straight to rsvg-convert. */
export const rsvg = (args) => execFileSync("rsvg-convert", args);

/**
 * Run ImageMagick. Arguments must be in `<inputs> <operations> <output>` order,
 * which is what ImageMagick 6's `convert` and 7's `magick` both understand.
 */
export const magick = (args) => execFileSync(imagemagick, args);
