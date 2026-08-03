---
name: "Puzzle kinds"
description: "The PuzzleKind contract the host plugs into, the thirty-level table, the kinds that are not cut from a drawing, and the registry."
applyTo: "src/kinds/registry.ts,src/kinds/play.ts,src/kinds/shape-match.ts,src/kinds/polygon.ts,src/puzzle.ts,src/levels.ts,src/scenes.ts,src/themes.ts,src/warm.ts,src/pop.ts"
---

# Puzzle kinds

How a level is laid out is [`layout.instructions.md`](layout.instructions.md).
How a drawing is cut into pieces - sliced animals, jigsaws, shattered pictures -
is [`cutting.instructions.md`](cutting.instructions.md).

## The host and the kind

`src/game.ts` holds no rules. It is a host: picking a piece up, following the
finger, settling it down, sounds, sparkles, the level lifecycle. Everything that
could differ between one sort of level and another is a `PuzzleKind`
(`src/puzzle.ts`): `deal`, `backdrop`, `target`, `accepts`, `isComplete`, and
the optional `openTargets`, `settle` and `play`.

- `Puzzle` carries `targets` beside `pieces`: what the layout stands in the
  scene, one hole each. For shape-match the two lists are the same; for sliced
  animals they are not, which is why the field exists.
- `isComplete` is in the contract because not every kind ends with an empty tray.
- `backdrop` is redrawn whenever the puzzle moves on, which is how a filled hole
  hides itself under the piece covering it.
- `play` makes a kind **played by touching rather than dragging**: the host builds
  no tray pieces, starts no drag engine, and hands the kind a layer of its own
  plus a `touched(at)` callback.
- `settle` is the only place a kind can write down a choice about a drop, since
  `accepts` is the one moment it is told where the finger let go and `target` is
  asked again on every re-render. Only the polygon kind implements it.
- `openTargets` is `settle`'s mirror, and **a kind that implements one must
  implement the other**: every equally-right place, one point each, never empty
  for an unplaced piece, so the idle hint can glow all of them rather than naming
  one of several right answers. See
  [A hint points at both ends](<../../docs/decisions/A hint points at both ends.md>).
- A kind cannot opt out of forgiveness: a refused drop drifts gently back to the
  tray with a soft tone, never off screen. See
  [`product.instructions.md`](product.instructions.md).

## The level table

`LEVELS` in `src/levels.ts` is the whole difficulty ramp - thirty records, six
chapters of five - and the only place that decides how hard anything is. A
record names the `kind`, how many `targets` there are and how many `pieces` fill
them (the same number except where one thing is cut up), the `snapForgiveness`,
and optionally a `theme` and `options`.

- Tuning the game is editing that one file. Treat it as the interface it is:
  [Put the whole difficulty ramp in one table](<../../docs/decisions/Put the whole difficulty ramp in one table.md>).
- The table says *what* a level is, never *which* pieces: the cast is dealt at
  random when the puzzle starts (`dealPieces`), which is what lets `?seed=` replay
  a level exactly while two plays are otherwise different.
- A `theme` narrows what the level deals *from* (`src/themes.ts`, `ANIMAL_THEMES`
  in `src/assets.ts`). A theme too short for the level is topped up from the rest
  of the cast and reshuffled rather than throwing - a level that will not start is
  worse than a level with a stray penguin in it. Two animals in one theme must
  read differently at a glance, which `npm run art:check` enforces; see
  [`art.instructions.md`](art.instructions.md).
- **A level is its kind, its subject and its size, and no two levels are all
  three.** The subject is what the row names - `activity`, `theme`,
  `options.scene`, `options.shapePicture` - so a reader can check the thirty are
  thirty different puzzles by looking down the file, and
  `tests/levels.test.ts` fails on a duplicate. The same picture at a different
  size is a different puzzle; at the same size it is a level nobody chose. See
  [A level names what it is made of](<../../docs/decisions/A level names what it is made of.md>).
- `options.scene` and `options.shapePicture` are two keys because they name two
  catalogues - a hand-drawn `.svg` in `src/pictures.ts` that gets cut up, versus
  parts built in `src/scenes.ts`. The art check reads the table for `scene` to
  know what to rasterise, so they cannot share a key.
- Adding a level is adding a record; nothing downstream knows a level count.
- **A grown-up switching a kind off is a filter over the table, never an edit to
  it.** `PUZZLE_KINDS` is the ordered list of kinds (`PuzzleKindId` derives from
  it) and `EnabledKinds` is what was left on; every function that walks the table
  takes an optional `EnabledKinds` and treats an absent one - or an all-off record
  - as all of them. See
  [A grown-up can take a kind of puzzle out](<../../docs/decisions/A grown-up can take a kind of puzzle out.md>).

## Pictures out of shapes

`src/kinds/polygon.ts` plays levels 16-20: one picture built out of three to six
plain, strongly coloured geometric shapes dropped into shadows inside the
finished arrangement. Each piece is a whole thing a child can name, so the shape
names come along without anybody making a lesson of them.

- **The shapes are generated; the catalogue is `src/scenes.ts`.** A scene is a
  list of named forms - square, rectangle, circle, triangle, wedge, trapezoid -
  placed in the 240x240 scene box. There is no `.svg` to add.
- **A level names its picture** in `options.shapePicture`. `deal` throws rather
  than making the best of it when a row names nothing, names a picture the
  catalogue does not hold, or names one whose part count disagrees with `pieces`.
  What stays dealt fresh is the order the pieces wait in. Spare pictures nobody
  names are held to every rule the five in play are.
- **A scene is one target with several pieces**: every part carries the whole
  scene box and the scene's single anchor, so `targets: 1` however many pieces.
