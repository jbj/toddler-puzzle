---
name: "Artwork"
description: "The animal SVG contract, the overhang budget, foot levels, and how to add or review an animal."
applyTo: "src/assets/animals/*.svg,src/assets.ts,scripts/check-art.mjs,scripts/preview.mjs"
---

# Artwork

Every animal is one hand-authored SVG. `npm run art:check` is the mechanised
form of everything below, so run it; but it checks that the art obeys the
contract, not that the art is any good, which is why the steps here end with
looking at it.

## The contract

Each animal SVG uses the shared art box:

```svg
<svg viewBox="0 0 240 240">
  <path id="silhouette" d="..."/>   <!-- one closed outer outline -->
  <g id="detail"> ... </g>          <!-- eyes, ears, spots -->
</svg>
```

- `viewBox="0 0 240 240"`
- exactly one closed `<path id="silhouette" d="...">`
- a `<g id="detail">` for eyes, markings, ears, spots, and similar detail

`src/assets.ts` imports these with Vite's `?raw` and turns each one into a
`PieceShape` (`src/piece.ts`): an id, one `outline`, the `artwork` drawn inside
it, the box it was authored in, and the `anchor` it stands on. If a file is
missing its silhouette, or uses the wrong `viewBox`, loading throws immediately
rather than shipping an unsolvable puzzle.

## Why hole and piece share one path

The engine knows only that shape - animals are simply one provider of them - and
uses **the same `outline` path** twice: once filled dark to cut the hole in the
scene, and once in full colour to draw the draggable piece. A piece therefore
cannot drift out of alignment with its hole. Do not split the outline into
separate piece and hole drawings.

Two rules follow from that shared path, and `npm run art:check` enforces both:

- **Detail has to stay inside the silhouette, unless it is meant not to.** The
  hole is cut from the outline alone, so a mark drawn past it hangs over the
  edge of the hole when the piece drops in.
- **Every overhang is declared.** Tag the element `data-overhang="tail"`.

## Overhanging on purpose

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

The check reports the share so it can be judged rather than guessed. The
reasoning is [decision 0003](../../docs/decisions/0003-budgeted-overhang.md).

## Foot levels

A piece stands on its shape's `anchor`, which for an animal comes from
`FOOT_LEVEL` in `src/assets.ts`: where in the 240x240 art box its feet sit. That
is what makes an animal stand on the ground line instead of being aligned by its
box.

Take the value from `npm run art:check`, which measures where the animal
actually stands. Do not estimate it by eye, and do not nudge it until the animal
merely looks close.

## Adding an animal

1. Draw `src/assets/animals/<name>.svg` following the contract above. Silhouettes
   should be as *distinct* from each other as possible - toddlers match the
   outline before the detail, so two similar profiles make the puzzle frustrating.
   A new animal must be distinct in outline from duck, turtle, giraffe, elephant,
   butterfly, and rabbit.
2. Check it renders: `npm run art`, then look at `.art/contact-sheet.png`. It
   shows every animal in colour **and** as a bare silhouette; if you can't tell
   what the silhouette is, neither can a two-year-old.
3. Review it close up with `npm run art -- <name>`. The contact sheet is too
   small to judge whether details line up with the outline, which is exactly
   where hand-drawn art goes wrong.
4. Register the id in `ANIMAL_IDS` and `SOURCES` in `src/assets.ts`.
5. Add its foot level to `FOOT_LEVEL` in `src/assets.ts`, from the value
   `npm run art:check` reports.
6. Run `npm run art:check`. It verifies the structure, that the art is not
   clipped by the art box, that nothing hangs outside the silhouette except
   declared overhangs, and that the declared foot level matches the artwork.
7. That's it - every animal in `ANIMAL_IDS` is in the draw, so the new one will
   start turning up on its own. To make a stage *bigger*, see
   [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md); that is a
   change to stage sizes, which needs a human decision first.

## Before calling art finished

- run `npm run art:check`;
- run `npm run art -- <name>` and actually look at the large render;
- use `npm run art` if the contact sheet helps compare silhouettes.

`npm run art:check` covers the artwork itself, which the unit tests can't see:
it rasterises each animal and checks that nothing is clipped by the art box,
that no undeclared detail strays outside the silhouette and declared overhangs
stay within budget, and that `FOOT_LEVEL` matches where the feet actually are.
It needs `rsvg-convert` and ImageMagick, the same tools `npm run art` uses.
