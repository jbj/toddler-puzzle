# Animal Puzzle

**Play it at [jbj.github.io/toddler-puzzle](https://jbj.github.io/toddler-puzzle/).**

A drag-and-drop shape puzzle for toddlers. Animals wait in a tray; each one is
dragged onto the matching animal-shaped hole in the landscape. The game grows as
it goes - thirty levels in six chapters of five, starting with a screenful of
bubbles to pop and a single huge animal to drag, so the first win comes quickly,
then adding pieces and taking a little forgiveness away as it climbs. Finish one
level and a big arrow leads to the next; finish the last and the arrow starts
the game over.

**The first chapter needs no dragging.** Pinching a shape, carrying it and
letting go somewhere else is a chain of three things a one-year-old can do none
of, so levels 1, 3 and 5 are pure cause and effect: touch a thing, a thing
happens. Bubbles rise and burst under a finger; bushes hide an animal until they
are touched; a sun spins, a cloud drifts and a duck waggles when they are
poked. There is nothing to aim, nothing to be wrong about and nothing to get
stuck on - the level simply ends when enough things have been touched - and
levels 2 and 4 are the smallest drags the game can ask for, waiting for whenever
the child is ready. See
[decision 20260729T072100](docs/decisions/20260729T072100-the-game-opens-with-something-to-touch.md).

**Every puzzle is dealt fresh.** Which animals turn up and the order they stand
in are drawn at random each time a puzzle starts, so the same animals are
never waiting in the same places twice. Add `?seed=123` to the URL to replay a
particular deal - the screenshot run uses it to keep its shots comparable - and
`?level=17` to start partway along the ramp, which is for working on the game
rather than for playing it.

**Later levels are themed.** Sixteen animals are grouped into casts - the farm,
the sea, the jungle - and a level that names a theme deals only from that cast,
so a whole puzzle can be one place. A theme that is short of animals is topped up
from the rest of the cast rather than failing, because a child must never meet a
level that will not start. Two animals in the same theme have to be told apart at
a glance, which `npm run art:check` measures rather than trusts: it shrinks each
silhouette to 48 pixels - coarser than the game ever draws one, because a glance
is coarser than a look - and fails any pair that overlaps too much. See
[decision 20260729T004500](docs/decisions/20260729T004500-silhouettes-checked-at-a-glance.md).

**One animal can arrive in pieces.** Levels 11-15 hand the child a single animal
cut into two, three or four slices, with one animal-shaped hole to build it in.
The hole stays showing underneath until the last slice is home, so what is
missing is always visible to somebody who cannot read. A slice is the animal's
own artwork seen through a window rather than a shape cut out of it, which is
why the parts meet exactly, and where each animal gets cut is measured from its
pixels and committed rather than worked out as the game runs. See
[decision 20260729T061500](docs/decisions/20260729T061500-slices-are-clipped-not-cut.md).

**A picture can be built out of shapes.** Levels 16-20 leave the animals aside
and hand the child a house, a boat, a rocket, a car, a fish, a flower, a
butterfly, a train or a sunflower in three to six plain, strongly coloured
pieces - a square, a triangle, a circle - to be dropped into their shadows in the
finished picture. Each piece is still a whole thing a child can name, so the
shape names come along without any of it being a lesson. The shapes are drawn by
the code rather than by hand.

**Two of the same shape are the same piece.** A house has two square walls and a
flower four petals, and a child who puts a petal on the wrong petal-shaped
shadow has done something visibly right - so the game takes it, and quietly
sends the displaced petal to the shadow that was freed. Being told "no" for a
correct move is the one thing this game never does. See
[decision 20260729T090200](docs/decisions/20260729T090200-two-shapes-the-same-are-the-same-piece.md).

**A picture cut into interlocking pieces.** Levels 21-25, 29 and 30 are
jigsaws: one of four hand-drawn scenes - a farmyard, a rockpool, a jungle path,
a night sky - cut on a grid that grows from four pieces to twelve, and rebuilt
in the frame it came out of, with the picture itself left showing faintly
underneath as the guide. Every cut is made **once** and given to both the
pieces it divides, one of them backwards, so neighbours mesh by construction
rather than by two calculations that agree; and a piece is the scene's own
artwork through a clip path, so one drawing serves every grid size. See
[decision 20260729T114500](docs/decisions/20260729T114500-every-cut-is-made-once.md).

The hard part was not drawing a nice picture, it was drawing one whose
*pieces* are all worth looking at: a lovely wide beach cuts into four squares of
identical blue, and a two-year-old holding one of them has been given a puzzle
with no information in it. So `npm run art:check` cuts each scene at every grid
the level table uses and fails any piece that is more or less all one colour,
naming the row and column. A shatter has no grid to cut at, so the same promise
is asked of the picture instead: slide a square the size of the smallest shard
allowed over the scene, and the emptiest place it can sit still has to have
something in it. See
[decision 20260729T101500](docs/decisions/20260729T101500-every-piece-needs-something-in-it.md).

**The same picture, broken instead of cut.** Levels 26 and 28 shatter a scene
into irregular convex shards rather than cutting it on a grid. It looks harder
and is easier: every shard is a different shape, so a child can match it by its
outline instead of by what is drawn on it - the skill the shape-match levels
have been building all along. The shards come from recursive half-plane splits
rather than a Voronoi diagram, so convexity is free, and the partition is
*searched* rather than tried: a minimum area, a minimum inscribed radius and a
maximum spread are enforced on every shard and every region on the way to one,
by backtracking until a plan clears them all. See
[decision 20260729T124500](docs/decisions/20260729T124500-a-shard-is-a-thing-to-hold.md).

**It picks up where it left off.** Thirty levels is more than one sitting, so
the level being played is kept in `localStorage` and the next visit resumes
there. A browser that will not store anything - private browsing on an iPad
throws at the sight of it - simply starts at level 1 again, silently, because a
toy that will not start is worse than a toy that forgets. See
[decision 20260728T212500](docs/decisions/20260728T212500-remember-where-the-child-stopped.md).

**The whole ramp is one table.** [`src/levels.ts`](src/levels.ts) holds all
thirty levels, and each one names the kind of puzzle it wants: matching animals
to holes, cutting one animal into slices, building a picture out of shapes,
something to touch, a jigsaw, a shattered picture. All six are built, so the
table now describes exactly the game that exists. For most of the project's life
it ran ahead of the code - a level naming a kind nobody had written yet was
played as a matching puzzle of about the right size, so the ramp was always
visible and always finishable. See
[decision 20260728T205627](docs/decisions/20260728T205627-unbuilt-kinds-play-as-stand-ins.md).

**There is a door for grown-ups.** Nothing on the play surface is a menu or a
setting, because the player cannot read. But thirty levels need somebody who can
read to be able to steer, so a small "Grown-ups" button in the corner opens a
panel - by being **held for two seconds**, never by being tapped, however many
times a small hand tries. Behind it are a map of the thirty levels to jump about
in, a switch for sound, a choice of idle hints, and the only place progress can
be cleared. It is deliberately plain and adult-looking, and closing it puts the
child back exactly where they were. Sound works today; idle hints are stored and
take effect when that feature arrives. There is no rotation switch - see
[decision 20260730T203000](docs/decisions/20260730T203000-no-rotation-mode.md).
See also
[decision 20260729T000652](docs/decisions/20260729T000652-a-door-for-grown-ups.md).

Works with a finger or a mouse, in landscape or portrait.

```
npm install
npm run dev
```

`npm run verify` is the single check that has to pass before a pull request:
lint, format check, docs check, build, tests, art check, and a headless Chrome
run that plays the game through and screenshots it.

Every push to `main` that CI verifies is published to the URL above by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml); why it waits for CI
rather than deploying on the push is
[decision 20260728T103610](docs/decisions/20260728T103610-deploy-to-github-pages.md).

## Documentation

Everything else - the invariants, the art contract, the source map, how to add
an animal, what each check covers - is in
[`.github/copilot-instructions.md`](.github/copilot-instructions.md), which is
an index over half a dozen short files in
[`.github/instructions/`](.github/instructions). It is written for coding agents,
but a human contributor wants the same things, so start there.

[`docs/decisions/`](docs/decisions/README.md) is the secondary layer: short
records of choices that are easy to mistake for oversights, kept for when you
want to know why a rule exists rather than what it says.
