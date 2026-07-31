# 20260729T061500. Slices are clipped, not cut

## Context

The sliced-animal chapter (levels 11-15, and level 27) hands a child one animal
in two to four pieces. The obvious way to build it is to cut the animal up:
intersect the silhouette path with a polygon and get four new outlines, one per
slice. It is also how every jigsaw generator on the internet does it.

Three things are wrong with that here.

The first is arithmetic. Path intersection means a polygon boolean library at
runtime, and this project has no runtime dependencies at all
([20260727T072917](20260727T072917-no-binary-assets-or-runtime-dependencies.md)).
Writing one is a fortnight and a source of rounding errors forever. Bezier
curves - which every animal here is made of - are the part that goes wrong.

The second is that a cut animal is four new shapes, and four new shapes have to
be put back together. Each one would need its own position within the hole,
worked out and stored, and every one of those numbers is a chance for a slice to
sit a pixel out. A two-year-old will not notice a pixel. They will notice a
seam.

The third is the invariant this whole game is built on: the piece and its hole
are drawn from one path
([`product.instructions.md`](../../.github/instructions/product.instructions.md)),
so a piece cannot drift out of alignment with the hole it fills. A cut slice has
no hole of its own to be aligned with. It has a quarter of one.

## Decision

**A slice is the animal's own artwork, drawn through a `clipPath`.** Nothing is
cut. `src/slices.ts` builds one convex cell per slice and hands the animal's
existing `artwork` string to a `<g clip-path="...">`. The slices of an animal
are therefore, literally, the same drawing shown through different windows: they
mesh along their shared edge because it is one edge, and the assembled animal is
the animal because it is the animal.

**One hole per animal, not one per slice.** The hole is cut from the animal's
own silhouette, exactly as a shape-match hole is, and every slice of that animal
keeps the animal's box, anchor and outline. So the layout gives all of them one
scale and one origin, and a slice settling into place has nowhere else to go.
The slices assemble by construction; no code adds up where the parts belong.

The hole also stays visible under the half-built animal, and fades only when the
last slice arrives. A child who cannot read needs to be able to see what is
missing.

**Where to cut is measured offline, from pixels.** A cut has to leave every
slice in one piece, roughly fair, and fat enough to pick up, and none of those
can be read off path data - they are questions about the rendered animal. So
`npm run art:slices` rasterises each animal, searches straight cuts arranged as
a small binary tree, and writes `src/slice-recipes.json`; `npm run art:check`
re-judges what was committed and prints the replacement when the artwork has
moved on. That is the same bargain `FOOT_LEVEL` strikes: a script measures it, a
human commits it, and the check is what stops the two drifting apart.

Straight cuts are not a limitation to be lifted later. They are what makes every
cell convex, and convex is what lets a cell be rebuilt at runtime by clipping a
rectangle with a few half-planes - forty lines of arithmetic with no library
behind them, and a tiling of the art box that `tests/slices.test.ts` can prove
has no gaps and no overlaps without opening a browser.

## Consequence

A slice keeps a box that is mostly empty: the bottom-left quarter of a giraffe
is a 240x240 box with a foot in it. Everything that treats a piece as a thing to
look at and to grab had to learn the difference, so `PieceShape` gained `inked`
- what the piece actually draws - and the tray, the canvas clamp and the grab
box read that instead of the box. Without it a tray of eight slices would be
laid out as though it held eight whole animals, and every slice of an animal
would get the same animal-sized grab box and fight over a press.

The cut edges are picked out in white, clipped to the silhouette, so the joins
read as joins rather than as a crack in the drawing - until the slice is home,
when the edge fades and the animal is an animal again
([20260730T194500](20260730T194500-a-placed-piece-has-no-edge.md)).

Nothing here knows about jigsaw tabs. A jigsaw piece is a cell with a wavy edge,
which is the same idea with a harder clip path; if that chapter wants one, it
can have one without any of this changing.
