---
name: "Artwork"
description: "The animal SVG contract, the overhang budget, foot levels, reviewing the render, and how to add an animal."
applyTo: "src/assets/animals/*.svg,src/assets.ts,src/slice-recipes.json,scripts/check-art.mjs,scripts/slices.mjs,scripts/slice-recipes.mjs,scripts/preview.mjs"
---

# Artwork

Every animal is one hand-authored SVG. `npm run art:check` is the mechanised
form of everything below, so run it; but it checks that the art obeys the
contract, not that the art is any good, which is why the steps here begin and
end with looking at it.

## You have to look at the render

An SVG is not a picture until something rasterises it. Coordinates that read
sensibly in the file routinely come out as a leg growing from a shoulder, an eye
floating off the head, or a curve that doubles back through the body. Nobody
authors this well in the blind, and no amount of care over a `d` attribute
substitutes for looking at the result.

So, whenever you add or redraw an animal:

- **Render it and open the image.** `npm run art -- <name>` writes
  `.art/<name>-large.png`, showing the animal in colour beside its bare
  silhouette. View that file. `npm run art:check` passing tells you the art is
  *legal*, not that it is *good*: it measures containment, clipping and foot
  level, and has no opinion on whether the thing looks like a duck.
- **Expect several rounds.** Being right first time is the exception, not the
  standard to hold yourself to. The normal path is draw, render, look, fix,
  render again - four or five passes is ordinary, and each one should be aimed at
  a specific thing you saw and disliked. Do not ship the first version that
  survives the check; ship the first version you would be happy to see in the
  tray.
- **If you cannot see the image, do not add the animal.** An agent with no way to
  view a PNG is authoring blind, and blind SVG authoring is what produces the bad
  art this section exists to prevent. Say that you cannot review the render, and
  stop there; do not commit a plausible-looking path unseen and leave a human to
  find out. New art is one of the few jobs in this repository that genuinely
  cannot be done without eyes. Editing an existing animal is the same job: if the
  change moves a coordinate, it needs the same look.

## Common ways hand-drawn animals go wrong

These all pass `npm run art:check` - it cannot see any of them - and all of them
are obvious the moment you look at the render. They are worth checking for
deliberately, because they are the ones that keep arriving.

- **An impossible mix of side view and front view.** Decide which way the animal
  faces before drawing a single path, then hold it. The usual failure is a body
  drawn cleanly side-on wearing two forward-facing eyes, or a head in profile
  with both ears splayed as if seen head-on, or all four legs drawn out flat
  beside a side view. Ask of every detail whether it would really be visible from
  where the viewer is standing; if the answer is no, cut it. One eye on a profile
  is not a missing eye, it is a profile.
- **Detail that should reach the silhouette but stops short.** A wing edge, a
  shell rim, a belly patch, the line where an ear meets the head: if a mark is
  meant to run to the outline, a hairline of background left showing between them
  reads as a slip rather than a style. Do not eyeball a fresh curve close to the
  outline - copy the silhouette's own coordinates for that stretch so the two
  edges are the same edge. Nudging outward instead is not the fix; it makes an
  undeclared overhang, which does fail the check.
- **A margin that should be even but isn't.** A stripe, a hem or a patch that
  runs parallel to the outline and drifts from a thin gap to a fat one along its
  length looks like a mistake, because it is one. Keep the distance constant, or
  make the mark obviously not parallel so there is no gap to compare.

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
reasoning is [decision 20260727T072917](../../docs/decisions/20260727T072917-budgeted-overhang.md).

## Foot levels

A piece stands on its shape's `anchor`, which for an animal comes from
`FOOT_LEVEL` in `src/assets.ts`: where in the 240x240 art box its feet sit. That
is what makes an animal stand on the ground line instead of being aligned by its
box.

Take the value from `npm run art:check`, which measures where the animal
actually stands. Do not estimate it by eye, and do not nudge it until the animal
merely looks close.

## Where an animal gets cut

Levels 11-15 and 27 hand a child one animal in two to four slices. A slice is
the animal's own artwork seen through a `clipPath`, never a shape cut out of it
([decision 20260729T061500](../../docs/decisions/20260729T061500-slices-are-clipped-not-cut.md)),
so nothing about the SVG contract changes. What changes is that **every animal
now has to survive being cut three ways**, and where those cuts go is measured
from the pixels rather than chosen.

`npm run art:slices` does the measuring. It rasterises each silhouette, searches
straight cuts arranged as a small binary tree, and writes
`src/slice-recipes.json` - one entry per animal per slice count, holding the
cuts and what each slice draws. A cut has to leave every slice:

- **whole** - one connected piece. A cut that strands an ear or a foot as a
  second island is rejected outright, however fair it is, because a child would
  be holding a piece with a gap in it;
- **fair** - within 35% of an equal share of the animal, measured against the
  final share at every cut rather than only at the leaves, so a lopsided first
  cut cannot be built on;
- **grabbable** - at least a 15-unit circle fits inside it, out of the 240-unit
  box. This is measured on the slice itself, not on the box around it.

The numbers are `AREA_TOLERANCE`, `MIN_INSCRIBED` and the angle and offset steps
in `scripts/slices.mjs`; that file is the only place they live, so the search
and the check cannot disagree about what a good cut is.

**The table is committed, exactly like `FOOT_LEVEL`.** `npm run art:check`
re-judges every recipe against the current artwork and fails with the entry to
paste in when one is missing or has gone stale. Redraw an animal and its
recipes go with it: run `npm run art:slices`, look at a sliced level, and commit
the table with the artwork. Never hand-edit a recipe to make a check pass.

