# The home-screen icon is SVG, and the crisp PNG is a call for later

## Context

iPad is the target device, and a web-app manifest is what makes add-to-home
launch the game fullscreen, with no address bar or tab strip for a two-year-old
to poke. That part is unambiguous and worth having. The icon that goes with it
is not.

`product.instructions.md` states an invariant: the project has no binary assets.
The art is hand-authored SVG and the sound is synthesised, so there is nothing
to download and nothing to fail to load. A committed PNG would be the first
binary in the tree, and the invariant is deliberate.

A manifest conventionally wants PNG icons, and iOS Safari in particular is
historically poor at SVG for `apple-touch-icon`. That folklore is from 2015, so
it was worth checking rather than repeating - and on checking it still holds:
current iPadOS Safari does not reliably rasterise an SVG `apple-touch-icon`, and
where it cannot it falls back to a screenshot of the page. A crisp installed
icon still, in 2026, wants a PNG.

So there is a real conflict, with three ways out:

1. **Ship no icon.** iOS renders a screenshot of the page, which at load is
   mostly empty sky. Ugly on the one device that matters.
2. **Commit a PNG.** Breaks the no-binary-assets invariant outright.
3. **Rasterise a PNG at build time from an SVG source.** The PNG is a build
   artifact, like the JS bundle, rather than a committed binary - arguably fine.

## Decision

**Ship a hand-authored SVG icon** (`public/icon.svg`), referenced from the
manifest as `image/svg+xml`, from `<link rel="icon">`, and from
`apple-touch-icon`. Commit no binary. This keeps the invariant whole and
delivers the part of the manifest that actually matters for a toddler - the
fullscreen, chrome-free launch, which comes from `display` and
`apple-mobile-web-app-capable`, not from the icon at all.

Option 3, the build-time PNG, is deliberately **not** taken here, for a concrete
reason: the GitHub Pages deploy workflow runs only `npm run build` and installs
none of the art tools (`rsvg-convert`, ImageMagick) that CI has for `art:check`.
A build that rasterised through them would produce no icon in production, and a
build that hard-depended on them would fail the deploy. The alternative - a
JavaScript rasteriser as a dev dependency, invoked by a Vite plugin so `npm run
build` needs no system tool - is a real option, but it adds a native dependency
and is a decision to weigh with an iPad in hand, not one to slip into an
iPad-readiness change.

## Consequences

- On a real iPad, add-to-home may show a screenshot of the page rather than the
  bear where a crisp icon would be. This is the one visible cost, and it is on
  the hardware-only follow-up checklist for a human to look at.
- If the owner wants the crisp icon, the sanctioned path is option 3 with a JS
  rasteriser dev dependency (so the Pages deploy needs no system tool), or
  giving the deploy runner the art tools. Either is a small, separate change.
- The invariant stands: `tests/manifest.test.ts` fails if anything the manifest
  points at is not SVG, and if `public/` grows a file that is not text.
