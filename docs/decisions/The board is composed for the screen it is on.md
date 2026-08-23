# The board is composed for the screen it is on

The board is one continuous family of canvases, not a fixed pair selected by
orientation. `viewFor` in `src/layout.ts` holds the shorter side at the
canonical logical span and gives the longer side whatever room the device
aspect ratio requires.

This keeps physical scale stable while filling the screen. Letterboxing or
choosing the nearest reference canvas would spend usable device space on bars
and make pieces smaller on the devices furthest from those reference shapes.
There is no aspect-ratio clamp: the same composition rules must either produce
a legal board or refuse it honestly.

**Sizes use a nominal board span; positions use the real board.** A constant
describing piece, effect, or minimum size must not grow without bound on an
extremely wide screen. `spanWidth` owns the nominal measurement. Positions that
should spread across the device - release points, lanes, and spacing - continue
to use the actual width.

**Compose for the app's content box.** Safe-area insets are outside the board;
using the window would letterbox the canvas inside the margin those insets
already reserve.

**A rebuild waits for an empty hand.** Viewport changes recompose the board but
must not replace the element a child is carrying. The game defers the rebuild
until the drag settles, preserving progress throughout.

The current logical span, nominal-width formula, reference views, and measured
floors live in `src/layout.ts` and the layout tests. They are not repeated here.
