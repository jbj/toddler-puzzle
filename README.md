# Animal Puzzle

A drag-and-drop shape puzzle for toddlers. Animals wait in a tray; each one is
dragged onto the matching animal-shaped hole in the landscape. The game is three
puzzles long and grows as it goes - **three animals, then four, then six** - so
the first win comes quickly and the board fills up from there. Finish one and a
big arrow leads to the next; finish the last and the arrow starts the game over.

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
| `npm run art` | Renders the animal art to `.art/contact-sheet.png` for review; `npm run art -- rabbit` renders one animal large |
| `npm run art:check` | Checks every animal against the asset contract (structure, containment, foot level) |
| `npm run shot` | Drives real drags in headless Chromium and screenshots the result (run `npm run build` first) |

## Design notes

**Everything is forgiving.** A piece only ever snaps into its *own* hole, so it
is impossible to place an animal "wrongly". The snap radius is deliberately
large - about two thirds of a piece - and any other drop drifts gently back to
the tray. Pieces are clamped to the canvas, so one can never be dragged out of
reach. A wrong drop plays a soft, warm tone rather than a buzzer.

**The game only ever moves forward.** There is no menu and no difficulty picker:
the three stages are always played in the same order, the button at the end of
one leads straight into the next, and the button after the last one starts again
at three animals. Three dots by the reset button show a grown-up how far along
the set is; they are not a control.

**Toddler-proofing.** Pinch-zoom, double-tap zoom, text selection, long-press
context menus and native image dragging are all disabled. Every target is large.
While dragging, the piece is held slightly above the finger so a small hand
doesn't cover it.

**No binary assets.** The animals are hand-authored SVG and the sounds are
synthesised with the Web Audio API, so there is nothing to download and nothing
to fail to load. The whole bundle is around 24 kB.

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

Two rules follow from that shared path, and `npm run art:check` enforces both:

- **Detail has to stay inside the silhouette.** The hole is cut from the outline
  alone, so a mark that pokes past it makes the piece overhang the hole it is
  meant to fill. This is easy to do by accident - a mouth line that grazes a
  cheek, a spot half off a neck - and hard to see at tray size.
- **A deliberate exception is tagged.** Small appendages may look better hanging
  out; the giraffe's tail does. Mark those with `data-overhang="tail"` and the
  check will skip them, so a genuine mistake still fails.

## Adding an animal

1. Draw `src/assets/animals/<name>.svg` following the contract above. Silhouettes
   should be as *distinct* from each other as possible - toddlers match the
   outline before the detail, so two similar profiles make the puzzle frustrating.
2. Check it renders: `npm run art`, then look at `.art/contact-sheet.png`. It
   shows every animal in colour **and** as a bare silhouette; if you can't tell
   what the silhouette is, neither can a two-year-old.
3. Review it close up with `npm run art -- <name>`. The contact sheet is too
   small to judge whether details line up with the outline, which is exactly
   where hand-drawn art goes wrong.
4. Register the id in `ANIMAL_IDS` and `SOURCES` in `src/assets.ts`.
5. Add its foot level to `FOOT_LEVEL` in `src/layout.ts` - the fraction of the
   240x240 art box where its feet sit, so it stands on the ground line instead
   of being aligned by its box. Don't measure it by hand: `npm run art:check`
   reports the right value.
6. Run `npm run art:check`. It verifies the structure, that the art is not
   clipped by the art box, that detail stays inside the silhouette, and that the
   declared foot level matches the artwork.
7. Put it in a stage in `STAGES`, and make room for it by bumping the matching
   row counts in the `LANDSCAPE` and `PORTRAIT` arrangements (see below). The
   layout tests fail if a stage's rows and its animals disagree, if holes
   overlap, if snap zones collide, or if anything falls off the canvas.

## Stages and layout

`STAGES` in `src/layout.ts` lists the animals of each stage in the order they are
laid out. Everything else about a stage - two layouts, one per orientation - is
generated from a small arrangement table: how many animals stand on each ground
line, how many wait in each tray row, and how big a piece is.

```ts
{ pieceSize: 145, sceneRows: [{ groundY: 428, count: 6 }], trayRows: [{ top: 505, count: 6 }], ... }
```

`spreadX` then spaces each row evenly across the canvas, and the snap radius
follows the piece size, so a busier stage automatically gets tighter, more
accurate snapping instead of overlapping snap zones. Pieces shrink as the board
fills up (210 → 190 → 145 units in landscape), which is what lets six animals
share a single row and still leaves every piece well over a tenth of the canvas
wide - the size a small hand needs.

The puzzle reflows rather than merely shrinking. Landscape puts the animals in
one row with the tray beneath; portrait uses shallower rows and spends the saved
width on a taller tray. Letterboxing a landscape canvas into an upright phone
would leave the pieces too small to grab, so `chooseLayout()` picks by aspect
ratio. Rotating the device mid-puzzle rebuilds the board but keeps progress.

The background landscape is generated from the layout (`src/scenery.ts`) rather
than being a fixed-size image, so every stage and both orientations share one
piece of art.

## Source map

| File | Role |
| --- | --- |
| `src/geometry.ts` | Pure maths: screen↔logical mapping, snapping, clamping |
| `src/layout.ts` | The stages, their layouts, and all tunable constants |
| `src/scenery.ts` | Generates the background for a layout |
| `src/assets.ts` | Loads and validates the animal SVGs |
| `src/board.ts` | Builds the SVG scene graph for one stage |
| `src/drag.ts` | Pointer-event drag engine |
| `src/game.ts` | Rules, state, and the stage lifecycle |
| `src/audio.ts` | Web Audio sound synthesis |
| `src/celebrate.ts` | Sparkles and the next-puzzle button |
| `scripts/preview.mjs` | Renders the art for review, as a contact sheet or one animal large |
| `scripts/check-art.mjs` | Enforces the asset contract on every animal SVG |
| `scripts/shot.mjs` | End-to-end drag test in headless Chromium |

## Testing

`npm run test` covers the coordinate mapping (including letterboxing in both
orientations), snap tolerance, clamping, the stage list, and every stage layout
in both orientations - holes stay on canvas, snap zones never overlap, tray slots
never collide, pieces stay big enough to grab, and each orientation fills at
least 75% of its viewport.

`npm run shot` is an end-to-end check: it serves the built app, drives real
pointer drags over the Chrome DevTools Protocol, and plays all three stages
through - asserting that pieces snap, that a bad drop does *not* stick, that each
stage hands over to the next, that rotating to portrait preserves progress, and
that the last stage loops back to the first. Screenshots land in `.art/shots/`.

`npm run art:check` covers the artwork itself, which the unit tests can't see:
it rasterises each animal and checks that nothing is clipped by the art box,
that no detail mark strays outside the silhouette, and that `FOOT_LEVEL` matches
where the feet actually are. It needs `rsvg-convert` and ImageMagick, the same
tools `npm run art` uses.