- **Two congruent parts are interchangeable.** A piece is accepted by any *free*
  place whose signature matches, and `settle` records the swap so `placeOf` stays
  a bijection. Congruence is geometry alone (`signatureOf`); mirrored forms
  deliberately do not match; a scene must paint congruent parts identically or a
  swap would change the picture. Read this before touching the kind:
  [Two shapes the same are the same piece](<../../docs/decisions/Two shapes the same are the same piece.md>).
- The same rule reaches the idle hint through `openTargets`: a piece with four
  congruent petals free glows at all four, and the set shrinks as its twins fill
  up.

**Adding a scene** is an entry in `SCENES`; putting it in front of a child is
naming it in a level's `options.shapePicture`. Three things the tests hold you
to, all about the child:

- the picture must read as the thing it is at a glance - render it and look;
- no part may be much smaller than about a third of the box, or the tray draws
  it below grabbable size and the layout refuses the cast;
- congruent places must sit far enough apart that a part laid squarely over a
  filled twin does not cover its own place's middle, or a piece appears to jump.
  `tests/polygon.test.ts` measures every scene for it.

## Levels played by touching

`src/kinds/play.ts` plays levels 1, 3 and 5. **Touch a thing, a thing happens.**
Which activity a level runs is `options.activity`, and every `play` level names
one - `tests/play.test.ts` insists, because a level that fell back to a default
is a level nobody chose.

- **bubbles** rise from the bottom and burst under a finger;
- **peekaboo** hides each dealt animal behind a bush, and a touch uncovers it;
- **alive** is a scene where everything answers - the sun spins, a cloud drifts,
  an animal waggles.

Four rules, and they are the level rather than polish:

- **There is no way to be wrong.** Nothing is picked up, so nothing can be
  dropped anywhere; `accepts` returns false for everything. A touch that lands on
  nothing does nothing - never a buzz, never a wobble.
- **There is no way to get stuck.** `goalFor` is measured against `thingsFor`, so
  no level asks for more touches than it gave things to touch - strictly fewer for
  everything but peekaboo. A bubble that drifts away untouched is replaced at
  once.
- **There is always a way out.** The goal is what the level asks for;
  `ACTIVITY_PATIENCE_MS` is what it settles for - ten seconds after the level was
  dealt, the way onwards is up whatever has been touched. `isComplete` reads that
  deadline as well as the count, and `play` arms a timer calling `host.touched()`
  with no point, so the host looks again without sparkling at a finger that was
  not there. It ends nothing else. The deadline is stamped on the *puzzle* when it
  is dealt, so turning the tablet hands out no second ten seconds. See
  [Ask a touch level for a handful, and let the child out anyway](<../../docs/decisions/Ask a touch level for a handful, and let the child out anyway.md>).
- **The answer is immediate.** `pointerdown`, not click, and nothing waits for an
  animation. An animation may run *after* the answer.

Also:

- Progress lives in a `touched` set on the puzzle rather than in `placed`,
  because `isComplete` is handed only the puzzle and the same puzzle object is
  passed to `play` again after a re-layout. `play` returns a teardown, called
  before the next board is mounted.
- **The burst is `src/pop.ts`, not part of the bubbles**, because a chapter
  celebration bursts balloons the same way. `releasePoppable` looks after one
  floater's drift, hit target and removal; `popBurst` is the burst alone. Under
  `prefers-reduced-motion` a floater does not drift at all rather than collapsing
  to a millisecond, which would leave an empty sky:
  [Under reduced motion, a floater holds still](<../../docs/decisions/Under reduced motion, a floater holds still.md>).
- An activity level is still dealt a cast and given a layout - bubbles never
  draws its animals - because the layout is composed around a cast. Its backdrop
  is the ordinary landscape with `tray: false`; `alive` also passes `sky: false`
  so the scenery leaves the sun and clouds to the kind.
- Chapter 1 alternates touch and drag on purpose:
  [Open the game with something to touch](<../../docs/decisions/Open the game with something to touch.md>).

## The kind registry

`kindFor(level)` in `src/kinds/registry.ts` looks a level's kind id up. All six
are built, so it either returns the kind or throws: no fallback, and an id that
is not in `PuzzleKindId` does not compile. The stand-in scaffold came down when
the last kind landed
([Play an unbuilt kind as a stand-in](<../../docs/decisions/Play an unbuilt kind as a stand-in.md>)).

- **Adding a kind** is one entry in `LOADERS` and one in `PUZZLE_KINDS`
  (`src/levels.ts`), and the levels that named it start playing it - with a
  switch of its own in the grown-up panel, which walks that list. Do not edit
  `LEVELS` to switch a kind on.
- **A kind is also where the bundle is cut.** `play` and `shapeMatch` are static
  imports because they are the whole of chapters 1 and 2 and the opening must
  never wait; the other four are `import()`ed, a chunk each. `kindFor` stays
  synchronous and strict - a kind that has not arrived throws, and says so
  differently from one nobody wrote - and `ensureKind` is the one place that
  waits. Nothing loads on demand: `src/warm.ts` fetches every kind during play,
  so a level seam is a resolved promise. A new kind needs a `LOADERS` entry and
  nothing else. See
  [A chapter is warmed before it is needed, not fetched when it is](<../../docs/decisions/A chapter is warmed before it is needed, not fetched when it is.md>).
- **Never put a retry loop around a chunk that failed to load.** A browser
  remembers a failed dynamic import and answers every later ask with the same
  rejection without going near the network. The only ways back are a different URL
  or a fresh page; `recoverWhenPossible` takes the second, once the device says it
  is online again, never merely because a fetch failed, and capped so a flapping
  connection cannot make the game blink.
