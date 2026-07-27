# Animal Puzzle

A drag-and-drop shape puzzle for toddlers. Animals wait in a tray; each one is
dragged onto the matching animal-shaped hole in the landscape. The game is three
puzzles long and grows as it goes - **three animals, then four, then six** - so
the first win comes quickly and the board fills up from there. Finish one and a
big arrow leads to the next; finish the last and the arrow starts the game over.

**Every puzzle is dealt fresh.** Which animals turn up and the order they stand
in are drawn at random each time a puzzle starts, so the same three animals are
never waiting in the same places twice. Add `?seed=123` to the URL to replay a
particular deal - the screenshot run uses it to keep its shots comparable.

Works with a finger or a mouse, in landscape or portrait.

Contributors and agents should also read `AGENTS.md` before changing the
project. It is the working agreement: what must be checked, which invariants
must not be weakened, and when a human decision is needed. The lightweight
records in `docs/decisions/` explain choices that are easy to mistake for
oversights.

```
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run verify` | Single check that has to pass before a pull request: lint, format check, build, tests, art check, and screenshot run |
| `npm run lint` | ESLint |
| `npm run format` | Formats with Prettier |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run test` | Unit tests (Vitest) |
| `npm run art` | Renders the animal art to `.art/contact-sheet.png` for review; `npm run art -- rabbit` renders one animal large |
| `npm run art:check` | Checks every animal against the asset contract (structure, containment, foot level) |
| `npm run shot` | Drives real drags in headless Chromium and screenshots the result (run `npm run build` first) |
| `npm run shot:sheet` | Rebuilds `.art/shots/contact-sheet.png` from the last run's screenshots |

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

## The host and the kind

`src/game.ts` holds no rules. It is a host: it owns picking a piece up,
following the finger, settling it back down, the sounds, the sparkles and the
three-stage lifecycle. Everything that could differ between one sort of level
and another comes from a `PuzzleKind` (`src/puzzle.ts`):

```ts
interface PuzzleKind {
  readonly id: string;
  deal(level: LevelSpec, random: () => number): Puzzle;
  backdrop(puzzle: Puzzle, layout: Layout): string;
  target(puzzle: Puzzle, layout: Layout, piece: PieceId): Point;
  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean;
  isComplete(puzzle: Puzzle): boolean;
}
```

The animal game is one such kind, `src/kinds/shape-match.ts`, and the host
cannot tell it from any other: it deals a random cast, draws the landscape with
a hole cut for each piece, accepts a drop near a piece's *own* hole, and is done
when every piece is standing in one.

`isComplete` is part of the contract rather than assumed, because not every kind
ends with an empty tray - a cause-and-effect level ends when enough things have
been touched. `backdrop` is redrawn whenever the puzzle moves on, which is how a
filled hole hides itself under the piece now covering it.

What the host does insist on is that the game stays forgiving: a drop the kind
refuses drifts gently back to the tray with a soft tone, never off screen.

## How pieces and holes stay in sync

Each animal is one SVG file with a strict structure:

```svg
<svg viewBox="0 0 240 240">
  <path id="silhouette" d="..."/>   <!-- one closed outer outline -->
  <g id="detail"> ... </g>          <!-- eyes, ears, spots -->
