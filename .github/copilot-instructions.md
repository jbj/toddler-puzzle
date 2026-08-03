# Copilot instructions

Animal Puzzle is a drag-and-drop animal shape puzzle for toddlers: a two-year-old
matches large animal pieces to matching animal-shaped holes. A game is thirty
levels long and grows as it goes - bubbles to pop and one animal to begin with,
so the first win comes quickly, then more pieces and more kinds of puzzle - and
every puzzle is dealt fresh.

Three things are true of every change:

- `npm run verify` is the pre-PR definition of done. Run it; never weaken a check
  to make it pass.
- The invariants are deliberate and must not be weakened silently. Several look
  like oversights until you know why they are there.
- The audience is a two-year-old who cannot read. When a question is open, choose
  the more forgiving option.

## Which file to read

The detail lives in `.github/instructions/`. A task usually needs one or two of
these. The ones with an `applyTo` also attach themselves when you touch a file
they cover, so you may find one already in front of you.

| Read | When you are |
| --- | --- |
| [`product.instructions.md`](instructions/product.instructions.md) | Changing what the game does: what it is for, the invariants in full, and the tie-breaker for an open question |
| [`code.instructions.md`](instructions/code.instructions.md) | Working anywhere in the code: definition of done, the scripts, the source map, what a pull request carries |
| [`docs.instructions.md`](instructions/docs.instructions.md) | Writing any Markdown: which layer a thing belongs in, how a decision record is named, house style |
| [`art.instructions.md`](instructions/art.instructions.md) | Drawing or reviewing an animal or a scene: the SVG contract, the overhang budget, foot levels, why you have to look at the render |
| [`puzzle-kinds.instructions.md`](instructions/puzzle-kinds.instructions.md) | Changing a kind of puzzle: the `PuzzleKind` contract, the level table, the kind registry |
| [`cutting.instructions.md`](instructions/cutting.instructions.md) | Changing how a drawing is cut into pieces: sliced animals, jigsaws, shattered pictures |
| [`layout.instructions.md`](instructions/layout.instructions.md) | Changing how a board is composed: the tray, the box a piece is measured by, the shape of the canvas, the backdrop |
| [`navigation.instructions.md`](instructions/navigation.instructions.md) | Changing how the game progresses: levels, chapters, celebrations, resuming, the grown-ups panel |
| [`feel.instructions.md`](instructions/feel.instructions.md) | Changing how a touch feels: sound, the idle hint, resting, drag feel, toddler-proofing |
| [`tests.instructions.md`](instructions/tests.instructions.md) | Writing or reading tests: how to test against a random deal, and what each suite already covers |

Keep each rule in exactly one of those files. If two of them would both be a
reasonable home, put it in the more specific one and link from the other.

## Secondary documentation

[`docs/decisions/`](../docs/decisions/README.md) holds short records of choices
that are easy to mistake for oversights and "fix". The files above say what the
rule is; a decision record says why, at more length than a rule can carry. Read
one when you are about to argue with a rule, or when you are writing a rule that
needs an argument behind it.
