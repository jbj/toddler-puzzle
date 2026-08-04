# Refuse an impossible picture before searching

A picture fitter normally costs every useful way of packing the pieces before
it decides that none works. That search is cheap for the counts the game deals,
but deliberately impossible input can make a refusal take longer than the test
which proves it is refused is allowed to run.

Reject before the search only when one of two generous bounds proves that no
grabbable plan can exist:

- A fitted slot cannot exceed the canvas's longer side. `slotFilling` scales the
  picture's longer box side onto one dimension of room inside the canvas, and a
  waiting slot is never larger than the fitted one. If the whole long side
  cannot meet the scene or waiting floor, a real plan cannot meet it.
- At the smallest waiting slot that makes the least-visible piece grabbable,
  add the areas of all the scaled grip rectangles. Every acceptable tray holds
  those grips without overlap inside the canvas, so their sum cannot exceed the
  canvas's area.

Both are necessary conditions, not estimates of what the packer will achieve.
They give the tray the whole canvas: no padding is charged and no room is
reserved for the picture. A real tray can only have less room, so either early
refusal is already one the full search would have reached.

A fixed piece-count limit would not carry the same guarantee. Jigsaw cells and
shattered pieces have different proportions, and it is their actual grip boxes,
not their number, that the tray packs.
