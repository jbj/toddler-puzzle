# Two shapes the same are the same piece

The polygon chapter builds pictures out of plain coloured shapes: a house
from a square and a triangle, a train from carriages and wheels, a flower
from a middle and several petals. Pictures made of simple shapes repeat
themselves - that is most of what makes them simple - so nearly every
scene has two or more parts that are identical.

Everything else in this game tracks a placement by `PieceId`. A
shape-match level deals one animal, and the animal goes in its one hole; a
sliced level deals several pieces of one animal, and each piece has
exactly one place it can be. `Puzzle.place(pieceId)` and
`PuzzleKind.target(piece)` are both written in those terms.

Follow that through to a scene with repeated parts and it says: a specific
petal belongs in a specific petal shadow, arbitrarily assigned. A child
picks up a different, congruent petal, drops it dead-centre on that
shadow, and the game floats it back to the tray with a soft warm tone.

That is the one thing this game never does. The invariant is that a
wrong drop is a *wrong* drop - the wrong animal, or nowhere near - and the
game's whole posture is that it corrects imprecision without scolding
([Keep snapping generous and owned](<Keep snapping generous and owned.md>)).
Refusing a placement that is visibly, exactly right teaches a
two-year-old that the game is arbitrary, which is worse than any amount of
imprecision.

Nor can the child recover by understanding the rule, because there is no
rule to understand: two congruent parts of a scene are drawn identically,
so nothing on the screen distinguishes "their" shadow from the other one.
The only fix available to the player is to try each piece in each hole
until the arbitrary assignment happens to line up.

## Decision

**Two parts of a scene that are congruent are interchangeable, and either
fills either shadow.**

Congruence is decided by geometry alone. `signatureOf` in `src/scenes.ts`
mints a string out of a part's form and its measurements - every field of
the form, sorted by name, as `key=value` - so a square becomes
`form=square,size=<n>`, a circle `diameter=<n>,form=circle`, and a
triangle pointing up `form=triangle,height=<n>,point=up,width=<n>`. Two
parts with the same signature are the same piece as far as the child is
concerned. Mirrored forms deliberately do not match: a left fin and a
right fin are two different shapes, and putting one where the other goes
would leave the fish looking wrong.

**A scene must paint congruent parts identically.** Same fill, same
detail, same name. `tests/polygon.test.ts` enforces it. Without that rule
the swap would change the picture, and the child would see the game
rearrange itself in answer to a correct move.

**The kind keeps a bijection, not a rule.** `placeOf` maps every piece to
the place it is currently aimed at, starting from the authored one. A
piece dropped on a free congruent place *takes* it, and the piece that
held it takes the first piece's place in exchange. Because the map stays
one-to-one, the picture always has exactly one shape headed for each
shadow, no shadow is ever orphaned, and the level can still finish however
the twins were shared out.

**The host learns about a drop twice.** `PuzzleKind` gained an optional
`settle(puzzle, layout, piece, at)`, called between `accepts` and `place`.
It exists because `target(piece)` is asked *after* the drop - again on
the next re-render, and again when the tablet is turned - by which time
the finger is long gone and there is nothing left to say which of two
identical shadows was meant. `settle` is the one moment the drop point is
still known, so it is where the swap is written down. No other kind
implements it.

## Consequence

A shadow's `data-piece` attribute changes over the life of a level: it
names the piece *currently* assigned to that place, not a fixed owner.
Anything that reads the backdrop - the screenshot run's drag helper, most
of all - has to read it fresh rather than cache it.

The generous snap radius and interchangeable shapes pull against each
other: two congruent shadows sitting close together could mean a drop
aimed squarely at a filled one jumps to its free twin, which would look
like the game moving the piece somewhere the child did not put it. So
scenes are authored with congruent places far enough apart that a
dead-centre drop on a filled place falls outside its twin's snap radius,
and `tests/polygon.test.ts` measures every scene to prove it. A drop on a
place that is already taken is refused, exactly as a drop on the wrong
animal is.

Congruence-by-geometry means a scene author gets interchangeability by
drawing the same shape twice, with nothing to declare and nothing to
remember. It also means they cannot switch it off: two identical shapes in
one scene are interchangeable whether the author thought about it or not,
which is the right default, because the child does not care what the
author thought.
