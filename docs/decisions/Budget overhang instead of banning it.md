# Budget overhang instead of banning it

## Context

The hole is cut from an animal's silhouette, while its detail marks are what
make it readable. Most detail should stay inside the silhouette so the piece
looks as if it fits its hole. Some detail reads better when it breaks the
outline - a tail hangs past the body precisely because that is what makes it
read as a tail; tucked inside, it flattens into a marking.

## Decision

Overhang is allowed only when it is intentional, marked explicitly in the
artwork, and kept within a small budget enforced by `npm run art:check`.

## Consequence

The rule is about intent, not purity: accidental, unmarked overhang fails
loudly, while a small, deliberately marked overhang is allowed. Past that
budget a piece stops looking styled and starts looking like it does not fit
its hole, which is what the check exists to catch.
