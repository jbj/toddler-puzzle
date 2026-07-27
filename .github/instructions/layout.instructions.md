---
applyTo: "src/layout.ts"
---

# Layout rules

`STAGE_SIZES` and the row counts in both `LANDSCAPE` and `PORTRAIT` must agree.
For each stage, the total `sceneRows` count and total `trayRows` count must equal
the stage size.

A piece stands on its shape's `anchor`, which for an animal comes from
`FOOT_LEVEL` in `src/assets.ts`. Those values come from `npm run art:check`
output; do not estimate them by eye or adjust them until the animal merely looks
close.

Layouts are built when a puzzle starts, not declared up front, because a hole's
height depends on the anchor of whichever piece was dealt into that place. Keep
this deal-dependent shape in mind when changing arrangements.

The layout tests check that:

- holes stay on canvas;
- snap zones never overlap;
- tray slots never collide;
- pieces stay grabbable;
- each orientation fills at least 75% of its viewport.

If a layout change weakens one of those properties, treat that as a design change
that needs a human decision before a pull request.
