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

## The tempting wrong bound

Do not bound the fitted slot by `sqrt(canvas area / piece count)`. The pieces
tile one picture; `sceneSlot` scales that picture's own box into the room and
does not shrink as the cut gains pieces. More pieces cost the tray, not a grid
of scene slots. A bound which makes the scene slot fall with the count can
refuse a picture which would have fitted.

A fixed count limit has the same problem from the other direction. Jigsaw cells
and shattered pieces have different proportions, and it is their actual grip
boxes, not their number, that the tray packs.

## What was measured

Five locked runs of the old 400-piece refusal averaged 547 ms:

| Phase | Mean | Share |
| --- | ---: | ---: |
| Enumerate top trays | 366.6 ms | 67.4% |
| Enumerate side trays | 41.1 ms | 7.6% |
| Cost top plans | 83.3 ms | 15.3% |
| Cost side plans | 53.2 ms | 9.8% |

Candidate construction is about three quarters of the cost. A global guard
skips it; pruning `bestPicturePlan` one tray at a time would leave most of it
and put another decision on every successful real fit.

The dimension guard was also exercised against 1,440 real deals on `main` at
`2fd3879`, using `npm run probe`:

- every level from 1 through 30;
- seeds 0 through 11;
- viewports 1000x700, 700x1000, 700x700 and 1400x700.

Every deal composed and none was refused. This sweep is empirical evidence
beside the proof, not a substitute for it. Repeat it after tightening either
bound; the 36/37 characterization in `tests/fit.test.ts` remains the fast CI
guard against moving a known boundary.
