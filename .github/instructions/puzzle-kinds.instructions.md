---
name: "Puzzle kinds and layout"
description: "The PuzzleKind contract the host plugs into, the thirty-level table and the kind registry, and how a level's layout is generated."
applyTo: "src/kinds/**,src/puzzle.ts,src/layout.ts,src/slices.ts,src/jigsaw.ts,src/shatter.ts,src/picture-pieces.ts,src/scenes.ts,src/scenery.ts,src/board.ts"
---

# Puzzle kinds and layout

## The host and the kind

`src/game.ts` holds no rules. It is a host: it owns picking a piece up,
following the finger, settling it back down, the sounds, the sparkles and the
level lifecycle. Everything that could differ between one sort of level
and another comes from a `PuzzleKind` (`src/puzzle.ts`):

```ts
interface PuzzleKind {
  readonly id: PuzzleKindId;
  deal(deal: Deal, random: () => number): Puzzle;
  backdrop(puzzle: Puzzle, layout: Layout): string;
  target(puzzle: Puzzle, layout: Layout, piece: PieceId): Point;
  openTargets?(puzzle: Puzzle, layout: Layout, piece: PieceId): readonly Point[];
  accepts(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): boolean;
  settle?(puzzle: Puzzle, layout: Layout, piece: PieceId, at: Point): void;
  isComplete(puzzle: Puzzle): boolean;
  play?(puzzle: Puzzle, layout: Layout, host: ActivityHost): () => void;
}
```

The animal game is one such kind, `src/kinds/shape-match.ts`, and the host
cannot tell it from any other: it deals a random cast, draws the landscape with
a hole cut for each piece, accepts a drop near a piece's *own* hole, and is done
when every piece is standing in one.

`Puzzle` carries `targets` beside `pieces`: what the layout stands in the scene,
one hole each. For shape-match the two are the same list. For sliced animals
they are not, which is the reason the field exists - a kind says what the holes
are cut from rather than the host assuming one hole per piece.

`isComplete` is part of the contract rather than assumed, because not every kind
ends with an empty tray - a cause-and-effect level ends when enough things have
been touched. `backdrop` is redrawn whenever the puzzle moves on, which is how a
filled hole hides itself under the piece now covering it.

`play` is the second way to be a kind, and the reason the rest of the contract
is phrased the way it is. A kind that implements it is **played by touching
rather than by dragging**: the host builds no tray pieces, starts no drag
engine, and hands the kind a layer of its own to draw into plus a `touched(at)`
callback to report a touch through. See "Levels played by touching" below.

`settle` is optional and exists for one reason: `accepts` is the only moment the
kind is told *where the finger let go*, and `target` is asked afterwards, again
on every re-render and again after the tablet is turned. A kind that has a
choice to make about a drop - which of two identical shadows the child aimed at
- has to write that choice down while it can, and `settle` is the call between
`accepts` and the host placing the piece where it does so. Only the polygon kind
implements it; a kind whose drop has one possible meaning should leave it out.

`openTargets` is `settle`'s mirror image, and **a kind that implements one must
implement the other**. `settle` writes down which of several equally right
places the child chose; `openTargets` says what all of them were, so the idle
hint can glow every one. A kind that offered only `target` there would have the
hint name one of several right answers, which teaches the child a rule the game
does not have - and the child being hinted at is the least equipped to find out
it was a lie. It returns the same top-left points `target` does, one per place,
and is never empty for an unplaced piece. Most kinds have no choice to offer and
leave it out; the host then falls back to `target` alone. See
[decision 20260730T213000](../../docs/decisions/20260730T213000-a-hint-points-at-both-ends.md).

What the host does insist on is that the game stays forgiving: a drop the kind
refuses drifts gently back to the tray with a soft tone, never off screen. A
kind cannot opt out of that, and should not try to: see
[`product.instructions.md`](product.instructions.md).

## The level table

`LEVELS` in `src/levels.ts` is the whole difficulty ramp: thirty records in six
chapters of five, one per level, and the only place in the codebase that decides
how hard anything is. A record says which `kind` of puzzle the level is, how many
`targets` there are to fill and how many `pieces` fill them (the same number
except where one animal is cut into slices), how forgiving the snapping is, and
optionally a `theme` and `options` its kind understands.

