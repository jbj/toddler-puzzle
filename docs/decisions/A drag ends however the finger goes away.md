# A drag ends however the finger goes away

A touch release is not guaranteed to return to the element that started a drag.
The finger may leave the play surface, the system may take over an edge or
multi-touch gesture, pointer capture may be lost, or the page may be hidden.
Waiting for one matching release can leave the game permanently holding a piece.

**Every path by which a finger disappears ends the drag.** Release and
cancellation are heard at the window boundary; lost capture and page lifecycle
changes also settle what was held.

**The newest valid press wins.** A press on a pickupable piece settles any
existing drag through the ordinary drop rule and picks up the new piece. The
engine never refuses a real press because stale state claims another finger is
still down.

**An extra touch cannot start a native gesture over a held piece.** The play
surface prevents the browser from taking over while a drag is active.

The drag rule is separated from DOM wiring so interrupted, multi-finger, and
missing-event sequences can be tested directly. Whatever the interruption, the
next valid press must work without adult recovery.
