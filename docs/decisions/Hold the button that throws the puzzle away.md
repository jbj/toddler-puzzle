# Hold the button that throws the puzzle away

Re-dealing the current puzzle discards child progress with no meaningful undo.
The control is useful to a grown-up, but it sits on the play surface where an
ordinary toddler tap must not activate it.

**Reset uses the same deliberate hold gate as the grown-up panel.** "Held"
must not mean two different things across the game, and repeated taps never
accumulate into a successful hold. See
[Put the settings behind a deliberate hold](<Put the settings behind a deliberate hold.md>).

**Feedback needs no text.** A filling ring shows a grown-up that the hold is
working. The reset control does not add a written prompt to the child's surface.

Leaving the control's bounds abandons the hold immediately. Rebuilding a board
also tears down its watcher, so a discarded control cannot keep timers or
listeners alive.
