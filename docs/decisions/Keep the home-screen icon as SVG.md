# Keep the home-screen icon as SVG

The home-screen icon (`public/icon.svg`) is a hand-authored SVG, referenced
from the manifest and from `apple-touch-icon`. No binary icon is
committed.

The project has no binary assets; see
[Keep assets and runtime simple](<Keep assets and runtime simple.md>). A
committed raster icon would break that invariant.

A platform that wants a raster icon and cannot reliably rasterise SVG for
itself is a real tradeoff, not a reason to commit one. The fullscreen,
chrome-free launch a manifest buys a toddler comes from how the manifest
declares the app's display mode, not from the icon, so a platform that
falls back to a plain screenshot in place of a crisp icon costs nothing
the game actually depends on.

If a crisp raster icon is ever wanted, it has to be generated at build
time from the SVG source, as a build artifact like the JS bundle rather
than a committed binary - and that generation needs its own deliberate
build contract, decided on its own terms rather than folded into an
unrelated change: whatever produces the raster has to be something the
deploy environment can actually run, not assumed present.

The invariant is enforced, not just stated: `tests/manifest.test.ts` fails
if anything the manifest points at is not SVG, or if `public/` gains a file
that is not text.
