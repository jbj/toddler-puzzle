# A drag ends however the finger goes away

## Context

A one-year-old playing on an iPad could get the board into a state where the
piece under his hand was frozen and nothing else could be picked up. Only the
reset button brought the game back.

`drag.ts` held the whole drag in one variable. A press was refused while it was
set, and it was cleared in exactly one place: a `pointerup` or `pointercancel`
**on the stage element**, for the pointer id that had started the drag. There
was no timeout, no fallback and no "a new press means the old drag is over".

That is a correct engine for a drag that ends the way the specification says it
does. It is the wrong engine for a two-year-old's hands, because the release is
not guaranteed to arrive:

- **The lift lands somewhere the stage never hears.** After a capture is
  released implicitly, further events for that pointer are hit-tested again.
  `#stage` does not cover the page - `#app` carries the safe-area padding - so
  on an iPad there is a live strip at every edge outside the SVG. A finger
  lifted there targets something that does not bubble through the stage.
- **The touch is taken away by the system.** An edge swipe for the Dock or
  Control Centre, Slide Over, a multi-finger app switch, a palm landing: WebKit
  does not reliably deliver a release for a touch it has handed to the system,
  and a page backgrounded mid-drag may deliver nothing at all.
- **WebKit drops it.** With a capture set and several touches live, iOS Safari
  intermittently stops delivering pointer events for the captured pointer
  entirely - a long-standing bug ([WebKit 220539](https://bugs.webkit.org/show_bug.cgi?id=220539)
  and the reports of touch events stopping on 17.x).

And the game made that likelier than it needed to be: the second finger's press
returned early *before* `preventDefault`, so an extra touch on top of a captured
drag kept its default behaviour and was free to start a native gesture - which
is one of the things that provokes the drop in the first place.

Every one of those routes is a normal minute of play for a child who drags with
several fingers, presses while something else is down, and long-presses at
random. The result was a toy that had to be rescued by an adult who knew which
button to press.

## Decision

**The engine never waits for a release that may not come.** A drag is held, but
nothing is ever gated on one.

### The newest finger wins

A press on a piece that can be picked up drops whatever was held - where it
stands, settled by the ordinary rule - and picks the new piece up. Nothing asks
whether the previous pointer is still alive, because nothing needs the answer:
if it is, this is a child using two hands, and if it is not, this is the stuck
board healing itself. Either way the press is served, which is the only thing a
one-year-old can tell.

The one press that is *not* a takeover is a press on a piece that cannot be
picked up, such as one already home. A stray palm on a finished animal must not
knock the piece the child is carrying out of the air, so that case is asked
before anything is dropped.

### Every way a finger can go away ends the drag

- `pointerup` and `pointercancel` on the **window**, in the capture phase, so a
  lift anywhere on the page is heard - including on the safe-area strip.
- `lostpointercapture`, so a capture taken back is a drop rather than a piece
  being dragged blind by events that are now going somewhere else.
- `visibilitychange` to hidden, and `pagehide`, so an app switched away from
  mid-drag comes back to a live board. This is the same signal `rest.ts` freezes
  on, and the two agree: sleeping changes nothing, and this settles the piece by
  the same rule any other drop is settled by.

`pointermove` moved to the window for the same reason: a move after the capture
has quietly gone would otherwise never reach the stage, and the piece would
stop following the finger while still being held.

### A press while a piece is held is always prevented

Whether or not it turns out to be a piece, so an extra touch cannot start a
native gesture over a drag. `setPointerCapture` is wrapped in `try`/`catch`, as
the grown-ups button already was: a browser that refuses to capture still
drags, because the move and the release are heard on the window either way.

### The rule is separated from the wiring

`createDragging` is pure - pieces, points and boxes, no DOM - in the spirit of
`createIdleHint` and `createRest`. That is what makes the sequences above
testable at all: none of them can be produced by dragging correctly, and none of
them would ever be caught by a screenshot run that drags the way an adult does.

`enableDragging` now returns its teardown, because its listeners live on the
window and would otherwise outlive every stage the game mounts. `game.ts` takes
it down with the board, alongside the activity, the hint and the celebration.

## Consequences

A drag that is interrupted is settled rather than abandoned: if the piece was
over its hole when the app was switched away, it lands there. That follows from
the forgiveness rule rather than arguing with it - the drop point is the last
place the finger was, and the kind decides as it always does.

Two hands on the board is now a defined thing rather than an accident: the
second piece is picked up and the first goes back to the tray with the usual
soft tone. A child cannot get a state out of it that an adult has to undo.

`tests/drag.test.ts` covers the rule and the wiring: a release that lands off
the stage, a capture snatched away, a release that never comes at all, a second
finger mid-drag, a hidden page, a browser that will not capture, and a board
replaced mid-drag. Each one ends by asking the only question that matters - is
the next press accepted?
