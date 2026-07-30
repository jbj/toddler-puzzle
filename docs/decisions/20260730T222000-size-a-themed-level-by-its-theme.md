# 20260730T222000. Size a themed level by the animals its theme has

## Context

Three animals were withdrawn - the cow, the pig and the parrot - because their
drawings were not good enough to stand next to the rest. Withdrawing art is
meant to be cheap: `ANIMAL_IDS` is the draw, and anything not in it simply stops
turning up.

It was not cheap, and the reason is worth writing down. The cow and the pig were
two fifths of the farm, which left that theme with three animals - a duck, a
rabbit and a butterfly - while level 9 was a five-piece farm board. `dealPieces`
has a safety net for exactly this: a theme too small for the level is topped up
from everything else and the whole selection reshuffled, because a level that
will not start is worse for a child than a level with a stray penguin in it. So
nothing would have crashed. Level 9 would simply have been a farm board with two
sea animals wandering about on it, every single time it was played.

That net is for a theme that is *half-drawn while it is being drawn*. Leaning on
it from the level table would make it something else: a permanent, invisible
downgrade of a level nobody would ever see fail. Worse, the distinctness check in
`npm run art:check` works one theme at a time - it guarantees a duck reads
differently from a rabbit, and says nothing about a duck beside an octopus,
because the table promised those two would never meet.

## Decision

**A level's `theme` may not name a cast smaller than the animals that level puts
on the board.** The table is sized by the art that exists, not the other way
round, and `themed casts` in `tests/levels.test.ts` has held this since before
this record - "no level of the thirty may actually need" the top-up.

Level 9 is therefore a jungle level rather than a farm one. Chapter 2 now reads
farm 3, sea 4, jungle 4, jungle 5, sea 6: the two busiest boards go to the two
biggest themes, and the smallest theme keeps the smallest board. Two jungle
levels in a row is the visible cost, and it is the right one to pay - a child
meets a different five animals each time either of them is dealt, whereas a farm
board that is two thirds farm would be wrong in the same way every time.

The alternative - dropping level 9's theme entirely, so it deals from all
thirteen animals - was rejected for the same reason the top-up is not a
strategy: an untied board of five is where the distinctness check has nothing to
say, and chapter 2 is exactly where a two-year-old is learning that these shapes
are telling them apart.

## Consequence

Farm is a three-animal theme until something is drawn for it. That is fine for
levels 6, 11 and 15, which need three, one and two, and it is the constraint to
check first when retuning chapter 2 or 3. Drawing a new farm animal is what buys
that back; nothing else does.

Four numbers moved in `BOARD_FLOORS` (`tests/puzzle.test.ts`), at levels 12 and
13, and they moved for a reason that will look like a regression and is not. The
table's floors are the worst of a fixed set of seeded deals. A deal now draws
from thirteen animals rather than sixteen, so those seeds land on casts that
were always possible and had merely not come up - a butterfly cut into three, a
rabbit beside a giraffe. Both of those animals are still here. No board got
smaller; the sample got luckier before.

The stale measurement in `minPieceInk` was refreshed for the same reason: level
27's worst landscape cast was a butterfly beside a pig at 0.0705, and is now a
rabbit beside a turtle at 0.0737. The floor itself was not touched.