Tuning the game is editing that one file, so treat it as the interface it is:
[decision 20260728T205626](../../docs/decisions/20260728T205626-declarative-level-table.md).
The table says *what* a level is and never *which* pieces - the cast is still
dealt at random from the shapes on offer when the puzzle starts (`dealPieces`),
which is what keeps `?seed=` replaying a level exactly while two plays of it are
otherwise different.

A level's `theme` narrows what it deals *from*: name one and the level draws only
animals in that cast (`src/themes.ts`, and `ANIMAL_THEMES` in `src/assets.ts`),
so a whole puzzle can be the farm or the sea. A theme with too few animals for
the level is topped up from the rest of the cast and the whole selection
reshuffled, rather than throwing - a level that will not start is worse for a
child than a level with a stray penguin in it. Two animals in one theme have to
read differently at a glance, which `npm run art:check` enforces; see
[`art.instructions.md`](art.instructions.md).

Retuning the ramp is a table edit and nothing else. Adding a level means adding a
record; the layout follows, because nothing downstream knows a level count.

**A grown-up can switch a kind off, and that is a filter over the table rather
than an edit to it.** `PUZZLE_KINDS` in `src/levels.ts` is the ordered list of
kinds - `PuzzleKindId` is derived from it, so the panel that offers a switch per
kind cannot fall behind a seventh one - and `EnabledKinds` is what a grown-up
left on. `playableLevels` and the functions beside it (`nextLevel`,
`endsChapter`, `playableFrom`, `isLastPlayable`, `isPlayable`) all take the same
optional `EnabledKinds` and treat an absent one as "all of them", so nothing
that does not care has to know. Two rules hold it together: an all-off record
reads as all-on, because a game with no levels in it is not something to hand a
child, and the level table itself is never touched. See
[decision 20260730T194900](../../docs/decisions/20260730T194900-a-grown-up-can-take-a-kind-out.md).

## Sliced animals

`src/kinds/sliced.ts` plays levels 11-15 and 27: one or two animals, each
arriving in two to four pieces, each assembled in its own animal-shaped hole.
It is the second kind, and the one worth reading before writing a third,
because everything it needs that shape-match did not is now part of the
contract.

**A slice is the animal's artwork through a `clipPath`, never a cut-out shape.**
`src/slices.ts` rebuilds one convex cell per slice by clipping the 240x240 art
box with a few half-planes, and hands the animal's own `artwork` to a group
clipped by it. Do not reach for a polygon boolean library: there are no runtime
dependencies, and there is nothing here that needs one. See
[decision 20260729T061500](../../docs/decisions/20260729T061500-slices-are-clipped-not-cut.md).

**Every slice of an animal keeps that animal's box, anchor and outline**, so the
layout gives them one scale and one origin and they assemble by construction.
The hole is cut once, from the animal's own silhouette, and stays visible under
a half-built animal as the guide to what is still missing. A slice aims at its
own place inside the animal, and is placed by the same box and the same rule as
every other piece in the game: a quarter of a duck dropped on the duck's nose no
longer goes home, but a quarter of a duck half a piece out still does. Cut into
two or three, the pieces overlap so much that a drop on a neighbour's place is a
near miss anyway - and it lands in the piece's own place, because a piece can
only ever be right.

**Where the cuts go is measured, not chosen.** `npm run art:slices` searches for
them offline and writes `src/slice-recipes.json`; `npm run art:check` re-judges
what is committed. That contract, and the numbers behind it, are in
[`art.instructions.md`](art.instructions.md).

**A cut edge belongs to a piece that is still loose**, and that rule is shared
with the two picture kinds, so it lives in `src/cut.ts` rather than in either
cutter. Two halves, and neither works without the other:

- the white line along a cut is drawn while the piece is in the tray or under a
  finger, and fades over the settle once the piece is home - a finished picture
  with a grid over it is not a finished picture;
- a finished drawing is clipped a hair wider than it was cut, so its pieces
  overlap by about a pixel instead of meeting exactly. Two neighbours clipped to
  the same path each paint the boundary at partial coverage and leave a pale
  hairline down the join; invisible under a white edge, and all there is to see
  once it has gone. The overlap cannot show, because every piece of one drawing
  is that drawing at one scale and one origin.

