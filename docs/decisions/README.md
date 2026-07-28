# Decision records

These records explain choices that are easy to mistake for oversights and
"fix". They are lightweight on purpose: use a few paragraphs for context,
decision, and consequence, with no ceremony.

They are the **secondary** layer of this project's documentation. The primary
layer is the instruction files indexed by
[`.github/copilot-instructions.md`](../../.github/copilot-instructions.md):
those say what the rule is, in the place you will be working. A record here says
why, at more length than a rule can carry. Read one when you are about to argue
with a rule, or when a change would overturn the reasoning rather than the
wording.

Keep them maintained. If a decision is reversed, add a record that supersedes it
rather than quietly editing the old one - the point of the file is the argument,
and an argument nobody can see having changed is worth nothing.

| Record | Decides |
| --- | --- |
| [0001](0001-generous-snap-radius.md) | Keep snapping generous and owned |
| [0002](0002-no-menu-or-difficulty-picker.md) | Keep the game moving forward |
| [0003](0003-budgeted-overhang.md) | Budget overhang instead of banning it |
| [0004](0004-generated-layouts.md) | Generate layouts at stage start |
| [0005](0005-no-binary-assets-or-runtime-dependencies.md) | Keep assets and runtime simple |
| [0006](0006-screenshots-come-from-the-author.md) | Let the author attach the screenshots |
| [0007](0007-no-required-approving-review.md) | Require no approving review on `main` |
| [0008](0008-deploy-to-github-pages.md) | Deploy to Pages from a verified commit |
| [0009](0009-composed-layouts.md) | Compose layouts for any cast |
