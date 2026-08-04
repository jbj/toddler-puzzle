# Refuse an impossible board before searching

A fitter normally costs every useful way of packing the pieces before it decides
that none works. That search is cheap for the counts the game deals, but
deliberately impossible input can make a refusal take longer than the test which
proves it is refused is allowed to run.

Both kinds of board refuse early, and for the same reason - a necessary
condition that is already proven false. What that condition is differs, because
the two boards are not the same problem.

## A picture board

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

## A board of rows

A board of rows is the case the paragraph above is *not* about, and the
difference is worth stating because the two bounds look alike.

A picture keeps its own size as the cut gains pieces: more pieces cost the tray
and nothing else. A cast does not. Every animal added to a board of rows brings
a hole to stand on the ground **and** a cell to wait in, and the board has to
hold both at once - which is why a plan's height is the scene's plus the tray's.
So on this board, and only on this board, the count really does divide the
canvas.

Refuse when, at the smallest slot that would still be grabbable, the holes and
the tray cells together cannot fit:

```text
smallestSlot^2 * sum of every grip and drawn box area  >  canvas area
```

The slot floor is the larger of the two the search applies later - the smallest
slot that can be aimed at, and the smallest that leaves the least-visible piece
enough ink to grab. The bound hands the layout the whole canvas: no sky, no
padding, no gaps between rows. A real board only ever has less, so a refusal
here is one the full search would have reached.

Do not tighten it by charging each piece a whole square slot. A piece drawn at
three-quarters by a half fills less than half its slot, and summing squares
overstates the demand by about a third - enough to refuse a board that fits.
Sum what the boxes actually cover.

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

The rows bound was measured the same way, on `main` at `e2758ad`. Refusing the
sixty-animal cast that `tests/puzzle.test.ts` proves is refused went from
1,803 ms to 742, 746 and 920 ms across three locked runs.

It only half applies, and deliberately so. The cast is refused before the search
on a landscape canvas, where the holes and cells need about 864,000 square units
of a 700,000-unit board. Upright, the same cast needs about 424,000 of 826,000
and passes the bound, so that half still searches and still refuses at the end.
The bound is a proof, not a heuristic: making it catch the upright case too
would mean charging for sky, padding or gaps, and a board that fits would
eventually be refused. Half of a pathological case, soundly, is the trade.

The same 1,440-deal sweep was repeated with the rows bound in place - every
level from 1 through 30, seeds 0 through 11, the four viewports above. All 1,440
composed and none was refused.
