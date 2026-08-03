# A background belongs to the theme

## Context

Ten of the thirty levels, and level 27, name a `theme` in the level table. A
theme narrows the deal: level 10 is `sea`, so the cast is the whale, the fish,
the crab, the octopus, the turtle and the penguin. That much has always worked.

What the child saw was a whale, an octopus and a crab standing on a green hill
under a blue sky with a sun in it - the same hill and the same sun as every other
level in the game. A theme that reaches the cast and not the background is half a
theme, and the half it is missing is the half a two-year-old can see.

The game also already owns art for exactly these worlds: `farmyard.svg`,
`jungle-path.svg` and `rockpool.svg`, the hand-drawn scenes the later chapters
cut into jigsaws and shards. Whatever the themed levels look like, they should
look like they came from the same hand as those.

## Decision

### One generated landscape, four palettes

`src/scenery.ts` stays what it is: a landscape composed from the layout rather
than a picture of a fixed size. That is what lets thirty levels and two
orientations share one piece of art, and a themed background is not a good enough
reason to give any of that up.

So a theme is a `Backdrop` record - a sky wash, a far ground, a near ground, what
furnishes the air, what stands in the distance, and what grows on a ground line -
and `renderScenery` looks one up from `layout.level.theme`. The theme arrives for
free: `renderScenery` already takes the `Layout`, and the `Layout` already
carries its `LevelSpec`. No kind, no board and no game needed a new parameter.

A level with no theme resolves to the meadow, which is exactly today's art
unchanged, so nineteen levels are untouched by this. `vehicles` is a theme
`themes.ts` declares, no level names and no animal belongs to; it resolves to the
meadow too, until there is something to put in it.

### The scenes are drawn *from*, not drawn *in*

The obvious move is to inline `farmyard.svg` behind a farm level. It does not
work, and the reasons are structural rather than aesthetic.

Each scene is a fixed 480x360 picture with its own horizon, and each is built to
a contract the backdrop has nothing to do with: *every quarter of it holds a
distinguishable shape*, because a jigsaw piece with nothing in it is a piece a
child cannot place (see [Insist that every piece of a picture has something in
it](<Insist that every piece of a picture has something in it.md>)). That is
precisely the opposite of what a backdrop wants, which is a busy horizon and a
quiet middle, because the middle is where the holes are. Scaled to a 1000x700
board it would also have to be stretched, and to a 700x1180 one stretched
differently.

So the props are redrawn in code, in the same flat-shape language and the same
palette, anchored to the layout's own horizon and ground lines. The colours are
lifted from the scenes literally, so the barn behind level 6 is the same red as
the barn in the jigsaw of the farmyard: one world, composed twice for two
different jobs.

### No animal is ever painted into a background

This is the rule that turned the farmyard's cow into a tractor, and it is the one
most likely to be "fixed" by someone restoring the cow.

Every animal in this game is a piece a child may be asked to place. A cow
standing in the field beside a cow-shaped hole tells a two-year-old - correctly,
as far as they can tell - that the cow they are holding is already there. The
game's central promise is that a piece only ever fits its own hole and that a
wrong drop costs nothing; a background that appears to have already answered the
question undoes that before the child has picked anything up.

So a background may hold barns, trees, tractors, haystacks, fences, shells,
mushrooms and trunks, and never an animal. The farmyard's cow is a tractor here,
the rockpool's crab and the jungle's bird are simply left out.

The scenes themselves are **not** edited: the farm jigsaw keeps its cow and the
rockpool keeps its crab. There a painted animal is part of the picture being
assembled rather than a rival to a piece in the tray, which is why the rule is
about backgrounds rather than about art.

`tests/scenery.test.ts` reads `src/scenery.ts` with comments stripped and fails
if any animal's name appears in the code, which is a blunt check that happens to
be exactly as strict as the rule.

### The sea has no sun

The sea theme is read as underwater rather than as a beach: water above, a pale
sand seabed below, seaweed and a shell and a starfish on the ground lines, light
shafts slanting down from a surface that is off the top of the screen, and a few
drifting bubbles. There is no sun and there are no clouds, because there is no
sky.

This is worth stating because "the sky has no sun in it" reads as a missing
feature in a file where three of the four backdrops draw one. It is the theme.

### The ground is chosen for what stands on it

A piece stands on a ground band, so the ground is what every animal has to read
against. That decides two colours which otherwise look arbitrary: the jungle
floor stays green rather than going brown, because the monkey is brown, and the
seabed stays pale sand rather than going deep blue, because the whale and the
fish are blue. No themed ground may be darker than the animals standing on it.

For the same reason the props stay near the horizon: the barn is scenery, and
scenery behind a hole is clutter.

`src/layout.ts` gave up its two hard-coded band fills to make this possible.
Which green a hill is is art, not geometry.

### The furniture never changes

The sand-coloured tray, the reset button, the chapter dots, the hole treatment
and the celebration are identical in every level, themed or not. They are what a
child learns once and then knows; a tray that turned blue on level 10 would be a
new thing to learn on level 10.

## Consequences

- Themed levels look like the chapter of jigsaws that comes later, which is a
  connection the game did not previously make.
- A theme added to `themes.ts` and named by a level gets a backdrop or fails a
  test. It cannot silently fall back to the meadow.
- The initial download grew, and the budget in `scripts/check-bundle.mjs` grew
  with it. That is the cost of the feature, paid in the one place the project
  makes it visible.
- Backgrounds are art, so they were reviewed by rendering them rather than by
  reading the markup: each theme in both orientations, iterated on until it was
  worth shipping. `npm run shot` keeps that going - `09b-idle-hint` is farm,
  `10-level10-start` and `12-portrait-level10` are sea, `14-level14-sliced` is
  jungle.