The wider clip waits for the last piece to *land* - `.cut-art` in `style.css`,
on the `is-complete` the host puts on the stage, and never on a piece still
wearing `is-settling` - because it is only free once there is no gap left to
spill into, and while there is one the guide behind the join is the same picture
dimmed. `SLICE_OVERLAP` and `PICTURE_OVERLAP` differ because
the drawings do: a scene is flat and opaque and can take a wide overlap, an
animal has translucent art that a wide overlap would paint twice and darken.
Neither the nudged copies in the clip nor either overlap is a fudge to tidy
away. See
[decision 20260730T194500](../../docs/decisions/20260730T194500-a-placed-piece-has-no-edge.md).

## Pictures out of shapes

`src/kinds/polygon.ts` plays levels 16-20: one picture - a house, a boat, a
rocket, a car, a fish, a flower, a butterfly, a train, a sunflower - built out
of three to six plain, strongly coloured geometric shapes dropped into shadows
inside the finished arrangement. It sits between the other two kinds. In
shape-match one piece *is* one whole animal; in a sliced level a piece is a
fragment of one; here several pieces make one picture and each of them is still
a whole thing a child can name, so the shape names come along without anybody
making a lesson of them.

**The shapes are generated, and the catalogue is `src/scenes.ts`.** A scene is a
list of parts, each a named form - square, rectangle, circle, triangle, wedge,
trapezoid - at a place in the 240x240 scene box. `outlineOf` mints the path,
`artworkOf` paints it. There is no hand-drawn artwork in this chapter and no
`.svg` file to add: a new scene is a new entry in `SCENES`.

**A scene is one target with several pieces**, exactly as a sliced animal is.
Every part carries the whole scene box and the scene's single anchor, so the
parts assemble by construction rather than by arithmetic, and the level table
says `targets: 1` however many pieces the picture has. `tests/levels.test.ts`
holds a polygon level to that.

**Two congruent parts are interchangeable.** A house has two square walls, a
train three wheels, a flower four petals, and a child who drops a petal on the
wrong petal-shaped shadow has done something visibly right. So a piece is
accepted by any *free* place whose signature matches it, and `settle` records
the swap - `placeOf` stays a bijection, so each shadow always has exactly one
shape headed for it. Congruence is geometry alone (`signatureOf`), mirrored
forms deliberately do not match, and a scene must paint congruent parts
identically or a swap would change the picture. This is the rule to read before
touching the kind:
[decision 20260729T090200](../../docs/decisions/20260729T090200-two-shapes-the-same-are-the-same-piece.md).

The rule reaches the idle hint too, through `openTargets`: a piece with four
congruent petals free glows at all four, because all four are right and picking
one to name would be inventing a rule. The set shrinks as its twins fill up, so
the hint sharpens by itself as the picture comes together, and `npm run shot`
counts the glows against the free congruent shadows it finds for itself rather
than against a number written down here.

**Adding a scene** means an entry in `SCENES` and nothing else; `SCENE_SIZES`
and the level table's piece counts are what decide when it can be dealt. Three
things the tests will hold you to, and all three are about the child rather than
the code:

- the picture must read as the thing it is at a glance. Render it and look -
  `npm run shot` covers two polygon levels, and a scene a two-year-old cannot
  name is the failure mode of this whole chapter;
- no part may be much smaller than about a third of the box, or the tray will
  draw it below the size a small hand can grab and the layout will refuse the
  cast outright;
- congruent places must sit far enough apart that a part laid squarely over a
  filled twin does not cover its own place's middle, or a piece would appear to
  jump. `tests/polygon.test.ts` measures every scene for it.

## Jigsaws

`src/kinds/jigsaw.ts` plays levels 21-25, 29 and 30: one hand-drawn scene
(`src/pictures.ts`) cut into interlocking pieces on a grid the table names in
`options.grid`, from 2x2 up to the twelve pieces of 4x3, and rebuilt in the
frame it came out of. The cutter is `src/jigsaw.ts` and is worth reading on its
own; three rules run through it.

