# Product decisions

Animal Puzzle is a drag-and-drop shape puzzle for a two-year-old. It begins
with the easiest useful action, grows gradually, and deals every puzzle fresh.

## Tie-breaker

When a design question is genuinely open, choose the option that is more
forgiving and needs less understanding from a child who cannot read.

## Drawing and fit

- **A piece and its hole come from one silhouette.** Never maintain separate
  drawings that can drift apart.
- **Artwork must still look as if it fits its hole.** Keep detail inside the
  silhouette unless the art contract explicitly allows and checks an overhang.
- **A background never contains an animal.** An animal painted beside its hole
  looks like the answer is already on the board. See
  [A background belongs to the theme](<decisions/A background belongs to the theme.md>).
- **Every piece stays recognizable at play size.** Silhouettes must be distinct
  within any cast the game can deal together. The art check owns the measure;
  [`art.md`](art.md) owns the authoring contract.

## Forgiveness

- **A piece snaps only into a place that truly accepts it.** A refused drop
  returns gently to the tray with warm feedback, never a punishment.
- **Every kind shares one placement rule.** The measured piece box governs
  grabbing, clamping, tray packing, and drop forgiveness. A kind names valid
  places but cannot invent stricter geometry. See
  [One box measures a piece, and one rule places it](<decisions/One box measures a piece, and one rule places it.md>).
- **Every target remains large enough for a young child.** The layout's checked
  floors are the source of truth; do not trade them away for a busier board.
- **Help is quiet and truthful.** An idle hint points at both the piece and every
  place that would accept it. It never nags, sounds punitive, resembles a filled
  target, or interrupts a celebration. See
  [A hint points at both ends](<decisions/A hint points at both ends.md>).

## The shape of the game

- **The child's game moves forward.** There is no menu, difficulty picker,
  settings, failure state, or score on the play surface. Development URL
  controls are not player controls. See
  [Keep the game moving forward](<decisions/Keep the game moving forward.md>).
- **The opening asks for the easiest drag the game supports.** The first success
  should arrive before the child needs to infer a system.
- **Every completed puzzle earns a playable celebration.** Larger progression
  boundaries earn a larger one. A celebration responds immediately, never
  advances the game by itself, and exposes the way onward after the deliberate
  pause owned by the celebration code.
- **Grown-up controls are visible but guarded by a hold.** They stay outside the
  play surface and never rely on a secret gesture.
- **A grown-up may filter puzzle kinds without rewriting the ramp.** The filter
  cannot leave the child with nothing to play.
- **Progress persistence is a convenience, not a dependency.** Any storage
  failure falls back to a playable start without surfacing an error.

## The whole device

- **An unattended game freezes rather than changes.** Nothing advances,
  disappears, or finishes while nobody is present; the waking interaction still
  plays.
- **The board uses the screen it has.** It composes for the current viewport
  without letterboxing or special-casing a small set of device shapes.
- **The project stays self-contained.** No binary assets, runtime dependencies,
  or network requests. Artwork is authored as SVG and sound is synthesized. See
  [Keep assets and runtime simple](<decisions/Keep assets and runtime simple.md>).
- **Deferred code is warmed during play.** Reaching a progression boundary must
  not introduce an on-demand wait.

## Mechanics

| Concern | Read |
| --- | --- |
| Progression, celebrations, persistence, grown-up controls | [`navigation.md`](navigation.md) |
| Sound, hints, rest, dragging, feedback | [`feel.md`](feel.md) |
| Puzzle contracts and the difficulty table | [`puzzle-kinds.md`](puzzle-kinds.md) |
| Board, tray, piece boxes, backdrops | [`layout.md`](layout.md) |
| SVG authoring and visual review | [`art.md`](art.md) |
