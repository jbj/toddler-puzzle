# Animal Puzzle

**Play it at [jbj.github.io/toddler-puzzle](https://jbj.github.io/toddler-puzzle/).**

A drag-and-drop shape puzzle for toddlers. Animals wait in a tray; each one is
dragged onto the matching animal-shaped hole in the landscape. The game grows as
it goes - thirty levels in six chapters of five, starting with a single huge
animal so the first win comes quickly, then adding pieces and taking a little
forgiveness away as it climbs. Finish one level and a big arrow leads to the
next; finish the last and the arrow starts the game over.

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
silhouette to 48 pixels, the size a tray piece really is, and fails any pair that
overlaps too much. See
[decision 20260729T004500](docs/decisions/20260729T004500-silhouettes-checked-at-a-glance.md).

**It picks up where it left off.** Thirty levels is more than one sitting, so
the level being played is kept in `localStorage` and the next visit resumes
there. A browser that will not store anything - private browsing on an iPad
throws at the sight of it - simply starts at level 1 again, silently, because a
toy that will not start is worse than a toy that forgets. See
[decision 20260728T212500](docs/decisions/20260728T212500-remember-where-the-child-stopped.md).

**Some of the thirty levels are still stand-ins.** The whole ramp lives in one
table, [`src/levels.ts`](src/levels.ts), and each level names the kind of puzzle
it wants: matching animals to holes, cutting one animal into slices, a jigsaw, and
so on. Only some of those kinds are built. A level naming one that is not is
played as a matching puzzle of about the right size instead, so the level is
always a real, finishable level, and building the kind later needs no change to
the table. See
[decision 20260728T205627](docs/decisions/20260728T205627-unbuilt-kinds-play-as-stand-ins.md).

**There is a door for grown-ups.** Nothing on the play surface is a menu or a
setting, because the player cannot read. But thirty levels need somebody who can
read to be able to steer, so a small "Grown-ups" button in the corner opens a
panel - by being **held for two seconds**, never by being tapped, however many
times a small hand tries. Behind it are a map of the thirty levels to jump about
in, switches for sound, rotation and idle hints, and the only place progress can
be cleared. It is deliberately plain and adult-looking, and closing it puts the
child back exactly where they were. Sound works today; rotation and idle hints
are stored and take effect when those features arrive. See
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
