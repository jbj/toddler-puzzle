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
| [20260727T072917-generous-snap-radius](20260727T072917-generous-snap-radius.md) | Keep snapping generous and owned |
| [20260727T072917-no-menu-or-difficulty-picker](20260727T072917-no-menu-or-difficulty-picker.md) | Keep the game moving forward |
| [20260727T072917-budgeted-overhang](20260727T072917-budgeted-overhang.md) | Budget overhang instead of banning it |
| [20260727T072917-generated-layouts](20260727T072917-generated-layouts.md) | Generate layouts at stage start |
| [20260727T072917-no-binary-assets-or-runtime-dependencies](20260727T072917-no-binary-assets-or-runtime-dependencies.md) | Keep assets and runtime simple |
| [20260727T105836-screenshots-come-from-the-author](20260727T105836-screenshots-come-from-the-author.md) | Let the author attach the screenshots |
| [20260727T151749-no-required-approving-review](20260727T151749-no-required-approving-review.md) | Require no approving review on `main` |
| [20260728T103610-deploy-to-github-pages](20260728T103610-deploy-to-github-pages.md) | Deploy to Pages from a verified commit |
| [20260728T115938-composed-layouts](20260728T115938-composed-layouts.md) | Compose layouts for any cast |
| [20260728T120732-grab-anywhere-in-the-piece-box](20260728T120732-grab-anywhere-in-the-piece-box.md) | Grab a piece by the box around its artwork |
| [20260728T205626-declarative-level-table](20260728T205626-declarative-level-table.md) | Put the whole difficulty ramp in one table |
| [20260728T205627-unbuilt-kinds-play-as-stand-ins](20260728T205627-unbuilt-kinds-play-as-stand-ins.md) | Play an unbuilt kind as a stand-in |
| [20260728T212500-remember-where-the-child-stopped](20260728T212500-remember-where-the-child-stopped.md) | Remember the level, and lose it safely |
| [20260729T000652-a-door-for-grown-ups](20260729T000652-a-door-for-grown-ups.md) | Put the settings behind a two-second hold |
| [20260729T004500-silhouettes-checked-at-a-glance](20260729T004500-silhouettes-checked-at-a-glance.md) | Check silhouettes for distinctness at a glance |
| [20260729T061500-slices-are-clipped-not-cut](20260729T061500-slices-are-clipped-not-cut.md) | Clip a slice out of an animal rather than cutting one |
| [20260729T072100-the-game-opens-with-something-to-touch](20260729T072100-the-game-opens-with-something-to-touch.md) | Open the game with something to touch |
| [20260729T072100-reduced-motion-holds-still](20260729T072100-reduced-motion-holds-still.md) | Hold a floater still under reduced motion |
| [20260729T090200-two-shapes-the-same-are-the-same-piece](20260729T090200-two-shapes-the-same-are-the-same-piece.md) | Let identical shapes fill each other's shadows |
| [20260729T101500-every-piece-needs-something-in-it](20260729T101500-every-piece-needs-something-in-it.md) | Measure that no piece of a picture is featureless |
| [20260729T114500-every-cut-is-made-once](20260729T114500-every-cut-is-made-once.md) | Make every jigsaw cut once and give it to both neighbours |
| [20260729T124500-a-shard-is-a-thing-to-hold](20260729T124500-a-shard-is-a-thing-to-hold.md) | Cut a picture into shards that are things to hold |
| [20260729T152400-a-celebration-is-played-not-finished](20260729T152400-a-celebration-is-played-not-finished.md) | Play a chapter celebration rather than watch it |
| [20260730T093000-a-lone-picture-stands-its-pieces-in-the-gutters](20260730T093000-a-lone-picture-stands-its-pieces-in-the-gutters.md) | Stand a lone picture's pieces in the gutters |
| [20260730T183000-sounds-are-data-and-the-machine-listens](20260730T183000-sounds-are-data-and-the-machine-listens.md) | Write sounds as data and measure them offline |
| [20260730T203000-no-rotation-mode](20260730T203000-no-rotation-mode.md) | Drop rotation mode rather than guess at the gesture |
| [20260730T213000-a-hint-points-at-both-ends](20260730T213000-a-hint-points-at-both-ends.md) | Point an idle hint at the piece as well as its place |
| [20260730T194500-a-placed-piece-has-no-edge](20260730T194500-a-placed-piece-has-no-edge.md) | Take a piece's cut edge away once it is placed |
| [20260729T223500-a-chapter-is-warmed-before-it-is-needed](20260729T223500-a-chapter-is-warmed-before-it-is-needed.md) | Budget the bundle, and warm a chapter rather than fetch it |
| [20260730T000400-the-home-screen-icon-is-svg](20260730T000400-the-home-screen-icon-is-svg.md) | Ship an SVG home-screen icon rather than a committed PNG |
| [20260730T005900-guard-the-sample-against-the-table](20260730T005900-guard-the-sample-against-the-table.md) | Guard the shot run's sample against the level table |
| [20260730T113000-a-check-explains-its-own-environment](20260730T113000-a-check-explains-its-own-environment.md) | Let a check explain its own environment rather than fail as something else |
| [20260730T194900-a-grown-up-can-take-a-kind-out](20260730T194900-a-grown-up-can-take-a-kind-out.md) | Let a grown-up switch a kind of puzzle out of the thirty |
| [20260731T152600-a-level-names-what-it-is-made-of](20260731T152600-a-level-names-what-it-is-made-of.md) | Name a level's subject in the table, so no two levels are the same puzzle |
