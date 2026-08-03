# Insist that every piece of a picture has something in it

## Context

Two of the six chapters cut a *picture* into pieces rather than dealing animals:
a jigsaw on a grid from 2x2 up to 4x3, and an irregular partition of the same
artwork. A jigsaw piece is therefore a rectangle of a hand-drawn scene, taken
from wherever the grid happens to fall, and the child's whole job is to look at
the piece and know where it belongs.

Which makes one failure mode worth more attention than any other, because it is
invisible in the file, invisible in a whole-picture render, and fatal at the
board. A scene that is lovely full size - a wide beach under a wide sky - cuts
into four pieces of identical blue. Nothing about them says which is which. A
two-year-old holding one of them has been handed a puzzle with no information in
it, and the game's promise that a child cannot fail is broken by artwork rather
than by code.

The scene contract can say "no featureless pieces" in prose, and the prose can
be ignored. The animals in this repository already showed what happens next:
"draw them distinct from each other" was a rule for months, was obeyed by eye,
and had to be replaced by a measure the day the cast grew past what a person
could hold in their head ([Check silhouettes for distinctness at a
glance](<Check silhouettes for distinctness at a glance.md>)). A scene
is worse, not better: nobody is comparing four scenes, they are comparing the
twelve pieces of one.

## Decision

`npm run art:check` cuts every scene at **every grid the level table uses**, and
measures each cell. A cell under the floor fails the whole check, naming the
column and row.

The measure is **"how much of this piece is not its own background"**: find the
colour the cell is mostly made of, then count the pixels more than `DISTINCT`
(40 of 255, on the widest-differing channel) away from it. Three parts of that
are choices rather than details.

**Not a variance.** Variance is the obvious measure and the wrong one twice
over. It rewards a gradient - a sky shading from pale to deep scores well and is
exactly as unmatchable as a flat one - and it punishes a cell that is one flat
thing against one flat background, which is precisely what a piece of a
toddler's jigsaw should be. Counting what differs from the background answers
the question actually being asked: is there a *thing* in this piece?

**Measured at a quarter size, from a render four times larger.** The scene is
rasterised at 1920x1440 and averaged down to 240x180 before anything is
counted. That is far coarser than the game ever draws a piece, and it is the
other half of the contract: "no detail so fine it vanishes at piece size" is
enforced by *not looking* at that detail. A two-unit line in the 480-unit art
box is a single blended pixel here and cannot carry a cell on its own.

**A tenth, as the floor.** Below a tenth a piece is a wash with a speck in the
corner. Much above it and an honest patch of sky with a cloud in it would be
banned - and a picture with no sky in it is not a picture. The four scenes drawn
against this check clear it with room: the tightest cell of the four at 4x3 is
the night sky's top-left corner at 16%, and the other three sit between 26% and
30%. The floor is not set from those numbers - it is set from what a piece needs
- but the gap between them is what says the floor is a floor rather than a
ceiling everybody is pressed against.

## Consequence

The check is what made the night sky drawable at all. A night sky is one colour
with specks in it, which is this failure in its purest form; knowing the number
turned "draw some stars" into "the stars have to be a fingertip across and there
have to be several of them in that corner". It is still the tightest scene in
the library - its worst cell sits at 16% against the others' 26% and up - and it
is the one to look at first when a rule here seems excessive.

Two things the check deliberately does not do:

- **It does not judge whether a scene is any good.** It cannot see that a barn
  is a barn, that the crab has too many legs, or that the horizon is a ruled
  line. `npm run art -- <scene>` draws the picture with each grid over it for
  exactly that reason, and the instruction to look at the render before calling
  a scene finished is unchanged from the animals.
- **It does not check the markup.** The rules that make a scene safe to inline -
  no ids, nothing pointing outside itself, no text - live in `src/pictures.ts`,
  which throws on a scene it cannot hand out safely, and are exercised by
  `tests/pictures.test.ts`. Keeping them in one place means the loader's promise
  to the cutter is the promise being tested, rather than a second copy of it in
  a script that might drift.

The grids come from `src/levels.ts` rather than being listed here, so adding a
5x4 level to the table re-judges every scene against it and fails loudly if one
of them cannot take it. That is the intended order of events: the table is
allowed to run ahead of the code, but never ahead of the art.

When the check fails, the fix is the picture, not the number. Put something in
the empty piece - the same something that would make it worth looking at - and
prefer a big flat shape in a colour the background is not. Lowering the floor
means shipping a piece with nothing in it to somebody who cannot ask why.
