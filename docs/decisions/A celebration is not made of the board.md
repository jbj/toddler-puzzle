# A celebration is not made of the board

## Context

The fifth level of every chapter finishes into a celebration, and the finished
puzzle stays on the screen underneath it - deliberately, because the child has
just built it and wants to look at it. Five of the six celebrations were
untroubled by that. The sixth was the parade.

The parade walked the animals the child had just matched across the board those
same animals were still sitting in. Two sets of the same animals, one still and
one moving, on one screen. Motion sells it in a browser: the walking ones are
obviously the live ones. A still frame does not, and a two-year-old's first
glance is a still frame. In portrait, where the board is tall and the pieces are
close together, an elephant walked over an elephant. See
[issue #65](https://github.com/jbj/toddler-puzzle/issues/65).

The three obvious fixes all changed what the *board* does while the parade is
on: fade the finished puzzle, clear it away, or confine the parade to whatever
band of the board happens to be empty. The first two take away the thing the
child just built, at the moment they are proudest of it. The third needs a
different empty band in every layout and is a rule the other five celebrations
would not share.

None of them addresses what is actually wrong, which is not the parade and not
the board but the pairing: this was the one celebration made of the board's own
subject matter, and it was hung on the one chapter that guaranteed a collision.

## Decision

**A celebration is never made of what the finished board is made of.**

Two changes carry it.

### The parade ends the chapter of shapes

`CHAPTER_CELEBRATIONS` in `src/celebration.ts` maps a chapter to a celebration, and two
entries swapped: the chapter of animals now ends with the rainbow, and the
chapter of coloured shapes ends with the parade.

Chapter 4 finishes on level 20, a sunflower built out of six plain shapes. There
is not an animal on the board, so every animal on the screen is a walking one.
Chapter 2 finishes on level 10, six sea animals in their holes, and gets arcs of
colour painted a tap at a time: nobody can mistake a rainbow for a sixth animal.

Nothing else about either celebration changed - both keep their sound, their
reduced-motion behaviour and their half-minute of arrivals - and the ramp is
still five different moments and an ending. The rainbow is arguably a better
second than fourth anyway: chapter 1 ends with balloons, where a finger bursts a
thing, and a finger that *builds* a thing is one step on from that.

### The parade deals from the animals the board is not holding

Being hung on the right chapter is not the same as being unable to collide. So
the parade no longer takes the pieces just placed as its cast. `paradeCast`
shuffles the game's whole roster with the level's own `random`, drops anything
whose id is on the board, and walks five of the rest. The finale, which has
always dealt this way, now goes through the same function.

That makes the duplication impossible rather than merely unlikely - and it means
a future retune that moves a chapter's kinds around cannot quietly recreate the
problem, because the exclusion travels with the celebration rather than with the
chapter it happens to be hung on.

What it gives up is the connection: the parade is no longer *your* animals. That
connection is exactly what put two copies of the same animal on one screen, and
it was never legible to the player anyway. A two-year-old at the end of a
chapter is not checking a cast list; what they see is animals walking, and they
poke them.

## Consequences

- The rule is written into `.github/instructions/navigation.instructions.md`
  under "The end of a level", where it is the first thing to check before
  hanging a new celebration on a chapter - and the reason every interlude is
  made of paper and air rather than of animals.
- `tests/celebration.test.ts` fails if a chapter whose last level deals animals
  - the `play`, `shape-match` and `sliced` kinds - ends with a parade or with
  the finale. Moving the parade back to chapter 2 is a red test rather than a
  disappointing screen.
- `npm run shot` checks the pairing from the other end: at level 10 the
  celebration adds no animals to the board at all, and at level 20 no parading
  animal is a piece the board is already holding. The parade is shot in both
  orientations - `22b-chapter4-parade` and `22c-chapter4-parade-portrait` -
  because portrait is where the old one failed.
- The chapter-2 shot is now `13b-chapter2-rainbow`. The frame it replaces,
  `13b-chapter2-parade`, is the one to compare against if this is ever revisited.
- The two `when` sentences in `src/audio.ts` moved chapter. The phrases did not:
  a fanfare belongs to its celebration, not to a chapter number.
