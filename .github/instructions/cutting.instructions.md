---
name: "Cutting a drawing up"
description: "The kinds made by cutting one drawing into pieces: sliced animals, jigsaws and shattered pictures, and the edge they share."
applyTo: "src/kinds/sliced.ts,src/kinds/jigsaw.ts,src/kinds/shatter.ts,src/slices.ts,src/jigsaw.ts,src/shatter.ts,src/picture-pieces.ts,src/cut.ts,src/pictures.ts"
---

# Cutting a drawing up

Three of the six kinds are one drawing in several pieces. The contract they
implement is [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md); the
drawings themselves are [`art.instructions.md`](art.instructions.md).

**Cutting is always clipping.** A piece is the original markup inside a
`<g clip-path>`, never a redrawn shape, so one drawing serves every cut and two
neighbours cannot draw the same pixel differently. Never reach for a polygon
boolean library - there are no runtime dependencies and nothing here needs one.

## Sliced animals

`src/kinds/sliced.ts` plays levels 11-15 and 27: one or two animals, each
arriving in two to four pieces, each assembled in its own animal-shaped hole.

- `src/slices.ts` clips the 240x240 art box with a few half-planes. See
  [Slices are clipped, not cut](<../../docs/decisions/Slices are clipped, not cut.md>).
- **Every slice keeps the animal's box, anchor and outline**, so one scale and
  one origin assemble them by construction.
- The hole is cut once from the animal's own silhouette and stays visible under a
  half-built animal, with the cuts drawn on it - the same paths the slices were
  clipped with - so the guide says where each piece goes and not only what is
  being built.
- **Where the cuts go is measured, not chosen**: `npm run art:slices` searches
  offline and writes `src/slice-recipes.json`, `npm run art:check` re-judges what
  is committed. The contract is [`art.instructions.md`](art.instructions.md).

### A cut edge belongs to a piece that is still loose

`src/cut.ts`, shared with both picture kinds. Two halves, and neither works
without the other: the white line along a cut is drawn while the piece is in the
tray or under a finger and fades over the settle once it is home; and a finished
drawing is clipped a hair wider than it was cut, so neighbours overlap by about a
pixel rather than each painting the boundary at partial coverage and leaving a
pale hairline. The wider clip waits for the last piece to *land* - `.cut-art` in
`style.css`, on the `is-complete` the host puts on the stage, never on a piece
still wearing `is-settling`. `SLICE_OVERLAP` and `PICTURE_OVERLAP` differ because
a scene is flat and opaque while an animal's art is translucent. None of it is a
fudge to tidy away. See
[A placed piece has no edge](<../../docs/decisions/A placed piece has no edge.md>).

## Jigsaws

`src/kinds/jigsaw.ts` plays levels 21-25, 29 and 30: one hand-drawn scene
(`src/pictures.ts`) cut on the grid the table names in `options.grid`, from 2x2
to the twelve pieces of 4x3, rebuilt in the frame it came out of. The cutter is
`src/jigsaw.ts`.

- **Every internal cut is generated once** and handed to *both* pieces it divides
  - forwards to one, reversed to the other - so neighbours mesh by construction.
  Reversing an edge reorders its points and recomputes none of them. Generating
  each piece on its own and hoping the tabs line up is the mistake the file exists
  to make impossible:
  [Every cut is made once](<../../docs/decisions/Every cut is made once.md>).
- **A scene must be safe to inline many times over** - no ids, no outward
  references - which `npm run art:check` enforces.
- **The picture stays under the empty frame**, dimmed, with every cut drawn over
  it from the same path each piece is clipped from. A blank frame would make a
  jigsaw a memory game. The guide fades only when the last piece is home.
- **One picture is one target**: every piece carries the whole picture box and
  anchor, `targets: 1` however many pieces the grid cuts.
- **The tab is a share of the cell** (`TAB_SHARE`), so a 4x3 grid gets small tabs
  rather than knobs bigger than the pieces carrying them.
- **No piece carries two tabs on one axis, and none carries none.** The tray
  packs by what a piece draws, so tabs all round drag the whole board's scale
  down. `tests/jigsaw.test.ts` measures both; `tests/puzzle.test.ts` measures
  what they buy.
- **Adding a grid** is a row in `LEVELS` plus `npm run art:check`, which
  re-judges every scene at every grid the table cuts at and fails naming the
  scene and the cell that cannot take it.

## Shattered pictures

`src/kinds/shatter.ts` plays levels 26 and 28: the same scenes broken into
`options.pieces` irregular convex shards, no two alike. It is the *easier* of
the two picture kinds, and that is the point: **every shard is a different
shape, so a child can match by outline** rather than by what is drawn on it. A
partition whose shards all look alike has lost the kind. See
[Cut a picture into shards that are things to hold](<../../docs/decisions/Cut a picture into shards that are things to hold.md>).

`src/shatter.ts` **splits by half-planes, recursively** - never Voronoi, whose
near neighbours give slivers and whose even ones give blobs. A convex polygon
cut by a line gives two convex polygons, so readable shapes are a property of
the construction.

Four floors, in three tests, decide whether a candidate cut is allowed. Each
catches something the others miss; do not loosen one because another looks like
it covers it, and do not tighten them - tighter, the search began to fail.

| Floor | What it holds |
| --- | --- |
| `MIN_AREA_SHARE` / `MAX_AREA_SHARE` | A shard is 0.7 to 1.35 of an even share, so none is a crumb and none shrinks the rest |
| `MIN_FATNESS` | Inradius over root area - the minimum inscribed radius, scale-free. Nothing much thinner than three to one |
| `MAX_SPREAD` | Bounding box's longest side over root area. Really about the tray: the board is scaled by the biggest piece, so one long shard makes every other shard small |

- All of them are applied to the *intermediate* regions too, against the pieces
  those still owe.
- They are met by **searching, not trying**: the partition is planned on plain
  polygons with backtracking, and only a plan whose every leaf clears every floor
  is replayed onto the mesh. Greedy splitting sticks about a quarter of the time
  at eight pieces. Among passing candidates one is picked at random - taking the
  roomiest drifts towards a grid.
- The mesh keeps the jigsaw's rule that every cut is minted once. A cut landing
  mid-edge splits that edge in the neighbour too, so the shards tile the box
  exactly.
- Minting - frame, clip paths, the white `class="cut"` outline, the dimmed guide
  - is `src/picture-pieces.ts`, shared with the jigsaw so the two cannot drift.
- "Every piece has something in it" has no grid to score here, so `npm run
  art:check` asks it of the **picture**: it slides a square the size of the
  smallest shard allowed over every scene and insists the emptiest position
  clears a tenth. A new piece count re-runs that at the new size.
