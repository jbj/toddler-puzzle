# 20260731T091500. A rebuilt picture fills the room the tray leaves

## Context

[Standing a lone picture's pieces in the gutters](20260730T093000-a-lone-picture-stands-its-pieces-in-the-gutters.md)
gave a picture the width beside it. It did not touch what the picture was
allowed to do with that width, and the answer turned out to be: not much. A
jigsaw at level 22 drew its picture 0.34 of the canvas across in landscape and
0.52 in portrait, level 16 drew a sailing boat 0.20 across, and the rest of the
board was grass. On a 1280x800 screen that is a 400x310 picture in a 1140x800
stage, with a child asked to aim quarter-pictures at it.

Every one of the four limits holding it there was written for **a creature
standing in a landscape**, and a picture being rebuilt is not one:

- `footRoom` keeps a hole clear of the tray beneath it and gives the tufts
  somewhere to grow. A picture has no feet and nothing grows under it.
- `skyShare` reserves sky over an animal's head. A picture *is* the sky in it.
- `sideMargin` is room for a creature to stand back from the edge of a scene. A
  picture is the scene, so its edge is the scene's edge.
- `maxSlot` caps a piece at a share of the canvas so that several animals can
  share one board. A lone picture is the only thing on the board; capping it by
  a share leaves it small in the middle of an empty one.

A fifth limit was subtler and cost as much as any of them. The tray's own
margins, gaps and padding are fractions of a *slot*, and a slot is the whole
assembled picture. So a shelf holding four quarter-pictures paid a fifth of a
whole picture in air between them - about a quarter of the canvas width - to
separate things a quarter that size. `maxSlot` already had this problem and had
already been fixed, by dividing it by what the cast actually draws; the tray's
air had not.

## Decision

**A lone picture - one target with more than one piece aimed at it, which is
already the condition the gutters are tried under - fills the room the tray
leaves it.** `isLonePicture` in `src/layout.ts` names the case, and at that case
`footRoom`, the `skyShare` reserve, the scene's `sideMargin` and the `maxSlot`
ceiling all come off. What is left is the three limits that are genuinely about
room - the height under the tray, the width beside it, and a gutter's depth -
and the picture takes whichever of them binds first. It keeps `pictureRoom` (2%
of the canvas height) at each end and centres itself in the rest.

**And the tray's own air is a share of what stands in the tray**, everywhere:
`sideMargin`, `columnGap` and `trayPad` are scaled by `trayAir`, the largest
drawing in the cast measured in slot units, before they are spent around a
waiting piece. This is the same move `maxSlot` already makes, for the same
reason.

**The buttons may sit over the picture.** The reset button, the chapter dots,
the grown-ups button and the button that ends the level are all allowed to
overlap the assembled picture, and the last of these is now clamped on canvas
(`FINISH_RADIUS`, `onCanvas`) rather than relying on sky that may no longer
exist. There is no ambiguity to create: a placed piece answers no touch, so
nothing under a button is competing with it. This is what makes the trade a
free one, and it is the only reason `pictureRoom` can be as small as 2%.

The tray is the one thing a picture does not get back. A waiting piece has to be
somewhere a child can see it and get a hand around it, `keeps every tray cell
out of every target's snap zone` is a promise, and `controlRoom` still holds the
bottom of a gutter clear of the buttons - a piece a child cannot reach without
pressing reset is worse than a small one. So "fill the viewport" means "fill the
room the tray leaves".

## Consequence

Every one of the thirty levels got bigger or stayed the same; not one shrank.
The measured floors in `how big the board gets`, as a share of the canvas width,
landscape then portrait:

| Level | Before | After |
| --- | --- | --- |
| 14, a sliced animal | 0.266 / 0.406 | 0.366 / 0.640 |
| 16, a polygon boat | 0.203 / 0.291 | 0.365 / 0.637 |
| 22, a four-piece jigsaw | 0.336 / 0.517 | 0.380 / 0.718 |
| 25, a nine-piece jigsaw | 0.311 / 0.562 | 0.458 / 0.734 |
| 26, a six-shard shatter | 0.341 / 0.471 | 0.346 / 0.614 |
| 28, an eight-shard shatter | 0.262 / 0.491 | 0.359 / 0.660 |
| 30, the twelve-piece jigsaw | 0.311 / 0.515 | 0.466 / 0.775 |

The smallest *piece* grew with them, which is the number that matters for a
small hand: level 16's smallest polygon went from 0.095 of the canvas width to
0.170, level 28's smallest shard from 0.085 to 0.115, level 30's from 0.090 to
0.135.

Chapters one and two are untouched, to four decimal places, in both
orientations. Every animal fills its own box, so `trayAir` is 1 and every gap is
the gap it was; and a row of animals is never one target, so none of the rest
applies. The change is confined to the boards it was made for.

**There is a ceiling above this and the game is now near it.** Every piece is
drawn at the scale it will be placed at - `fits every piece inside the slot` -
so the pieces waiting for a picture always cover as much canvas as the picture
does. Picture plus tray cannot exceed the board, so an assembled picture can
never take much more than half the board's area, which is about 0.45 of the
width in landscape and about 0.75 in portrait. Levels 25, 29 and 30 are at that
number now. A future change that wants more has to take it from the tray, not
from the composition, and taking it from the tray means overlapping a waiting
piece with the picture - which is a different decision about a different
promise.

Two tests changed rather than being added to. `caps how big a piece is drawn
rather than how big its box is` now asks only the boards where targets share the
canvas, because the ceiling it describes is deliberately off a lone picture; the
floors table and a new `centres a lone picture in the room the tray leaves it`
hold the picture instead. And `keeps the whole finish button on canvas` is a new
promise for something that used to be free.
