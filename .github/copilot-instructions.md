# Copilot instructions

Animal Puzzle is a drag-and-drop animal shape puzzle for toddlers: a two-year-old
matches large animal pieces to matching animal-shaped holes. A game is thirty
levels long and grows as it goes - one animal to begin with, so the first win
comes quickly, then more pieces and more kinds of puzzle - and every puzzle is
dealt fresh.

## Always true

- `npm run verify` is the pre-PR definition of done. Run it; never weaken a check
  to make it pass.
- The player is a two-year-old who cannot read. When a question is open, choose
  the more forgiving option that needs less understanding.
- Product invariants are deliberate and must not be weakened silently. Several
  look like oversights until you know why they are there.
- Nothing in `docs/` is loaded automatically. Use your judgement to read the
  files your task needs; source comments sometimes point at a specific one.

## Product guardrails

Read [`docs/product.md`](../docs/product.md) before changing behaviour a player
would notice. These highest-risk rules belong in every session:

- Draw each piece and its hole from one silhouette. A piece snaps only into its
  own hole; a wrong drop returns gently. Every kind uses the same generous
  box-and-middle placement rule, and every target stays large.
- The child's game moves only forward: no menu, difficulty picker, settings,
  failure state or score on the play surface. Open on the easiest drag the game
  can ask for.
- Every level earns a playable celebration, and the end of a chapter a bigger
  one. Grown-up controls stay behind the two-second hold.
- Paint no animal into a background. Add no binary assets, runtime dependencies
  or network requests.

## Which detail to read

Every code change needs [`docs/code.md`](../docs/code.md). Every Markdown change
needs [`docs/documentation.md`](../docs/documentation.md). Read
[`docs/tests.md`](../docs/tests.md) when writing or interpreting tests, and
[`docs/art.md`](../docs/art.md) for animals, scenes or art tooling. For the rest,
choose the rows that fit the task; a task commonly needs one or two.

| Read | When you are |
| --- | --- |
| [`docs/product.md`](../docs/product.md) | Changing player-visible behaviour or questioning an invariant |
| [`docs/code.md`](../docs/code.md) | Working anywhere in code: definition of done, scripts, source map, PR expectations |
| [`docs/documentation.md`](../docs/documentation.md) | Writing Markdown: layers, decision records, house style |
| [`docs/art.md`](../docs/art.md) | Drawing or reviewing an animal or scene |
| [`docs/puzzle-kinds.md`](../docs/puzzle-kinds.md) | Changing a kind, level table or kind registry |
| [`docs/cutting.md`](../docs/cutting.md) | Cutting drawings into slices, jigsaws or shards |
| [`docs/layout.md`](../docs/layout.md) | Composing the board, tray, piece box or backdrop |
| [`docs/navigation.md`](../docs/navigation.md) | Changing levels, celebrations, resuming or the grown-ups panel |
| [`docs/feel.md`](../docs/feel.md) | Changing sound, hints, rest, dragging or toddler-proofing |
| [`docs/tests.md`](../docs/tests.md) | Writing or reading tests against fresh deals |

Keep each rule in exactly one topic file. If two would both be reasonable, put
it in the more specific one and link from the other.

[`docs/decisions/`](../docs/decisions/README.md) explains why choices that look
like oversights are deliberate. Read a record when you are about to argue with a
rule, or when a new rule needs more argument than the topic file can carry.
