# 20260803T090000. Put the tray where the play area is biggest

## Context

Since [20260801T190000](20260801T190000-the-board-is-composed-for-the-screen.md)
the canvas is whatever shape the screen is, anywhere from 1:3 to 3:1. That put a
lot of weight on one decision the composer makes early: whether the pieces wait
in a band across the top or in columns down both sides. It was being made twice,
in two places, against two different questions, and neither of them was *how much
board is left to play on*.

- `arrange` costed every split of the cast into rows of scene and rows of tray,
  kept the biggest **slot**, and broke near-ties on row-count aesthetics. It
  looked at the sides only when the scene held exactly one target, and only if
  they bought `gutterGain` (1.1) more slot.
- `arrangePicture` planned the tray first and gave the picture everything left.
  It costed a side tray as just another candidate, **with no preference for the
  top at all**.

The reported fault was level 19, a five-part polygon butterfly. It stood its tray
down the sides on a square screen, and then moved it back to the top as the
screen got wider - exactly backwards. Measured, worst of four deals, short side
800, `room` being the share of the canvas the tray leaves the scene:

| canvas | placement | slot | room |
| --- | --- | --- | --- |
| 800x800 (1:1) | sides | 280 | 71.7% |
| 1144x800 (1.43:1) | top | 269 | 64.4% |
| 1920x800 (2.4:1) | top | 269 | 64.4% |
| 2400x800 (3:1) | top | 269 | 64.4% |

The cause is that from about 10:7 outwards **both placements are pinned at the
same size**, by `COMPOSITION.maxSlot` - a piece may not draw larger than 0.3 of
the canvas's shorter side. So the 1.1 bar could never be cleared however wide
the screen got, because there was nothing left to win on the measure being used.
What was still changing with width was the thing nobody was measuring: at 3:1 a
band across the top is 255 units of a 700-unit height, a third of the scarce
dimension, to hold five shapes strung out with sand between them; two columns
are about 400 units of a 2100-unit width, a fifth of the plentiful one. One is a
board and the other is a letterbox.

## Decision

**Score both placements by the best fit each can reach, and choose between them
with one rule.** In `takeSides`, in the new `src/fit.ts`:

    take the sides iff
      size(sides) >= gutterGain * size(top)
      OR ( size(sides) >= size(top)
           AND room(sides) >= gutterGain^2 * room(top) )

`size` is the slot the puzzle is drawn at - for a picture, the picture's own
longer side. `room` is the area of canvas the tray leaves the scene. Read out
loud: **the tray belongs at the top, and the sides have to buy either a markedly
bigger puzzle or - when the puzzle cannot be drawn any bigger - markedly more
board to stand it in, and never at the cost of a smaller puzzle.**

The top is the default because down is the easiest direction for a small arm to
drag, and because a child who has learned where the pieces wait should not find
them somewhere else for a two per cent gain. That was already the reasoning
behind `gutterGain` in
[20260730T093000](20260730T093000-a-lone-picture-stands-its-pieces-in-the-gutters.md);
this keeps the constant, at 1.1, and keeps it meaning a *linear* tenth. An area
therefore compares at its square, 1.21, which is the only place the number is
written twice.

Three things go with it.

**A side tray is available to every level.** The old restriction to a single
target was a safety rail rather than a finding - `20260730T093000` names the
sliced levels as "about a fifth" left on the table. It is dropped.

**A side tray may stand more than one column each side**, always the same number
both sides so the scene keeps the middle. This is not decoration: a side tray is
capped by how deep its *deepest* column is, so on a wide short canvas one column
a side starves the board, which is precisely why the nine- and twelve-piece
jigsaws used to lose their gutters. The width extra columns cost on such a canvas
is width nothing else wanted.

