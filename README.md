# Animal Puzzle

**Play it at [jbj.github.io/toddler-puzzle](https://jbj.github.io/toddler-puzzle/).**

A drag-and-drop shape puzzle for toddlers. Animals wait in a tray; each one is
dragged onto the matching animal-shaped hole in the landscape. The game is
thirty levels long, in five chapters of six, and it grows as it goes - a single
huge animal to drag to begin with, so the first win comes quickly, then more
pieces and more kinds of puzzle from there. Finish a level and a big arrow leads
to the next; finish the last and the arrow starts the game over.

**Every puzzle is dealt fresh.** Which animals turn up and the order they stand
in are drawn at random each time a puzzle starts, so the same animals are never
waiting in the same places twice. Add `?seed=123` to the URL to replay a
particular deal - the screenshot run uses it to keep its shots comparable.

Works with a finger or a mouse, on a screen of any shape. There is no menu and
nothing to configure: the player cannot read.

```
npm install
npm run dev
```

`npm run verify` is the single check that has to pass before a pull request:
lint, format check, docs check, build, tests, the art and audio checks, and a
headless Chrome run that plays the game through and screenshots it.

## Documentation

Everything else - the invariants, the art contract, the source map, how to add
an animal, what each check covers - starts in
[`.github/copilot-instructions.md`](.github/copilot-instructions.md). It is a
small working brief and a map to the topic files in [`docs/`](docs/). Choose the
detail the task needs; none of it is loaded automatically. It is written for
coding agents, but a human contributor wants the same things, so start there.

[`docs/decisions/`](docs/decisions/README.md) is the secondary layer: short
records of choices that are easy to mistake for oversights, kept for when you
want to know why a rule exists rather than what it says.
