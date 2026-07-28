# Animal Puzzle

**Play it at [jbj.github.io/toddler-puzzle](https://jbj.github.io/toddler-puzzle/).**

A drag-and-drop shape puzzle for toddlers. Animals wait in a tray; each one is
dragged onto the matching animal-shaped hole in the landscape. The game is three
puzzles long and grows as it goes - **three animals, then four, then six** - so
the first win comes quickly and the board fills up from there. Finish one and a
big arrow leads to the next; finish the last and the arrow starts the game over.

**Every puzzle is dealt fresh.** Which animals turn up and the order they stand
in are drawn at random each time a puzzle starts, so the same three animals are
never waiting in the same places twice. Add `?seed=123` to the URL to replay a
particular deal - the screenshot run uses it to keep its shots comparable.

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
[decision 0008](docs/decisions/0008-deploy-to-github-pages.md).

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