**The sizing search moved out of `src/layout.ts` into `src/fit.ts`**, over plain
sizes: no `PieceShape`, no SVG, no constants of its own. `layout.ts` measures the
cast, asks for a fit, and turns the answer into coordinates. That split is what
makes the rule above a thing that can be stated and tested rather than a
condition buried in a reducer, and `tests/fit.test.ts` now checks the arithmetic
directly - so a broken rule names itself instead of surfacing as a level whose
floor slipped.

Nothing was taken off a floor. `COMPOSITION`'s minimums, the ink floor, the
`2/3` waiting scale and the shatter constants are exactly where they were, and
the waiting-piece shrink is untouched.

## Consequence

The reported fault, fixed - level 19 now moves *to* the sides as the screen
widens, which is the direction the room is:

| canvas | before | after |
| --- | --- | --- |
| 1920x800 (2.4:1) | top, slot 269, room 64.4% | sides, slot 280, room 78.0% |
| 2400x800 (3:1) | top, slot 269, room 64.4% | sides, slot 280, room 82.4% |

And the wide screens the old rule could not see at all. Worst of four deals,
short side 800, slot in canvas units:

| level | kind | ratio | before | after | slot |
| --- | --- | --- | --- | --- | --- |
| 23, 24 | jigsaw | 3:1 | sides 622 | sides 870 | +40% |
| 25, 29 | jigsaw | 3:1 | top 653 | sides 892 | +37% |
| 26 | shatter | 3:1 | sides 546 | sides 739 | +35% |
| 28 | shatter | 3:1 | top 574 | sides 766 | +33% |
| 30 | jigsaw | 2.4:1 | top 598 | sides 817 | +37% |
| 20 | polygon | 2.4:1 | sides 400 | sides 464 | +16% |
| 11, 13 | sliced | 3:1 | top 263 | sides 272 | +3%, and a fifth more room |
| 10 | shape-match | 1.78:1 | top 178 | sides 211 | +19% |
| 27 | sliced | 2.4:1 | top 260 | top 289 | +11% |

Every portrait shape is unchanged, at every level: two columns down a 480-wide
phone would be worse than useless, and the rule goes on saying so.

**Six landscape floors drop, and they are the price.** All six are picture
boards at the reference 10:7, where the gutters used to win by between 2% and
7% - under the bar the top now has to be beaten by - so the tray goes back
across the top:

| level | kind | before | after |
| --- | --- | --- | --- |
| 23, 24 | jigsaw | 0.568 | 0.532 |
| 25, 29 | jigsaw | 0.537 | 0.528 |
| 26 | shatter | 0.500 | 0.465 |
| 28 | shatter | 0.453 | 0.440 |

What buys them: the easier drag direction on the shape most screens actually
are, and a much more open board on the shapes they are not - level 26 at 10:7
goes from 53.6% of the canvas left to play on to 71.9%, and levels 21 to 24 gain
between 6% and 28% of room at the ratios where they lost size. A picture 6%
smaller with a fifth more board around it is the trade this rule was written to
make, and the tie-breaker says the more forgiving option wins: dragging
downwards is the easier gesture. Two floors move the other way - level 10
landscape by 9% and level 27 by 5%.

Three latent bugs came out of opening the gutters to more than one target, all
of them true only because it had never happened. `spreadX` spread a row of holes
across the whole canvas width, which would have put the outermost holes
underneath the pieces waiting to fill them; `sceneMargin` was measured the same
way; and `planFor` priced a side tray as `[gutter, 1, gutter]`, which assumes one
target across. All three now work off the room the scene was actually given.
`sceneInset` is the small piece that keeps the last of those honest: the columns
are priced as members of the widest scene row, sharing its outer margins, so what
the row is inset by inside a side tray is the half gap they were priced against
rather than a second full margin.

The floor under all of it is still `how big the board gets` in
`tests/puzzle.test.ts`, plus the `on a screen of any shape` sweep, which now
carries a check naming level 19 at 2.4:1 and 3:1 directly - the fault that
started this, written down so it cannot come back quietly.
