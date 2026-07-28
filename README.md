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

**Some of the thirty levels are still stand-ins.** The whole ramp lives in one
table, [`src/levels.ts`](src/levels.ts), and each level names the kind of puzzle
it wants: matching animals to holes, cutting one animal into slices, a jigsaw, and
so on. Only some of those kinds are built. A level naming one that is not is
played as a matching puzzle of about the right size instead, so the level is
always a real, finishable level, and building the kind later needs no change to
the table. See
[decision 20260728T205627](docs/decisions/20260728T205627-unbuilt-kinds-play-as-stand-ins.md).

Works with a finger or a mouse, in landscape or portrait. There is no menu and
nothing to configure: the player cannot read.

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