The other side of the ink is layout: a slice keeps the whole animal's box, so
the table also records what each slice actually draws, and the tray and the grab
box read that instead of the box. See
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Reading differently from the animal next to it

Two animals that a level can deal together have to be *told apart* at a glance,
because a toddler matches the outline before the detail. That used to be advice;
`npm run art:check` now measures it.

The measure: shrink each silhouette - stroke included, detail hidden - to 48x48,
which is deliberately coarser than the game ever draws one, and score a pair by
how much of the ink they share (intersection over union). Anything over **70%**
fails, naming both animals and the score. The coarseness is the point: at 48
pixels an ear tip, a notch and a tail are already gone, and what is left is the
gross shape a toddler matches on before looking at anything. Nothing is re-centred or re-scaled first: every animal is
drawn in the same 240 box, a level draws every piece at one scale, and a tray
slot holds that box, so the box *is* the frame a child compares them in.

It runs **per theme** (`src/themes.ts`), because a theme is what a level deals
from, so a farm animal and a sea animal never have to be told apart. An animal in
two themes has to be distinct in both.

When it fails, the fix is the silhouette, not the number:

- **Change the mass, not the marks.** The score cannot see an eye, a stripe or a
  colour. Longer legs, a raised head, a wider stance, a tail in the outline: those
  move it. A better face does not.
- **Size is a legitimate lever.** Making a big animal big and a small animal small
  is honest as well as useful - a whale that dwarfs the fish beside it scores
  lower *and* is more true.
- **Or move it to another theme,** if it belongs there anyway.

The measure and where the 70% came from are in
[decision 20260729T004500](../../docs/decisions/20260729T004500-silhouettes-checked-at-a-glance.md).
`ART_SIMILARITY_REPORT=1 npm run art:check` prints every pair in the cast, most
alike first, which is how a new animal's headroom is judged before it is too late
to change it.

## What else the drawing decides

The extent of the artwork is also the area a piece can be picked up by: each one
gets an invisible rectangle around its drawing so a toddler can grab the gap
between a giraffe's legs as well as the legs. It is measured at runtime, so
there is nothing to declare and nothing to keep in step - but it does mean a
deliberate overhang enlarges the grab area a little, which is harmless while the
overhang stays inside its budget. The rule lives in
[`navigation.instructions.md`](navigation.instructions.md).

## Adding an animal

1. Decide which theme it joins, and draw
   `src/assets/animals/<name>.svg` following the contract above. Silhouettes
   should be as *distinct* from each other as possible - toddlers match the
   outline before the detail, so two similar profiles make the puzzle frustrating.
   Within a theme that is enforced, not hoped for: see
   [reading differently from the animal next to it](#reading-differently-from-the-animal-next-to-it)
   above, and look at what its theme already holds before choosing a pose.
2. Render it and look: `npm run art -- <name>`, then open `.art/<name>-large.png`.
   Expect the first render to be wrong somewhere. Fix what you saw, render again,
   and keep going until you would be happy to see it in the tray - several rounds
   is normal, not a sign the animal is beyond saving. If you have no way to view
   the image, stop here and say so rather than carrying on blind.
3. Check it against the others: `npm run art`, then look at
   `.art/contact-sheet.png`. It shows every animal in colour **and** as a bare
   silhouette; if you can't tell what the silhouette is, neither can a
   two-year-old, and if it reads as one of the animals already there, draw
   something else.
4. Register the id in `ANIMAL_IDS`, `SOURCES` and `ANIMAL_THEMES` in
   `src/assets.ts`. Every animal belongs to at least one theme; the check says so.
5. Add its foot level to `FOOT_LEVEL` in `src/assets.ts`, from the value
   `npm run art:check` reports.
6. Run `npm run art:slices` and commit `src/slice-recipes.json`. Nothing works
   out where to cut a new animal at runtime, so an animal with no recipes cannot
   be dealt into a sliced level.
7. Run `npm run art:check`. It verifies the structure, that the art is not
   clipped by the art box, that nothing hangs outside the silhouette except
   declared overhangs, that the declared foot level matches the artwork, and that
   the new silhouette reads differently from every other one in its theme, and
   that it can be cut into two, three and four slices that a child can pick up.
   Passing it is the floor, not the finish line: it cannot see any of the
   pitfalls above.
8. That's it - every animal in `ANIMAL_IDS` is in the draw, so the new one will
   start turning up on its own. To change what a level holds, see
   [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Before calling art finished

- run `npm run art:check`;
- run `npm run art -- <name>` and actually look at the large render - the current
  one, from after your last edit;
- read it against the pitfalls above: one consistent viewpoint, marks that meet
  the outline where they are meant to, even margins where they are meant to be
  even;
- use `npm run art` if the contact sheet helps compare silhouettes;
- say in the pull request that you looked, and at what. "The check passes" is a
  different claim from "I have seen it", and only the second one is about the
  art.

`npm run art:check` covers the artwork itself, which the unit tests can't see:
it rasterises each animal and checks that nothing is clipped by the art box,
that no undeclared detail strays outside the silhouette and declared overhangs
stay within budget, that `FOOT_LEVEL` matches where the feet actually are, that no two animals in one
theme read the same at a glance, and that every committed slice recipe still
cuts the animal it was measured from into whole, fair, grabbable pieces.
It needs `rsvg-convert` and ImageMagick, the same tools `npm run art` uses.