**Every internal cut is generated once.** A cut is minted as a single curve and
handed to *both* the pieces it divides - forwards to one, reversed to the other
- so two neighbours mesh by construction rather than by two calculations that
agree. Reversing an edge reorders its points and recomputes none of them. This
is the same trick the animals have always used, where a piece and its hole come
from one `#silhouette` path. Generating each piece on its own and hoping the
tabs line up is the mistake the file exists to make impossible:
[decision 20260729T114500](../../docs/decisions/20260729T114500-every-cut-is-made-once.md).

**Cutting is clipping.** A piece is the scene's own markup inside a
`<g clip-path>` made from the piece's outline, exactly as a slice is an animal
through its cell. Nothing intersects artwork with anything, so one scene serves
a 2x2 board and a 4x3 board without being redrawn, and two neighbours cannot
draw the same pixel differently. A scene is safe to inline many times over: no
ids, no outward references, which `npm run art:check` enforces. See
[`art.instructions.md`](art.instructions.md). The clip itself, and the white
edge along it that goes when the piece is placed, are `src/cut.ts` and the same
for both cutters - the rule is under
[sliced animals](#sliced-animals) above.

**The picture stays under the empty frame.** The guide is the scene itself,
dimmed, with every cut drawn over it - the *same* path each piece is clipped
from, so a piece covers its own line exactly. A blank frame would make a jigsaw
a memory game; at two years old the game is to see where a piece goes. The
whole guide fades only when the last piece is home.

**One picture is one target**, as a sliced animal and a polygon scene are: every
piece carries the whole picture box and the picture's anchor, so the layout
gives them one scale and one origin and they assemble by construction. The table
says `targets: 1` however many pieces the grid cuts. A piece is placed against
its own cell by the game's one rule, exactly as a slice and a scene's part are.

Two sizes are held deliberately, and both are about a small hand rather than
about the drawing:

- **the tab is a share of the cell** (`TAB_SHARE`), so a 4x3 grid gets small
  tabs on small pieces instead of knobs bigger than the pieces carrying them;
- **no piece carries two tabs on one axis, and none carries none at all.** The
  tray packs by what a piece draws, so a piece with tabs all round drags the
  whole board's scale down and a piece with none is the smallest thing on it.
  Holding every piece to one tab per axis is what lets the busiest board -
  twelve pieces across a landscape screen - still draw every piece clear of the
  layout's floors. `tests/jigsaw.test.ts` measures both, and
  `tests/puzzle.test.ts` measures what they buy.

**Adding a grid** means a row in `LEVELS` naming it, and then `npm run art:check`
- which re-judges every scene at every grid the table cuts at, and fails naming
the scene and the cell that cannot take it. Adding a scene is
[`art.instructions.md`](art.instructions.md); nothing in the kind or the cutter
knows how many scenes there are.

## Shattered pictures

`src/kinds/shatter.ts` plays levels 26 and 28: the same hand-drawn scenes, cut
the other way. Instead of rows and columns the picture is broken into irregular
convex shards, `options.pieces` of them, no two alike. Counter-intuitively this
is the *easier* of the two picture kinds, and the reason is the whole point of
it: **every shard is a different shape, so a child can match by outline** - the
skill six chapters of shape-match have been building - rather than by reading
what is drawn on the piece. A partition whose shards all look alike has lost the
kind. The reasoning is
[decision 20260729T124500](../../docs/decisions/20260729T124500-a-shard-is-a-thing-to-hold.md).

The cutter is `src/shatter.ts`. It **splits by half-planes, recursively** -
never Voronoi, whose near neighbours give slivers and whose even ones give
blobs. A convex polygon cut by a line gives two convex polygons, so readable
shapes are a property of the construction and not something checked afterwards.

Four floors decide whether a candidate cut is allowed, and each catches
something the others miss. Do not loosen one because another looks like it
covers it, and do not tighten them either - they were tried tighter and the
search began to fail:

- `MIN_AREA_SHARE` / `MAX_AREA_SHARE` - a shard is between 0.7 and 1.35 of an
  even share, so none is a crumb and none shrinks the rest;
- `MIN_FATNESS` - inradius over the square root of area, the **minimum
  inscribed radius** in scale-free form. Nothing much thinner than three to one;
- `MAX_SPREAD` - the bounding box's longest side over the square root of area.
  This is the one that is really about the tray: the board is scaled by the
  biggest piece, so one long shard makes every other shard small.

All three are applied to the *intermediate* regions too, against the pieces they
still owe. And they are met by **searching, not by trying**: the partition is
planned on plain polygons with backtracking, and only a plan whose every leaf
clears every floor is replayed onto the mesh. Greedy splitting gets stuck about
a quarter of the time at eight pieces. Among the candidates that pass, one is
picked at random - taking the roomiest drifts towards a grid.

The mesh keeps both jigsaw rules unchanged: every internal cut minted once and
handed to both neighbours, and cutting by clipping. When a cut lands mid-edge
that edge is split in the neighbour too, so the shards tile the box exactly. The
minting itself - frame, clip paths, the white `class="cut"` outline, the dimmed
guide - is `src/picture-pieces.ts`, shared with the jigsaw so the two kinds
cannot drift apart. `targets: 1`, and a shard is measured against its own place
like a jigsaw piece, so `.cell[data-piece="..."]` in the guide is what a
screenshot aims at.

The scene contract's "every piece has something in it" has no grid to be scored
against here, so it is asked of the **picture** instead: `npm run art:check`
slides a square the size of the smallest shard allowed over every scene and
insists the emptiest position still clears a tenth. Adding a shatter level at a
new piece count re-runs that measurement at the new size.

## Levels played by touching

`src/kinds/play.ts` plays levels 1, 3 and 5: three cause-and-effect activities
for a child too young to drag anything. **Touch a thing, a thing happens.**
Which one a level runs is `options.activity` in the table, and every `play`
level names one - `tests/play.test.ts` insists, because a level that fell back
to a default would be a level nobody chose.

- **bubbles** rise from the bottom of the screen and burst under a finger;
- **peekaboo** hides each dealt animal behind a bush, and a touch uncovers it;
- **alive** is a scene where everything answers - the sun spins, a cloud drifts
  along, an animal waggles.

Three rules run through all three, and they are the level rather than polish:

**There is no way to be wrong.** Nothing is picked up, so nothing can be dropped
anywhere; `accepts` returns false for everything it is offered. A touch that
lands on nothing does nothing at all - never a buzz, never a wobble.

**There is no way to get stuck.** `thingsFor` says how many things an activity
puts on screen and `goalFor` is measured against it, so no level can ask for
more touches than it gave the child things to touch - and for everything but
peekaboo it asks for strictly fewer, because a child who has decided a
particular cloud is not for them is not going to change their mind. A bubble
that drifts away untouched is replaced at once.

**The answer is immediate.** `pointerdown`, not click, and nothing waits for an
animation before it answers. An animation may run *after* the answer; the sound,
the sparkle and the progress happen in the tick the finger landed.

Progress lives in a `touched` set on the puzzle rather than in `placed`, because
`isComplete` is handed only the puzzle - and because the same puzzle object is
passed to `play` again after a re-layout, so turning the tablet leaves an
uncovered animal uncovered. `play` returns a teardown, called before the next
board is mounted, so intervals and animations do not outlive the board they were
drawing into.

**The burst is `src/pop.ts`, not part of the bubbles.** A chapter celebration
bursts balloons the same way (issue #9), and the feel of a pop should be one
piece of code rather than two that drift apart. `releasePoppable` puts one
floater on a layer and looks after its drift, its hit target and its removal;
`popBurst` is the burst on its own, for anything that should look as though it
popped. Both take `bubble` or `balloon` paint. Under `prefers-reduced-motion` a
floater does not drift at all rather than collapsing to a millisecond, which
would carry it off the top of the screen instantly and leave an empty sky:
[decision 20260729T072100](../../docs/decisions/20260729T072100-reduced-motion-holds-still.md).

An activity level is still **dealt a cast and given a layout** like any other -
bubbles never draws its animals - because the layout is composed around a cast
and the ramp reads the table's piece count. Its backdrop is the ordinary
landscape with `tray: false`, and `alive` also passes `sky: false` so the
scenery leaves the sun and clouds to the kind, which draws bigger ones a finger
can reach.

Chapter 1 alternates touch and drag rather than being all one or the other:
[decision 20260729T072100](../../docs/decisions/20260729T072100-the-game-opens-with-something-to-touch.md).

## The kind registry

A level names the kind it wants by id, and `kindFor(level)` in
`src/kinds/registry.ts` looks that id up. All six are built, so it either
returns the kind or throws: there is no fallback, and a kind id that is not in
`PuzzleKindId` does not compile. For most of this project's life an unregistered
kind was played by shape-match instead so that the table could run ahead of the
code; that scaffold came down when the last kind landed
([decision 20260728T205627](../../docs/decisions/20260728T205627-unbuilt-kinds-play-as-stand-ins.md)).

Adding a kind is one entry in `LOADERS` in `src/kinds/registry.ts` and one entry
in `PUZZLE_KINDS` in `src/levels.ts`, and the levels that named it start playing
it - with a switch of its own in the grown-up panel, which walks that list. Do
not edit `LEVELS` to switch a kind on.

**A kind is also where the bundle is cut.** A chapter is five levels and, near
enough, one kind, so splitting by kind is splitting by chapter. `play` and
`shapeMatch` are static imports, because they are the whole of chapters 1 and 2
and the opening of the game must never wait for anything; the other four are
`import()`ed and are a chunk each, carrying their own artwork and machinery.
`kindFor` stays synchronous and stays strict - a kind that has not arrived
throws, and says so differently from one nobody wrote - and `ensureKind` is the
one place that waits. Nothing is loaded on demand: `src/warm.ts` fetches every
kind during play, long before the child reaches it, so a level seam is a
resolved promise rather than a fetch, and a board that is up stays up in the
rare case where it is not. A new kind therefore wants a `LOADERS` entry and
nothing else - the warm walks the level table and will find it. See
[decision 20260729T223500](../../docs/decisions/20260729T223500-a-chapter-is-warmed-before-it-is-needed.md).

**Never put a retry loop around a chunk that failed to load.** It reads like an
obvious robustness fix and it cannot work: a browser remembers a dynamic import
that failed and answers every later ask with the same rejection, immediately,
without going near the network. The only ways back are a different URL or a
fresh page, and `recoverWhenPossible` in `src/kinds/registry.ts` takes the
second - once the device says it is back online, never merely because a fetch
failed, and capped so a flapping connection cannot make the game blink. The
screenshot run blocks a chunk outright and checks both what a child sees while
it is missing and that the game returns by itself when it can.

## Layout

Everything about a board is *composed* for the cast that was dealt:
`buildLayout(id, level, pieces, targets)` takes any number of pieces and works
out how many targets stand on each ground line, how many pieces wait in each
tray row, and how big a slot they are all drawn to fit inside. `targets`
defaults to the pieces themselves, which is the ordinary one-hole-per-piece
case. There is no table of coordinates to keep
in step with anything, and nothing to add when a level wants a piece count no
level has asked for before. `buildLevelLayout` is the same thing for a level of
the thirty: it checks the cast is the size the level deals, and that the level is
one the table vouches for (`isVouchedLevel`) rather than a record written out by
hand - otherwise a board's difficulty could come from somewhere other than the
table, which is the one thing the table is for. A kind that needs a level with
different numbers, as the stand-in does, derives it through `derivedFrom` rather
than inventing one.

The composition is expressed as fractions of a slot rather than as positions
(`COMPOSITION` in `src/layout.ts`), so the whole board scales together: a busier
level gets smaller pieces, and its margins, gaps and tufts shrink with them
instead of crowding the pieces out. It runs in four steps:

1. split the cast into scene rows and tray shelves, every way worth trying, and
   for each split work out the largest slot that still fits the canvas;
2. take the biggest, preferring the split that suits the canvas's shape among
   those within `sizeTolerance` of it, and refuse the cast outright if the best
   is below `minSlot` rather than laying out pieces too small to grab;
3. where the scene holds a *single* target, try the gutters as well - the pieces
   in two columns down the sides with the target between them - and take that
   instead if it is worth at least `gutterGain` more slot than the best shelving;
4. give each scene row room for the worst reach above and below the line among
   the pieces *dealt into it* - `reach()` measures each piece from its own
   anchor - so a giraffe's row is deeper than a row of turtles;
5. spend what height is left on sky and on the gaps between rows, then read the
   horizon, the grass band and the tray's bands off the result.

Steps 3 and 4 are why layouts are built when a puzzle starts rather than up
front: a hole's height depends on the anchor of whichever piece was dealt into
that place. Generating the layouts rather than declaring them is
[decision 20260727T072917](../../docs/decisions/20260727T072917-generated-layouts.md); composing them
for any cast rather than from a table is
[decision 20260728T115938](../../docs/decisions/20260728T115938-composed-layouts.md).

Because room is left for each invariant *before* a size is picked, the
invariants hold by construction rather than by tuning: a hole cannot land off
canvas or under the tray, no piece laid over its neighbour's place can cover its
own, and two tray cells cannot collide. `layout.groundLines` says where the lines came out, which is
what the tests measure a standing piece against, and `layout.trayBands` says
where the tray came out, which is what the scenery paints and what the tests
measure a waiting piece against.

**The tray is not always a band across the top.** `layout.trayBands` is a list
of rectangles, each with the edge it is lipped along, and there are two shapes
it comes in. *Shelves* are the familiar one: rows across the top of the canvas,
lipped along the bottom. *Gutters* are two columns down the sides, lipped along
the edge that faces the scene, and are only ever tried where the scene holds one
target and more than one piece - a picture being rebuilt. A landscape canvas
leaves about two thirds of its width empty either side of a picture drawn one
slot wide, and standing the pieces in that room instead of above it is what lets
the picture itself grow; `COMPOSITION.controlRoom` keeps the bottom of a gutter
clear of the reset button and the grown-ups button, in canvas units rather than
as a share, because what it protects is not a share either. A gutter tray is
only adopted where it is worth `COMPOSITION.gutterGain` more slot than the best
shelving, so a marginal win never buys a rearranged board. See
[decision 20260730T093000](../../docs/decisions/20260730T093000-a-lone-picture-stands-its-pieces-in-the-gutters.md).

A tray cell belongs to a *piece*, not to a position: `layout.trayCells` maps a
piece id to the rectangle it waits in, cut to that piece's own box rather than
to the largest box in the cast, and `trayHome(layout, piece)` centres it there.
Cutting the cell from the same box a piece is grabbed by is what keeps two
waiting pieces' grab boxes apart, so a press in the tray is never ambiguous.
Packing the shelf by what each piece draws is worth a fifth of a shatter's tray
width, because its shards vary; it is worth almost nothing for a jigsaw, whose
pieces are near enough the same size. The consequence to remember is that the
host can no longer shuffle *slots* to deal a tray in a random order - the cell
was cut for the piece - so **every kind must shuffle its own `pieces`**.

`slotSize` is a square, but a piece need not be. Each piece in play gets its own
`PieceBox` - `boxOf(layout, piece)` - holding the scale from its authored box to
logical units, the bounds that produces, its `ink` (what it draws), its `grip`
(the box it is measured by) and its `reach` (that box at this level's
forgiveness). A piece is
scaled by its *longer* side, so a plank or a pole still fits the slot it was
composed into, and is then centred across it. Measure a piece with its
`PieceBox`, never with `slotSize`: clamping a wide piece as though it were square
would let it hang off the canvas on one axis and lock it out of reach on the
other.

A tray is packed by what a piece *draws*, not by the box it was authored in.
`PieceShape.inked` is a piece's own bounds within its box, and a piece that
leaves it out fills its box, which is what every animal does. A slice cannot:
it keeps the whole animal's box so that the slices assemble, so its box is
mostly empty. `gripOf` in `piece.ts` turns that drawing into the piece's own box
- a margin around it, then thickened - and a tray cell is cut from that rather
than from the slot, `trayHome` centres a piece's box in its cell,
`clampGripToCanvas` holds a dragged piece on canvas by the same box, and
`fitGrabBox` believes a declared `inked` over `getBBox` - which cannot see a clip
path and would hand every slice of an animal the same animal-sized grab box.
`minPieceInk` is the floor for the drawing where `minSlot` is the floor for the
slot; for a cast that fills its boxes they are the same floor.

The ceiling works the same way round: `maxSlot` caps what a piece may *draw*,
not the slot it is drawn inside. Capping the slot would cap a sliced level by
the whole animal's box - the part a slice does not fill - and hand the child a
quarter of an animal that was never allowed to be big in the first place, which
is a small piece under an acre of empty sky. Divided by what the cast draws, the
same number lets a one-animal, four-slice board stand an animal half as big
again as a whole animal alone on the board would be, and changes nothing at all
for a cast that fills its boxes.

`spreadX` spaces each row evenly across the canvas, and each piece's reach
follows its own box, so a busier level automatically gets tighter, more accurate
placing instead of pieces that reach each other's holes. Pieces shrink as the
board fills up along the ramp, which is what lets six animals share a single row
and still leaves every piece well over a tenth of the canvas wide - the size a
small hand needs.

Placing is one box and one rule for every kind: `onTarget(layout, piece, at,
home)` in `layout.ts` asks whether the piece's box, put where the finger let go,
covers the middle of the place the kind named. A kind says *where* a piece
belongs and nothing about geometry, so no kind can be more or less forgiving
than another;
[decision 20260731T133000](../../docs/decisions/20260731T133000-one-box-measures-a-piece.md)
is the argument, and
[decision 20260727T072917](../../docs/decisions/20260727T072917-generous-snap-radius.md)
explains why tightening it is not a cleanup. A level's `snapForgiveness` grows
that box about its centre, between `MIN_SNAP_FORGIVENESS` and
`MAX_SNAP_FORGIVENESS`, so the earliest levels are wildly generous and the last
ones merely generous. It is a multiplier rather than a size of its own, so that
no level can be less forgiving than the piece's own box, and the layout tests
sweep every count at the most forgiving value in the table - which is what keeps
one target's reach off another's at the top of the range.

## Orientation

The puzzle reflows rather than merely shrinking. Landscape puts the animals in
one row with the tray beneath; portrait uses shallower rows and spends the saved
width on a taller tray. A picture being rebuilt reflows further still: landscape
has room to stand its pieces down the gutters and usually does, portrait has not
and keeps its shelves. Letterboxing a landscape canvas into an upright phone
would leave the pieces too small to grab, so `chooseLayout()` picks by aspect
ratio. Rotating the device mid-puzzle rebuilds the board but keeps progress.

The background landscape is generated from the layout (`src/scenery.ts`) rather
than being a fixed-size image, so every level and both orientations share one
piece of art.

## Rules for changing layout

Tune `COMPOSITION`, not the output. Every number in it is a fraction of a slot
or of the canvas, and several of them are load-bearing: `columnGap` and `rowGap`
are what hold one target's reach off another's, `footRoom` is what keeps a hole
clear of the
tray, `controlRoom` is what keeps a gutter clear of the buttons, and `minSlot`
is what keeps a piece grabbable. Reaching past them to nudge
a coordinate would move a piece without moving the room left for it.

All layout tunables belong in `src/layout.ts`. Start there rather than
scattering a constant into whichever file happened to need it.

A piece stands on its shape's `anchor`, which for an animal comes from
`FOOT_LEVEL` in `src/assets.ts`. Those values come from `npm run art:check`
output; do not estimate them by eye or adjust them until the animal merely looks
close. See [`art.instructions.md`](art.instructions.md).

The layout tests are properties rather than expected coordinates. Every promise
in `PROMISES` (`tests/puzzle.test.ts`) is checked against every piece count a
level could ask for, in both orientations, over random casts of animals and of
pieces of no particular shape:

- every piece has a target, a box and a tray cell;
- several pieces may share one target, and every one of them is drawn at that
  target's scale;
- every piece fits the slot it was dealt into, whatever its proportions;
- targets stay on canvas and clear of the tray;
- every piece stands on one of the layout's ground lines;
- no piece laid squarely over another's place covers its own;
- tray cells stay on one of the tray's bands, never collide, never overlap
  another piece's box, and never sit where the piece waiting in them would be
  taken home;
- pieces stay grabbable - over a tenth of the canvas wide;
- each orientation fills at least 75% of its viewport.

Alongside them, `how big the board gets` holds a measured floor under every one
of the thirty levels in both orientations: the slot as a share of the canvas,
which for a picture kind is the assembled picture's own width, and the smallest
piece's ink. Those numbers are the worst of twenty-four deals shaded down three
per cent, and they are a ceiling test read backwards - a piece is very easy to
shrink by accident and impossible to miss doing from a green suite. Raising one
is a good day; lowering one has to name the invariant that bought the loss.

A layout change must leave every one of those properties standing. Between them
they keep a piece grabbable, reachable and unambiguous, so weakening one is a
change to the game rather than to the layout.
