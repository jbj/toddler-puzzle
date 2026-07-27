# Copilot instructions

Animal Puzzle is a drag-and-drop animal shape puzzle for toddlers: a two-year-old
matches large animal pieces to matching animal-shaped holes. A game is three
puzzles long - three animals, then four, then six - and every puzzle is dealt
fresh.

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
| [`product.instructions.md`](instructions/product.instructions.md) | Changing what the game does: the invariants in full, the tie-breaker, and the decisions to raise with a human first |
| [`art.instructions.md`](instructions/art.instructions.md) | Drawing or reviewing an animal: the SVG contract, the overhang budget, foot levels, adding one |
| [`code.instructions.md`](instructions/code.instructions.md) | Working anywhere in the code: definition of done, the scripts, the source map, what a pull request has to carry |
| [`tests.instructions.md`](instructions/tests.instructions.md) | Writing or reading tests: how to test against a random deal, and what each suite already covers |
| [`puzzle-kinds.instructions.md`](instructions/puzzle-kinds.instructions.md) | Changing a kind of puzzle or its layout: the `PuzzleKind` contract, shape-match, stages, arrangements, orientation |
| [`navigation.instructions.md`](instructions/navigation.instructions.md) | Changing the shell around the puzzle: moving between stages, the buttons and dots, sound, sparkles, drag feel, toddler-proofing |

Keep each rule in exactly one of those files. If two of them would both be a
reasonable home, put it in the more specific one and link from the other.

## Secondary documentation

[`docs/decisions/`](../docs/decisions/README.md) holds short records of choices
that are easy to mistake for oversights and "fix". The files above say what the
rule is; a decision record says why, at more length than a rule can carry. Read
one when you are about to argue with a rule, or when you are writing a rule that
needs an argument behind it.
