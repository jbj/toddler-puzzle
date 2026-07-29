# 20260729T124500. Cut a picture into shards that are things to hold

## Context

The shatter kind cuts a scene into irregular pieces: not rows and columns, but
many-sided shapes, no two alike. It is meant to be the *easier* of the two
picture kinds despite looking harder, because a shard can be matched by its
outline - the skill the shape-match levels spend six chapters building - where a
jigsaw piece has to be matched by what is drawn on it.

That only holds if the shards are shapes a two-year-old can tell apart and get a
hand around. The obvious way to make irregular pieces is a Voronoi diagram over
scattered points, and the obvious thing that comes out of one is slivers: two
points near each other give a long thin wedge that reads as a splinter, is
impossible to pick out of a tray, and, being nearly the same as the next
splinter, defeats the whole point of the kind. Scattering the points more evenly
fixes the slivers by making every cell a rounded blob, which defeats it the
other way.

There is also a scale trap. The tray sizes every piece by the largest one, so
one wide shard makes all the others small; and the smallest shard is what a
small hand actually has to find. A partition that is *on average* fine is not
fine.

## Decision

Not Voronoi. `src/shatter.ts` **splits recursively by half-planes**: take the
picture box, choose a line, cut, recurse on both halves. A convex polygon cut by
a line gives two convex polygons, so **every shard is convex by construction** -
"readable shapes, no deep concave notch" is not a thing that is checked
afterwards, it is a thing that cannot happen.

Four floors decide whether a candidate cut is allowed, and each catches
something the others miss:

- **area**, between 0.7 and 1.35 of an even share, so no shard is a crumb and
  none is so large it shrinks the rest;
- **fatness** - inradius over the square root of area - at least 0.3, which is
  the minimum inscribed radius in scale-free form: never much thinner than three
  to one, so nothing is a splinter;
- **spread** - the longest side of the bounding box over the square root of area
  - at most 1.5, which is what stops one long shard setting the scale for the
  tray;
- and all three are applied to the *intermediate* regions too, against the
  pieces they still owe, not only to the finished shards.

The floors are met by **searching, not by trying**. Splitting greedily and
hoping gets stuck about a quarter of the time at eight pieces: a region can pass
every floor itself and still be impossible to divide further. So the partition
is planned first on plain polygons - backtracking, several retries per region,
giving up on a whole plan and re-dealing if it cannot be finished - and only a
plan whose every leaf clears every floor is replayed onto the real mesh. Over
500 seeds at every count from two to twelve, no deal violates a floor and none
throws.

Among the candidates that pass, one is picked **at random**. Picking the roomiest
would be the obvious tie-break and is exactly wrong: it drifts towards a grid,
and a grid is the one thing this kind must not be.

The mesh keeps the jigsaw's guarantee
([20260729T114500](20260729T114500-every-cut-is-made-once.md)): every internal
edge is one `Cut` minted once, handed forwards to one neighbour and reversed to
the other, and when a new cut lands mid-edge that edge is split in the neighbour
too. So the shards tile the box exactly - no gaps, no overlaps, no T-junctions -
and the cutting is still clipping rather than intersecting
([20260729T061500](20260729T061500-slices-are-clipped-not-cut.md)).

The art check gets the shatter's version of "every piece has something in it"
([20260729T101500](20260729T101500-every-piece-needs-something-in-it.md)). A grid
has a handful of cells and they can all be scored; a shatter's cells are dealt
fresh and are never twice the same, so the promise cannot be made about a
partition - it is made about the **picture**. `npm run art:check` slides a square
the size of the smallest shard allowed over every scene and asks the emptiest
position to clear the same tenth a grid cell has to. A real shard of that area
always contains a whole square of that size, because a square is the most
compact shape that area can take.

## Consequence

The shards come out visibly unalike - measured, the most similar pair in a deal
differs by at least a few percent on area and edge lengths - while every one of
them is convex, fat, and no smaller than seven tenths of an even share. A child
can sort them by looking at their outlines.

The floors are tight enough to be a promise and loose enough to leave room: they
were tried tighter (0.8/1.25/1.4) and the search began to fail outright at ten
and twelve pieces while the shapes collapsed towards sameness. They should be
loosened, not tightened, if a future level asks for more shards.

The smallest shard ends up around nine per cent of the canvas width, the same
place the jigsaw lands, and the limit there is the layout composition rather
than the partition - tightening these constants further does not move it.

The cost is that `src/shatter.ts` is the most intricate geometry in the project:
a half-plane clipper, a bisection on area, a conforming-mesh edge split, and a
backtracking search. It is worth it because all four exist to make the floors
true by construction rather than by luck, and `tests/shatter.test.ts` sweeps
every one of them over many seeds and every piece count rather than checking a
single deal.
