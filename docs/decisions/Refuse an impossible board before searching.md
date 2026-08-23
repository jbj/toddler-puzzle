# Refuse an impossible board before searching

A fitter costs every useful way of packing the pieces before it decides that
none works. That search is cheap for the piece counts the game deals, but
deliberately impossible input could make a refusal take arbitrarily long to
run, so a fitter must refuse early whenever a necessary condition already
proves no plan can exist.

Both board kinds refuse early for the same reason, but the condition differs
because the two boards are not the same problem.

## A picture board

Reject before the search only when one of two generous bounds proves that no
grabbable plan can exist:

- A fitted slot cannot exceed the canvas's longer side. `slotFilling` scales
  the picture's longer box side onto one dimension of room inside the
  canvas, and a waiting slot is never larger than the fitted one. If the
  whole long side cannot meet the scene or waiting floor, no real plan can
  meet it.
- At the smallest waiting slot that makes the least-visible piece grabbable,
  the areas of all the scaled grip rectangles cannot exceed the canvas's
  area, because every acceptable tray holds those grips without overlap
  inside the canvas.

Both are necessary conditions, not estimates of what the packer will
achieve. They give the tray the whole canvas: no padding is charged and no
room is reserved for the picture. A real tray can only have less room, so
either early refusal is one the full search would have reached anyway.

### The tempting wrong bound

Do not bound the fitted slot by `sqrt(canvas area / piece count)`. The
pieces tile one picture; `sceneSlot` scales that picture's own box into the
room and does not shrink as the cut gains pieces. More pieces cost the tray,
not a grid of scene slots. A bound that makes the scene slot fall with the
count can refuse a picture that would have fitted.

A fixed count limit has the same problem from the other direction. Jigsaw
cells and shattered pieces have different proportions, and it is their
actual grip boxes, not their number, that the tray packs.

## A board of rows

A picture keeps its own size as the cut gains pieces: more pieces cost the
tray and nothing else. A cast does not. Every animal added to a board of
rows brings a hole to stand on the ground **and** a cell to wait in, and the
board has to hold both at once - which is why a plan's height is the
scene's plus the tray's. So on this board, and only on this board, the
count really does divide the canvas.

Refuse when, at the smallest slot that would still be grabbable, the holes
and the tray cells together cannot fit inside the canvas's area. The slot
floor is the larger of the two the search applies later - the smallest slot
that can be aimed at, and the smallest that leaves the least-visible piece
enough ink to grab. The bound hands the layout the whole canvas: no sky, no
padding, no gaps between rows. A real board only ever has less, so a
refusal here is one the full search would have reached.

Do not tighten it by charging each piece a whole square slot. A piece drawn
smaller than its slot fills less than the slot, and summing squares
overstates the demand enough to refuse a board that fits. Sum what the
boxes actually cover.

This bound only half applies, and deliberately so: it catches a cast
refused on a landscape canvas, where holes and cells are tightest against
the height, but the same cast stood upright still passes the bound and is
refused only at the end of a full search. The bound is a proof, not a
heuristic - making it catch every orientation would mean charging for sky,
padding or gaps, and a board that fits would eventually be refused. Half of
a pathological case, soundly, is the trade.

`tests/fit.test.ts` and `tests/puzzle.test.ts` hold the characterisation
tests that guard these boundaries against a bound that moves quietly;
`npm run probe` is the tool for sweeping real deals against them.
