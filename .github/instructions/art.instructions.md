---
name: "Artwork"
description: "The animal SVG contract, the scene contract for pictures that get cut up, the overhang budget, foot levels, reviewing the render, and how to add either."
applyTo: "src/assets/animals/*.svg,src/assets/scenes/*.svg,src/assets.ts,src/pictures.ts,src/slice-recipes.json,scripts/check-art.mjs,scripts/pictures.mjs,scripts/slices.mjs,scripts/slice-recipes.mjs,scripts/preview.mjs"
---

# Artwork

Two kinds of art live here: **animals** (one hand-authored SVG each) and
**picture scenes** (whole pictures a later chapter cuts into jigsaw pieces,
[below](#picture-scenes)). `npm run art:check` mechanises the contract below.
It checks that the art is *legal*, not that it is *good* - so authoring both
begins and ends with looking at the render.

## You have to look at the render

An SVG is not a picture until something rasterises it, and coordinates that read
fine in the file come out as a leg growing from a shoulder. Whenever you add or
redraw an animal or scene, or move any coordinate in one:

- **Render it and open the image.** `npm run art -- <name>` writes
  `.art/<name>-large.png` (animal in colour beside its bare silhouette). View it.
  `art:check` passing means legal, not good.
- **Expect several rounds.** Draw, render, look, fix, render again; four or five
  passes is ordinary. Ship the first version you would be happy to see in the
  tray, not the first that survives the check.
- **If you cannot see the image, do not add or change the art.** Say you cannot
  review the render and stop. Do not commit a plausible path unseen.

## Common failures the check cannot see

All pass `art:check`; all are obvious on the render. Check for them deliberately.

- **A mix of side and front view.** Decide which way the animal faces before
  drawing, then hold it. One eye on a profile is not a missing eye.
- **Detail that should reach the silhouette but stops short.** Copy the
  silhouette's own coordinates for that stretch. Do not eyeball a curve near the
  outline, and do not nudge outward - that makes an undeclared overhang, which
  does fail the check.
- **A margin that should be even but isn't.** Keep the distance from the outline
  constant, or make the mark obviously not parallel.

## The animal contract

```svg
<svg viewBox="0 0 240 240">
  <path id="silhouette" d="..."/>   <!-- one closed outer outline -->
  <g id="detail"> ... </g>          <!-- eyes, ears, spots -->
</svg>
```

- `viewBox="0 0 240 240"`, exactly.
- exactly one closed `<path id="silhouette" d="...">`.
- a `<g id="detail">` for eyes, markings, ears, spots.

`src/assets.ts` imports these with Vite's `?raw` into a `PieceShape`
(`src/piece.ts`): id, `outline`, `artwork`, the authored box, and the `anchor`
it stands on. A missing silhouette or wrong `viewBox` throws at load, not at
play. Every animal is parsed at startup (level 2 wants one).

### One path, drawn twice

The same `outline` cuts the hole (filled dark) and draws the piece (full
colour), so a piece cannot drift out of alignment with its hole. Do not split
the outline into separate piece and hole drawings. Two rules follow, both
enforced by `art:check`:

- **Detail stays inside the silhouette** unless meant not to - the hole is cut
  from the outline alone, so a mark past it hangs over the hole's edge.
- **Every overhang is declared** by tagging the element `data-overhang="tail"`.

### Overhang budget

- An **untagged** mark outside the outline fails.
- A **tagged** one is allowed, up to **3% of the animal's area** (both tails sit
  near 1.5%). The check reports the share. See
  [Budget overhang instead of banning it](<../../docs/decisions/Budget overhang instead of banning it.md>).

### Foot level

A piece stands on its shape's `anchor`; for an animal that comes from
`FOOT_LEVEL` in `src/assets.ts` - where in the 240x240 box its feet sit. Take
the value from `npm run art:check`, never by eye.

### The drawn box (`ANIMAL_INK`)

An animal does not fill its box. `ANIMAL_INK` in `src/assets.ts` records where
the drawing sits inside the 240x240 box - left, top, width, height in art units,
stroke and tagged overhang included. That box is the one the game measures a
piece by: grab, hold on canvas, tray cell, and drop closeness ([One box measures
a piece, and one rule places
it](<../../docs/decisions/One box measures a piece, and one rule places it.md>)).
Take it from `npm run art:check`, never by eye; the check insists the declared
box contains all of the drawing and refuses a box more than two art units larger
than the drawing on any side.

### Slice recipes

Levels 11-15 and 27 hand a child one animal in two to four slices. A slice is
the animal's artwork seen through a `clipPath`, never a shape cut out of it
([Slices are clipped, not
cut](<../../docs/decisions/Slices are clipped, not cut.md>)), so the SVG
contract is unchanged - but every animal has to survive being cut three ways.

`npm run art:slices` rasterises each silhouette, searches straight cuts arranged
as a small binary tree, and writes `src/slice-recipes.json` - one entry per
animal per slice count, holding the cuts and what each slice draws. Every slice
must be:

- **whole** - one connected piece; a stranded ear or foot is rejected.
- **fair** - within 35% of an equal share, measured against the final share at
  every cut, not only at the leaves.
- **grabbable** - at least a 15-unit circle fits inside it (of the 240-unit
  box), measured on the slice, not the box around it.

The numbers `AREA_TOLERANCE`, `MIN_INSCRIBED` and the angle and offset steps
live only in `scripts/slices.mjs`, so search and check cannot disagree.

The table is committed like `FOOT_LEVEL`. `art:check` re-judges every recipe and
fails with the entry to paste when one is missing or stale. Redraw an animal,
then run `npm run art:slices`, look at a sliced level, and commit the table with
the artwork. Never hand-edit a recipe to pass a check.

A slice keeps the whole animal's box, so the table also records what each slice
draws, and the tray and grab box read that instead
([`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md)). That recorded
box is a few units bigger than the pixels, and the check asks whether it
*covers* the drawing rather than matches it: two rasterisers (CI's librsvg,
ImageMagick) disagree by a couple of units, and the box is the child's grab box,
so it may be a whisker larger than the drawing and never smaller.

### Telling animals apart

Two animals a level can deal together must be told apart at a glance - a toddler
matches the outline before the detail - and `art:check` measures it. It shrinks
each silhouette (stroke included, detail hidden) to 48x48 and scores a pair by
intersection over union; over **70%** fails, naming both animals and the score.
The coarseness is the point: at 48 pixels an ear tip, notch or tail is gone.
Nothing is re-centred or re-scaled - every animal is in the same 240 box, drawn
at one scale, in a tray slot that holds that box.

It runs **per theme** (`src/themes.ts`); an animal in two themes must be
distinct in both. When it fails, fix the silhouette, not the number:

- **Change the mass, not the marks** (longer legs, raised head, wider stance,
  tail in the outline). The score cannot see a face, a stripe or a colour.
- **Size is a legitimate lever** - a whale that dwarfs the fish scores lower.
- **Or move it to another theme,** if it belongs there anyway.

See [Check silhouettes for distinctness at a
glance](<../../docs/decisions/Check silhouettes for distinctness at a glance.md>).
`ART_SIMILARITY_REPORT=1 npm run art:check` prints every pair, most alike first.

### The grab box

Each piece gets an invisible rectangle around its drawing so a toddler can grab
the gap between a giraffe's legs. It is measured at runtime - nothing to declare
- so a deliberate overhang enlarges the grab area a little, harmless within
budget. See [`navigation.instructions.md`](navigation.instructions.md).

## Adding an animal

1. Decide its theme and draw `src/assets/animals/<name>.svg` to the contract.
   Make the silhouette as distinct as possible; distinctness is enforced per
   theme ([above](#telling-animals-apart)). Look at what the theme already holds
   before choosing a pose.
2. Render and look: `npm run art -- <name>`, open `.art/<name>-large.png`.
   Expect the first render to be wrong; several rounds is normal. No way to view
   it? Stop and say so.
3. Compare with the others: `npm run art`, open `.art/contact-sheet.png` (colour
   **and** bare silhouette). If you cannot tell what the silhouette is, neither
   can a two-year-old; if it reads as an existing animal, draw something else.
4. Register the id in `ANIMAL_IDS`, `SOURCES` and `ANIMAL_THEMES` in
   `src/assets.ts`. Every animal belongs to at least one theme.
5. Add its foot level to `FOOT_LEVEL` and its drawn box to `ANIMAL_INK` in
   `src/assets.ts`, both from `npm run art:check`.
6. Run `npm run art:slices` and commit `src/slice-recipes.json`. An animal with
   no recipes cannot be dealt into a sliced level.
7. Run `npm run art:check`. It verifies structure, no clipping by the art box,
   nothing outside the silhouette except declared overhangs within budget,
   `FOOT_LEVEL` and `ANIMAL_INK` matching the artwork, distinctness within the
   theme, and that it cuts into two, three and four grabbable slices. Passing is
   the floor, not the finish line.
8. Every animal in `ANIMAL_IDS` is in the draw, so the new one turns up on its
   own. To change what a level holds, see
   [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Picture scenes

A scene is a whole hand-drawn picture a later chapter cuts into pieces. Scenes
live in `src/assets/scenes/`, are handed out by `src/pictures.ts`, and are
checked by the same `npm run art:check`. Render, look and expect several rounds
as above; one extra rule applies, [below](#every-piece-has-to-have-something-in-it).

### The scene contract

- **`viewBox="0 0 480 360"`**, exactly. Every grid the level table uses (2x2,
  3x2, 3x3, 4x3) divides it into whole units. `PICTURE_BOX` in `src/pictures.ts`
  is the same numbers.
- **One `<g id="scene">` wrapper** around everything drawn; its contents are what
  the game inlines, possibly several times in one document.
- **Nothing inside may carry an `id`**, and nothing may point outside itself: no
  `href`, `url(...)`, `<image>`, `<use>`, `<script>` or `<foreignObject>`, and no
  `<defs>`, gradients, clip paths, masks or filters. In practice: flat filled
  shapes.
- **No text.**
- **The whole box is painted, opaquely.** A transparent patch becomes a piece
  with a hole in it.
- **No detail so fine it vanishes at piece size.**
- **Something in every piece** ([below](#every-piece-has-to-have-something-in-it)).

`src/pictures.ts` enforces the markup rules and throws on a scene it cannot inline
safely; `art:check` enforces the box, the wrapper, the registration and
everything only pixels can answer.

### When the artwork loads

Animals are in the first download; **scenes are not**. They ride in with the
puzzle kinds that cut them (their own chunks), which `src/warm.ts` pulls in
during play, so `loadPictures()` no longer runs at startup and a malformed scene
would not throw there. The guarantee is enforced earlier instead: `art:check`
judges every scene, and `tests/pictures.test.ts` calls `loadPictures()` and
asserts the whole catalogue parses and is safe to inline. Both run in `npm run
verify`. Do not add an eager parse back. See [A chapter is warmed before it is
needed, not fetched when it
is](<../../docs/decisions/A chapter is warmed before it is needed, not fetched when it is.md>).

### Every piece has to have something in it

`art:check` cuts each scene at every grid the level table uses and measures each
cell: it finds the cell's dominant colour and counts how much of the cell
differs more than a little from it. A cell under **10%** fails, naming the column
and row. The measurement is coarse - the render is averaged to 240x180 first -
so a speck cannot carry a piece.

**When it fails, fix the picture.** Open `npm run art -- <scene>`, find the named
cell, and put one big flat shape in a colour the background is not: a cloud, a
bird, a bush, a stone. Do not lower the floor, do not add a gradient (it passes
nothing here), do not add fine detail. A big empty sky, sea or field is the
enemy; spread the interest to the corners. See [Insist that every piece of a
picture has something in
it](<../../docs/decisions/Insist that every piece of a picture has something in it.md>).

### Adding a scene

1. Draw `src/assets/scenes/<id>.svg` to the contract. Start by deciding what
   lives in each of the twelve cells of a 4x3 grid.
2. Register the id in `PICTURE_IDS` and `SOURCES` in `src/pictures.ts`, with a
   label a grown-up would recognise.
3. Render and look: `npm run art -- <id>` writes `.art/<id>-large.png` plus one
   image per grid with the cut lines over it. Judge the picture, then each piece.
4. Compare: `npm run art -- scenes`, open `.art/scene-sheet.png`.
5. Run `npm run art:check`; it reports the thinnest cell of every grid.

A scene the level table does not name is allowed - the library may run ahead of
the ramp - but a scene the table *does* name must exist, and the check says so.

## Before calling art finished

- run `npm run art:check`;
- run `npm run art -- <name>` (scene: `npm run art -- <id>`) and look at the
  current large render, and at the gridded renders for a scene;
- read it against the pitfalls above: one consistent viewpoint, marks that meet
  the outline where meant to, even margins where meant to be even;
- use `npm run art` for the contact sheet if it helps compare silhouettes;
- say in the pull request that you looked, and at what.

`art:check` needs `rsvg-convert` and ImageMagick, the tools `npm run art` uses.
It covers only the artwork the unit tests cannot see (steps 7 above and the scene
checks); "the check passes" is a different claim from "I have seen it".
