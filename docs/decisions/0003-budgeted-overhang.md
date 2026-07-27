# 0003. Budget overhang instead of banning it

## Context

The hole is cut from `#silhouette`, while `#detail` provides the marks that make
an animal readable. Most detail should stay inside the silhouette so the piece
looks as if it fits its hole.

Some detail reads better when it breaks the outline. The giraffe's tail and the
rabbit's cottontail look like tails precisely because they hang past the body;
tucked inside, they flatten into markings.

## Decision

Overhang is allowed only when it is intentional. Mark it with
`data-overhang="..."`, and keep all overhang within 3% of the animal's area.

## Consequence

The rule is about intent, not purity. Accidental overhang fails loudly, while a
small tagged tail is allowed.

Past a few percent, a piece stops looking styled and starts looking like it does
not fit its hole, so `npm run art:check` enforces the budget.
