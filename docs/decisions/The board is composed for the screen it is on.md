# The board is composed for the screen it is on

## Context

The game had two canvases: `1000x700` for a screen wider than it is tall and
`700x1180` for one taller than it is wide. `chooseLayout` asked only whether the
viewport was taller than it was wide, composed the level on whichever of the two
that named, and the SVG letterboxed the result into the window with
`preserveAspectRatio="xMidYMid meet"` - so a screen's ratio chose between two
canvases and had no say in the shape of either.

Every screen whose ratio was not exactly 10:7 or 7:11.8 therefore played inside
a border. An iPad in portrait is nearer 3:4 than 7:11.8, so it pillarboxed about
a fifth of itself away. A 16:9 laptop letterboxed about the same. The tray sat
at the edge of the *canvas*, which was somewhere inside the screen rather than
at the edge of it, and the meadow stopped at a hard line with the page's
background either side of it. On the device this game is for, a fifth of the
screen was bars.

Two canvases were the right first answer - a landscape board letterboxed onto an
upright phone leaves the pieces too small to grab, so reflowing by orientation
was never optional. What was not deliberate was stopping at two.

## Decision

**One continuous family of canvases, and the two we had are already in it.** The
landscape canvas is 700 tall; the portrait canvas is 700 wide. Both hold the
canvas's *shorter* side at 700 logical units and spend the long side on whatever
room the screen has, so the rule is

    short side = 700, long side = 700 * (long screen side / short screen side)

which reproduces `1000x700` at 10:7 and `700x1180` at 7:11.8 exactly and gives
every other ratio a canvas of its own. `viewFor(container)` in `src/layout.ts`
composes it; `REFERENCE_VIEWS` keeps the two anchors, because the test suite and
the measured floor tables are written against them.

The scale from logical units to device pixels is then `device short side / 700`
at every ratio, so a piece is the same physical size however the screen is
shaped - which is what "keep every target large" was always about. Nothing is
cropped and nothing is stretched: the backdrop is generated from the layout
(`src/scenery.ts`), so a wider board simply grows more meadow, and a picture
board is flat colour behind a fitted picture.

**No clamp.** Every ratio fills the screen. A 3:1 screen gets a 2100x700 board
rather than a 10:7 one in the middle of a lot of bar.

**A size measured across the board is measured against a nominal width.** A
dozen constants were written as a fraction of `canvas.width` - `minSlot`,
`minPieceInk`, a balloon's radius, a parade animal's. On a 3:1 board
`canvas.width` is 2100 and every one of them would treble: the piece floors
would start refusing levels that compose perfectly well - and a refusal is a
child looking at a level that will not open - while a parade animal would be
taller than the board it walks across. So those constants are measured against

    spanWidth(canvas) = min(canvas.width, canvas.height * 10/7)

the width, but never more than a landscape-shaped board of this height would
have had. It is `1000` on the landscape canvas and `700` on the portrait one, so
every one of those constants keeps its exact value on both of the old boards.
Positions *across* the board - where a balloon is released, how a parade is
spaced, the cloud lanes - go on using the real width, because a spread is not a
size.

**The board is composed for `#app`'s content box, not the window.** The two
differ by the safe-area insets, and a board composed for the window would
letterbox itself inside the very margin the inset bought - on exactly the
devices this is for.

**A rebuild waits for an empty hand.** Any change of canvas now rebuilds the
board, where before only a change of *orientation* did. A phone collapsing its
address bar mid-drag would have dropped the animal a child was carrying, so
`game.ts` remembers the held piece and defers the rebuild until it is let go.

## Consequence

Every screen is filled. The iPad suite in `tests/puzzle.test.ts` used to measure
the waste - its floors ran from 0.61 to 0.99 of the screen covered - and now
asserts 0.998 on ten devices from Slide Over to a 13" iPad, with the rest being
the half unit the canvas's long side is rounded to. The screenshot run says the
same thing at full size, and has two shots that are not devices at all: a 3:1
screen and a 1:2.3 one, because nothing special-cases an extreme ratio and a
look is how anyone finds out what one is like.

A piece is bigger on most screens and never dramatically smaller on any. The
sweep in `on a screen of any shape` measures it: every level, several deals, every
ratio from 1:3 to 3:1, against what the two fixed canvases would have drawn on
that same screen in device pixels. Past 16:9 in either direction the sizes are
identical to the old ones. Near square they can be up to 7% smaller, for two
reasons worth knowing:

- Between 1:1 and 4:3 wide, a picture level's tray stops clearing `gutterGain`
  and moves from the gutters to a band across the top. That is a step, and the
  letterboxed board happened to be on the lucky side of it.
- Between 1:1.33 and 1:1.6 tall, a two-row board on a squarer canvas has less
  height per unit of width than the old 7:11.8 canvas did, and the extra scale
  does not quite pay for the row.

Both are bought with a quarter to a third more screen covered, a tray at the
edge of the device, and scenery to the corners. The floor is written down as
`KEPT_SIZE` and lowering it is a decision, not a tuning.

Thin ratios are not special-cased and never will be: the rule simply goes on
running, so a 1:4 screen gets a very long thin board with the same 700-unit short
side and the same size of piece. That is no worse than the old letterbox, which
is all that was asked of it.

To go back to two canvases, one of these would have to become true: a screen
shape where the composition cannot keep a piece grabbable (the sweep says there
is none between 1:3 and 3:1), or a rebuild on resize that costs the child
something the deferred relayout does not already cover.