</svg>
```

`src/assets.ts` imports these with Vite's `?raw` and turns each one into a
`PieceShape` (`src/piece.ts`): an id, one `outline`, the `artwork` drawn inside
it, the box it was authored in, and the `anchor` it stands on. The engine knows
only that shape - animals are simply one provider of them - and uses **the same
`outline` path** twice: once filled dark to cut the hole in the scene, and once
in full colour to draw the draggable piece. A piece therefore cannot drift out of
alignment with its hole. If a file is missing its silhouette, or uses the wrong
`viewBox`, loading throws immediately rather than shipping an unsolvable puzzle.

Two rules follow from that shared path, and `npm run art:check` enforces both:

- **Detail has to stay inside the silhouette, unless it is meant not to.** The
  hole is cut from the outline alone, so a mark drawn past it hangs over the
  edge of the hole when the piece drops in.
- **Every overhang is declared.** Tag the element `data-overhang="tail"`.

### Overhanging on purpose

A little overhang looks *better* than the alternative. The giraffe's tail and
the rabbit's cottontail both read as tails precisely because they break the
outline; tucked inside they flatten into markings. So the policy is about
intent, not purity:

- an **untagged** mark outside the outline fails, because nobody chose it -
  these are the accidents, like a mouth line grazing a cheek or a spot half off
  a neck, easy to draw and hard to see at tray size;
- a **tagged** one is allowed, up to a budget of **3% of the animal's area**.
  Both tails sit near 1.5%. Past a few percent a piece stops looking styled and
  starts looking like it doesn't fit its hole.

The check reports the share so it can be judged rather than guessed.

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
5. Add its foot level to `FOOT_LEVEL` in `src/assets.ts` - where in the 240x240
   art box its feet sit, which becomes the shape's anchor, so it stands on the
   ground line instead of being aligned by its box. Don't measure it by hand:
   `npm run art:check` reports the right value.
6. Run `npm run art:check`. It verifies the structure, that the art is not
   clipped by the art box, that nothing hangs outside the silhouette except
   declared overhangs, and that the declared foot level matches the artwork.
7. That's it - every animal in `ANIMAL_IDS` is in the draw, so the new one will
   start turning up on its own. To make a stage *bigger*, bump its entry in
   `STAGE_SIZES` and the matching row counts in the `LANDSCAPE` and `PORTRAIT`
   arrangements (see below). The layout tests fail if a stage's rows and its
   animals disagree, if holes overlap, if snap zones collide, or if anything
   falls off the canvas.

## Stages and layout

`STAGE_SIZES` in `src/layout.ts` says how many pieces each stage holds;
`pickStagePieces` deals that many at random from the shapes on offer, which fixes
both the cast and the order they are laid out in. Everything else about a stage - two
layouts, one per orientation - is generated from a small arrangement table: how
many animals stand on each ground line, how many wait in each tray row, and how
big a piece is.

```ts
{ pieceSize: 145, sceneRows: [{ groundY: 428, count: 6 }], trayRows: [{ top: 505, count: 6 }], ... }
```

Layouts are therefore built when a puzzle starts rather than up front: a hole's
height depends on the anchor of whichever piece was dealt into that place.

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
| `src/piece.ts` | What a piece is: `PieceId` and `PieceShape`, independent of any provider |
| `src/puzzle.ts` | What a kind of puzzle is: the `PuzzleKind` contract the host plugs into |
| `src/kinds/shape-match.ts` | The animal-and-hole game, as one `PuzzleKind` |
| `src/layout.ts` | The stages, their layouts, and all tunable constants |
| `src/scenery.ts` | Generates the background for a layout |
| `src/assets.ts` | Loads and validates the animal SVGs, as piece shapes |
| `src/board.ts` | Builds the SVG scene graph for one stage |
| `src/drag.ts` | Pointer-event drag engine |
| `src/game.ts` | The host: drag state, settling, sound, sparkles, stage lifecycle |
| `src/audio.ts` | Web Audio sound synthesis |
| `src/celebrate.ts` | Sparkles and the next-puzzle button |
| `scripts/preview.mjs` | Renders the art for review, as a contact sheet or one animal large |
| `scripts/check-art.mjs` | Enforces the asset contract on every animal SVG |
| `scripts/shot.mjs` | End-to-end drag test in headless Chromium |
| `scripts/shot-sheet.mjs` | Packs the run's screenshots into one image to attach to a pull request |

## Testing

CI runs the whole of `npm run verify` on every pull request. It does not post
the screenshots: the author attaches them, having run the same command. Why that
way round is [decision 0006](docs/decisions/0006-screenshots-come-from-the-author.md).

`npm run test` covers the coordinate mapping (including letterboxing in both
orientations), snap tolerance, clamping, the random deal, the shape-match kind's
rules - it accepts a sloppy drop on a piece's own hole, never accepts anybody
else's, and only finishes when the last piece is in - and every stage layout
in both orientations - holes stay on canvas, snap zones never overlap, tray slots
never collide, pieces stay big enough to grab, and each orientation fills at
least 75% of its viewport. Because the cast is random, the layout checks run
against a rotation of the animal list that puts every animal in every place.

`npm run shot` is an end-to-end check: it serves the built app, drives real
pointer drags over the Chrome DevTools Protocol, and plays all three stages
through - asserting that pieces snap, that a bad drop does *not* stick, that each
stage hands over to the next, that rotating to portrait preserves progress, that
the last stage loops back to the first, and that different seeds deal different
puzzles while one seed always deals the same. Screenshots land in `.art/shots/`,
alongside a `contact-sheet.png` that collects them into one image to drag into a
pull request.

`npm run art:check` covers the artwork itself, which the unit tests can't see:
it rasterises each animal and checks that nothing is clipped by the art box,
that no undeclared detail strays outside the silhouette and declared overhangs
stay within budget, and that `FOOT_LEVEL` in `src/assets.ts` matches where the feet actually are. It needs `rsvg-convert` and ImageMagick, the same
tools `npm run art` uses.
