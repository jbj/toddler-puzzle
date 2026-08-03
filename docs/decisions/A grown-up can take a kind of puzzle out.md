# A grown-up can take a kind of puzzle out

## Context

The thirty levels are one ramp, played in one order, and every child gets all of
it. That is the right default and it is what
[Keep the game moving forward](<Keep the game moving forward.md>)
protects: no menu, no difficulty picker, no way for a two-year-old to end up
somewhere they did not mean to be.

But the ramp spans about a year of development. The first chapter is for a child
who cannot yet pinch, carry and let go; the last is a twelve-piece jigsaw. Any
particular child is somewhere in the middle of that, and the parts they are not
ready for are not a gentle stretch - a one-year-old handed a nine-piece jigsaw
does not learn anything from it, they stop playing. The grown-up panel already
lets a parent move the child along the map, level by level, but that is a
position rather than a shape: it cannot say "she loves the animals, the jigsaws
are a year away", which is the sentence parents actually have.

## Decision

The panel carries one switch per `PuzzleKindId`, under "Kinds of puzzle". A kind
switched off is stepped over wherever it appears in the thirty, and the game
goes on running forward through what is left.

**Per kind, not per chapter.** The level map is drawn as six chapter rows and a
switch on each row would have been the obvious thing to build. It would also
have been a lie: levels 2 and 4 are shape-match inside "First touches", and the
mastery chapter mixes three kinds. What a parent is answering is "can she do
jigsaws yet", and that is a kind. `PUZZLE_KINDS` in `src/levels.ts` is the list,
`PuzzleKindId` is derived from it, and the panel walks it - so a seventh kind
gets a switch without anybody remembering to add one.

**The table is never edited.** `LEVELS` stands exactly as it is and the setting
is a filter over it: `playableLevels` and the handful of functions beside it -
`nextLevel`, `endsChapter`, `playableFrom`, `isLastPlayable` - all take the same
optional `EnabledKinds` and treat an absent one as "all of them". Nothing that
does not care about the setting has to know it exists, and the difficulty ramp
stays the one declarative thing [Put the whole difficulty ramp in one
table](<Put the whole difficulty ramp in one table.md>) says it is.

**The child's game is unchanged.** Nothing new appears on the play surface,
there is still exactly one button at the end of a level, and it still only goes
forward. The switches are behind the two-second hold with everything else a
grown-up can change ([Put the settings behind a two-second
hold](<Put the settings behind a two-second hold.md>)), which is why this is not
the difficulty picker the earlier decision rules out: a two-year-old cannot
reach it, cannot read it, and never sees that it happened.

**The last kind on cannot be turned off.** A game with no levels in it is not
something anybody chose, so `toggleKind` refuses and the panel draws the lone
survivor as held on rather than swallowing the press. `readSettings` answers the
same question a second time for a record that came from storage rather than from
the panel: every kind off reads as every kind on.

**A chapter still ends.** `endsChapter` asks what the next level *in play* is
rather than counting to five, so a child who never meets a `play` level still
gets the party at the end of chapter one - on level 4, where the chapter now
ends for them. The same reading moves the finale: the end of the game is the end
of what is being played, which is what `isLastPlayable` is for.

## Consequence

`Settings` gains `kinds`. `STORAGE_VERSION` is **not** bumped, for the reason it
was not bumped when `rotation` was dropped ([Rotation mode is not built, and the
switch is gone](<Rotation mode is not built, and the switch is gone.md>)): every
field is read on its own, and a record written before the switches existed has
no `kinds` and reads as the whole ramp - the game it was written by.

The moment a kind is switched off is almost always the moment the child is stuck
on one of its levels, so switching one off moves them on if they are standing on
it. It goes through `chooseLevel`, so it counts as somewhere a grown-up put them
rather than somewhere they reached, and the panel stays open: this is a setting
being made, not a level being picked.

The level map keeps all thirty squares and fades the ones being skipped. Twenty
of them are the same fact; twenty-two squares would have hidden what the switch
did. They stay pressable, so a parent can look at a jigsaw without turning
jigsaws back on first.

`warm.ts` still fetches every kind. A switch can be moved back at any moment,
and a chunk nobody needed cost a few milliseconds during play; a chunk that was
skipped and is suddenly wanted would cost a child the level seam this project
spent a decision avoiding ([A chapter is warmed before it is needed, not fetched
when it
is](<A chapter is warmed before it is needed, not fetched when it is.md>)).

`?level=` ignores the setting. It names a level and has to reach it; it is a
tool for whoever is working on the game, and the resume path is where the
setting is honoured instead.
