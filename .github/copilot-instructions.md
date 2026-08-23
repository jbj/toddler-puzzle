# Copilot instructions

Animal Puzzle is a drag-and-drop shape puzzle for toddlers. A young child
matches large animal pieces to matching holes; the game opens with the easiest
drag it can ask for, grows gradually, and deals every puzzle fresh.

## Always true

- `npm run verify` is the pre-PR definition of done. Run it; never weaken a
  check to make it pass.
- The player is a two-year-old who cannot read. When a question is open, choose
  the more forgiving option that needs less understanding.
- Product invariants are deliberate and must not be weakened silently.
- Nothing in `docs/` is loaded automatically. Read only the files the task
  needs; source comments sometimes route to a specific one.

## Product guardrails

Read [`docs/product.md`](../docs/product.md) before changing behavior a player
would notice.

- Draw each piece and its hole from one silhouette. A piece snaps only into its
  own hole; a wrong drop returns gently. Every kind shares the same generous
  placement rule, and every target stays large.
- Keep the child's game moving forward: no menu, difficulty picker, settings,
  failure state, or score on the play surface.
- Every puzzle earns a playable celebration. Grown-up controls stay behind a
  deliberate hold.
- Paint no animal into a background. Add no binary assets, runtime
  dependencies, or network requests.

## Which detail to read

Every code change needs [`docs/code.md`](../docs/code.md). Every Markdown change
needs [`docs/documentation.md`](../docs/documentation.md). Read
[`docs/tests.md`](../docs/tests.md) when writing or interpreting tests, and
[`docs/art.md`](../docs/art.md) for animals, scenes, or art tooling. For the
rest, choose the topics that fit the task.

| Read | When you are |
| --- | --- |
| [`docs/product.md`](../docs/product.md) | Changing player-visible behavior or questioning an invariant |
| [`docs/code.md`](../docs/code.md) | Changing code, scripts, checks, or pull-request workflow |
| [`docs/documentation.md`](../docs/documentation.md) | Writing or reorganizing Markdown |
| [`docs/art.md`](../docs/art.md) | Drawing or reviewing an animal or scene |
| [`docs/puzzle-kinds.md`](../docs/puzzle-kinds.md) | Changing a kind, level table, or kind registry |
| [`docs/cutting.md`](../docs/cutting.md) | Cutting drawings into slices, jigsaws, or shards |
| [`docs/layout.md`](../docs/layout.md) | Composing the board, tray, piece box, or backdrop |
| [`docs/navigation.md`](../docs/navigation.md) | Changing progression, celebrations, resuming, or grown-up controls |
| [`docs/feel.md`](../docs/feel.md) | Changing sound, hints, rest, dragging, or toddler-proofing |
| [`docs/tests.md`](../docs/tests.md) | Writing or interpreting checks against fresh deals |

Keep each rule in one topic file. Link rather than repeat.

[`docs/decisions/`](../docs/decisions/README.md) holds on-demand rationale for
current choices that are easy to mistake for oversights. Read a record only
when its decision is in question.
