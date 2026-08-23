# Insist that every piece of a picture has something in it

## Context

Some chapters cut a *picture* into pieces rather than dealing animals: a piece
is a rectangle or shard of a hand-drawn scene, taken from wherever a grid or
partition happens to fall, and the child's whole job is to look at the piece
and know where it belongs.

That makes one failure mode worth more attention than any other, because it is
invisible in the file, invisible in a whole-picture render, and fatal at the
board. A scene that is lovely full size - a wide beach under a wide sky - can
cut into pieces of identical blue with nothing about them to tell apart. A
two-year-old holding one of them has been handed a puzzle with no information
in it, and the game's promise that a child cannot fail is broken by artwork
rather than by code.

Saying "no featureless pieces" in prose is not enough, because nobody compares
every scene against every grid it will ever be cut at, by eye, forever.

## Decision

`npm run art:check` cuts every scene at every grid the level table uses and
measures each resulting cell for how much of it differs from its own
background colour. That is deliberately not a measure of variance: variance
rewards a smooth gradient, which is exactly as unmatchable as a flat colour,
and it punishes a cell that is one flat thing against one flat background -
precisely what a piece of a toddler's jigsaw should look like. The check asks
the question that actually matters: is there a *thing* in this piece?

The measurement is taken at a size much coarser than the game ever draws a
piece, so detail too fine to read at piece size cannot rescue a cell that
would otherwise fail. A cell below the floor fails the whole check, naming
the column and row.

## Consequence

Two things the check deliberately does not do:

- **It does not judge whether a scene is any good.** It cannot see that a barn
  is a barn or that a horizon is a ruled line. `npm run art -- <scene>` draws
  the picture with each grid over it for that reason, and looking at the
  render before calling a scene finished is unchanged from the animals.
- **It does not check the markup.** The rules that make a scene safe to inline
  live in `src/pictures.ts`, which throws on a scene it cannot hand out
  safely, and are exercised by `tests/pictures.test.ts`. Keeping them in one
  place means the loader's own promise to the cutter is what gets tested,
  rather than a second copy of it here that could drift.

Grids come from `src/levels.ts` rather than being listed here, so a new grid
in the table re-judges every scene against it and fails loudly if one of them
cannot take it. That is the intended order of events: the table is allowed to
run ahead of the code, but never ahead of the art.

When the check fails, the fix is the picture, not the number. Put something
recognisable in the empty piece, preferably a big flat shape in a colour the
background is not. Lowering the floor means shipping a piece with nothing in
it to somebody who cannot ask why.
