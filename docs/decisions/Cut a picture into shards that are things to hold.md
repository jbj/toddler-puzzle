# Cut a picture into shards that are things to hold

## Context

The shatter kind cuts a scene into irregular, many-sided pieces rather than
rows and columns, and is meant to be matched by outline rather than by
drawn content. That only holds if the shards are shapes a two-year-old can
tell apart and get a hand around.

Scattering points and cutting a Voronoi diagram over them is the obvious way
to generate irregular pieces, and it fails both ways at once: two points
that land close together give a long thin sliver that reads as a splinter
and cannot be picked out of a tray, while spreading points evenly to avoid
slivers just turns every cell into an indistinguishable rounded blob. There
is also a scale trap - the tray sizes every piece by the largest one, so a
single oversized shard shrinks every other piece in the deal, and the
smallest shard is the one a small hand actually has to find. A partition
that is fine only on average is not fine.

## Decision

Split recursively by half-planes rather than by Voronoi: take the picture
box, choose a line, cut, and recurse on both halves. A convex polygon cut by
a line always yields two convex polygons, so every shard is convex by
construction - it does not need to be checked afterwards, because a concave
notch cannot happen.

A candidate cut must also satisfy several floors on the *shape* of each
resulting region, applied not only to finished shards but to every
intermediate region as the recursion proceeds:

- an **area** floor and ceiling relative to an even share, so no shard is a
  crumb and none is large enough to shrink the rest;
- a **fatness** floor (a scale-free measure of how far a shape is from a
  splinter), so nothing comes out too thin to be a sliver;
- a **spread** ceiling, so no single shard is long enough to set the scale
  for the whole tray.

Meeting these floors requires searching rather than committing greedily: a
region can pass every floor on its own and still be impossible to divide
further, so a partition is planned first on plain polygons - with
backtracking and the option to abandon a whole plan and start over - and
only a plan whose every leaf clears every floor is replayed onto the real
mesh. Among candidate cuts that pass, one is chosen at random rather than by
picking the roomiest option, because favoring roominess drifts the result
toward a grid, which is exactly what this kind must not look like.

The mesh preserves the jigsaw's guarantee that every internal edge is
generated once and shared between neighbors (see [Every cut is made
once](<Every cut is made once.md>)), so shards tile the box exactly with no
gaps or overlaps, and cutting stays clipping rather than intersecting (see
[Slices are clipped, not cut](<Slices are clipped, not cut.md>)).

Because a shatter's cells are dealt fresh and never the same twice, the "every
piece has something worth seeing in it" promise (see [Insist that every piece
of a picture has something in
it](<Insist that every piece of a picture has something in it.md>)) is
checked against the underlying picture rather than
against a fixed partition: the art check slides a square sized to the
smallest shard allowed over the scene and requires the emptiest position to
still clear the bar, since a real shard of that area always contains a whole
square of that size.

## Consequence

Every shard comes out convex, adequately fat, and no smaller than its area
floor, so a child can sort a deal's shards by looking at their outlines. The
floors are tight enough to be a promise and loose enough to leave search room
- they should be loosened, not tightened, if a future level asks for
more shards per deal, since tightening them further risks the search failing
outright at high piece counts.

The cost is that the shatter cutter is the most intricate geometry in the
project - a half-plane clipper, a fatness/spread measure, a conforming-mesh
edge split, and a backtracking search - but this is what makes the floors
true by construction rather than by luck, and the test suite sweeps them
over many seeds and piece counts rather than checking a single deal.
