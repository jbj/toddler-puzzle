---
applyTo: "src/layout.ts"
---

# Layout rules

`STAGE_SIZES` and the row counts in both `LANDSCAPE` and `PORTRAIT` must agree.
For each stage, the total `sceneRows` count and total `trayRows` count must equal
the stage size.

`FOOT_LEVEL` values come from `npm run art:check` output. Do not estimate them by
eye or adjust them until the animal merely looks close.

Layouts are built when a puzzle starts, not declared up front, because a hole's
height depends on the foot level of whichever animal was dealt into that place.
Keep this deal-dependent shape in mind when changing arrangements.

The layout tests check that:

- holes stay on canvas;
- snap zones never overlap;
- tray slots never collide;
- pieces stay grabbable;
- each orientation fills at least 75% of its viewport.

If a layout change weakens one of those properties, treat that as a design change
that needs a human decision before a pull request.
