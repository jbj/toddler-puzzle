# A level names what it is made of

## Context

Levels 17 and 18 were the same row twice:

```ts
{ level: 17, chapter: "shapes", kind: "polygon", targets: 1, pieces: 4, snapForgiveness: 1.1 },
{ level: 18, chapter: "shapes", kind: "polygon", targets: 1, pieces: 4, snapForgiveness: 1.1 },
```

Nobody chose that. The shapes chapter is five levels, the catalogue in
`src/scenes.ts` builds pictures of three, four, five and six parts, and the
table's own tests insist a polygon level's size is one the catalogue can build
and that a chapter never gets smaller as it goes. Five levels over four sizes
has to repeat one, and the repeat landed in the middle.

It was not quite as bad as it looked, because a polygon level picked its picture
at deal time from the ones of the right size, so 17 and 18 were usually a rocket
and a car rather than the same picture twice. Usually. There were three
four-part pictures and no memory between levels, so one play in three showed the
same picture twice in a row with nothing added - which is the one case a
two-year-old would actually notice, and the case nobody could see coming by
reading the table.

The first fix considered was to give the host one level of memory, so a picture
was never dealt twice running. It works, and it is wrong: it leaves *is this
level different from the last one* to a coin toss at runtime, in a file that
exists precisely so that the difficulty ramp can be read off the page.

## Decision

**A level is its kind, its subject and its size, and no two levels are all
three.** The subject is whatever the row names - the theme for an animal level,
the scene for a jigsaw or a shatter, and now the shape picture for a polygon
level. `tests/levels.test.ts` builds that triple for all thirty rows and fails on
a duplicate, naming both levels.

So the polygon chapter names its pictures the way the jigsaw chapter always has.
Levels 13-18 stand the house, the boat, the car, the butterfly, the train and the
sunflower; `polygon.deal` looks the name up instead of drawing one, and
throws if a row names nothing, names a picture the catalogue does not hold, or
names
one whose part count disagrees with the row's `pieces`.

The key in `options` is `shapePicture` rather than `scene`, because they are two
different catalogues: `scene` is a hand-drawn `.svg` from `src/pictures.ts` that
gets cut into pieces, and `scripts/pictures.mjs` reads the table for exactly
that word to know what to rasterise and measure. One key for both id spaces
would have made the art check start reporting a missing file called "house".

A picture may still come back at another size - `farmyard` is a 2x2 at level 21
and a 3x3 at level 29 - because a picture cut four ways and the same picture cut
nine ways are two different things for a child to solve. What the rule forbids
is the same picture at the same size twice, which is the same level twice.

## Consequence

The chapter's sizes read 3, 3, 4, 5, 6, 6. It never gets smaller, opens with two
gentle three-part pictures, and closes with two different six-part pictures.

The catalogue is longer than the chapter: `rocket`, `fish` and `flower` are in
`SCENES` and in no level. They are kept on purpose, as spares -
retuning the chapter is then a table edit rather than an afternoon's drawing -
and the geometry half of `tests/polygon.test.ts` holds them to every rule the
six in play are held to, so one can be dropped into the table without a second
thought. A comment in `scenes.ts` says so, because unreachable data with no
explanation is exactly what a later reader deletes.

Two smaller things fell out of writing the rule down. `night-sky` had been drawn
and registered but no level used it, so level 23 stands it instead of a second
helping of the farmyard. And the boat has no two parts alike, so the chapter now
has one level where the swap the chapter is built on ([Two shapes the same are
the same piece](<Two shapes the same are the same piece.md>)) never comes up;
the test that used to require an interchangeable pair at every polygon level now
allows exactly one level without one, and no more.

Naming every level costs a little variety: the shapes chapter is the same six
pictures every time. That is the right trade. Which animals turn up, and the
order every kind of piece waits in, are still dealt fresh every time - the
freshness that does the work. Being *sure* that one level is not the one before
it is worth more than being usually surprised by which picture turns up.
