# Animal Puzzle

A drag-and-drop shape puzzle for toddlers. Four animals wait in a tray; each one
is dragged onto the matching animal-shaped hole in the landscape. When all four
are home, the scene sparkles and a big button starts a new round.

Works with a finger or a mouse, in landscape or portrait.

```
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run test` | Unit tests (Vitest) |
| `npm run art` | Renders the animal art to `.art/contact-sheet.png` for review |
| `npm run shot` | Drives real drags in headless Chromium and screenshots the result (run `npm run build` first) |

## Design notes

**Everything is forgiving.** A piece only ever snaps into its *own* hole, so it
is impossible to place an animal "wrongly". The snap radius is deliberately
large - about two thirds of a piece - and any other drop drifts gently back to
the tray. Pieces are clamped to the canvas, so one can never be dragged out of
reach. A wrong drop plays a soft, warm tone rather than a buzzer.

**Toddler-proofing.** Pinch-zoom, double-tap zoom, text selection, long-press
context menus and native image dragging are all disabled. Every target is large.
While dragging, the piece is held slightly above the finger so a small hand
doesn't cover it.

**No binary assets.** The animals are hand-authored SVG and the sounds are
synthesised with the Web Audio API, so there is nothing to download and nothing
to fail to load. The whole bundle is around 17 kB.

## How pieces and holes stay in sync

Each animal is one SVG file with a strict structure:

```svg
<svg viewBox="0 0 240 240">
  <path id="silhouette" d="..."/>   <!-- one closed outer outline -->
  <g id="detail"> ... </g>          <!-- eyes, ears, spots -->
</svg>
```

`src/assets.ts` imports these with Vite's `?raw` and uses **the same
`#silhouette` path** twice: once filled dark to cut the hole in the scene, and
once in full colour to draw the draggable piece. A piece therefore cannot drift
out of alignment with its hole. If a file is missing its silhouette, or uses the
wrong `viewBox`, loading throws immediately rather than shipping an unsolvable
puzzle.

## Adding an animal

1. Draw `src/assets/animals/<name>.svg` following the contract above. Silhouettes
   should be as *distinct* from each other as possible - toddlers match the
   outline before the detail, so two similar profiles make the puzzle frustrating.
2. Check it renders: `npm run art`, then look at `.art/contact-sheet.png`. It
   shows every animal in colour **and** as a bare silhouette; if you can't tell
   what the silhouette is, neither can a two-year-old.
3. Register the id in `ANIMAL_IDS` and `SOURCES` in `src/assets.ts`.
4. Add its foot level to `FOOT_LEVEL` and a hole + tray slot to both layouts in
   `src/layout.ts`. The layout tests will fail if holes overlap, snap zones
   collide, or anything falls off the canvas.

## Layout

The puzzle reflows rather than merely shrinking. Landscape gets one row of four
animals with the tray beneath; portrait gets two rows of two and a two-row tray.
Letterboxing a landscape canvas into an upright phone would leave the pieces too
small to grab, so `src/layout.ts` defines both and `chooseLayout()` picks by
aspect ratio. Rotating the device mid-puzzle rebuilds the board but keeps
progress.

The background landscape is generated from the layout (`src/scenery.ts`) rather
than being a fixed-size image, so both orientations share one piece of art.

## Source map

| File | Role |
| --- | --- |
| `src/geometry.ts` | Pure maths: screen↔logical mapping, snapping, clamping |
| `src/layout.ts` | The two layouts and all tunable constants |
| `src/scenery.ts` | Generates the background for a layout |
| `src/assets.ts` | Loads and validates the animal SVGs |
| `src/board.ts` | Builds the SVG scene graph |
| `src/drag.ts` | Pointer-event drag engine |
| `src/game.ts` | Rules, state, and the round lifecycle |
| `src/audio.ts` | Web Audio sound synthesis |
| `src/celebrate.ts` | Sparkles and the play-again button |

## Testing

`npm run test` covers the coordinate mapping (including letterboxing in both
orientations), snap tolerance, clamping, and the layouts themselves - holes stay
on canvas, snap zones never overlap, tray slots never collide, and each
orientation fills at least 75% of its viewport.

`npm run shot` is an end-to-end check: it serves the built app, drives real
pointer drags over the Chrome DevTools Protocol, and asserts that pieces snap,
that a bad drop does *not* stick, that the celebration appears, and that
rotating to portrait preserves progress. Screenshots land in `.art/shots/`.
