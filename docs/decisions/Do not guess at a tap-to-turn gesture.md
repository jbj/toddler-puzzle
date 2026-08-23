# Do not guess at a tap-to-turn gesture

A tap-to-turn gesture - a tap that rotates a piece a quarter turn, a drag
that carries it - is not added to the drag engine without real evidence of
how a two-year-old's finger behaves.

Telling a tap from a drag needs a press to *wait*, deciding within a
movement threshold and a time window whether the finger meant to tap or to
carry. Both numbers can only be guessed without a real child's finger
measured on a real device, and guessing wrong is bad in a way the rest of
the game is careful never to be: a piece that spins when the child meant
to carry it, or one that refuses to turn when they meant to turn it.

That ambiguity is not a cost paid only by whoever wants the gesture. Every
drag in the game shares one gesture path, so a wait-and-see branch added to
tell a tap from a drag sits in front of every piece a child ever picks up,
whether or not turning is what they are doing.

A turnable piece is also not coherent for every kind. A shape that is
*invariant* under rotation - or any piece a scene already treats as
interchangeable with a congruent twin - has no well-defined "right" angle
to turn to, so a piece could look exactly right and still be refused,
which is the one thing a two-year-old must never meet. A piece drawn
inside a shared box and packed into a tray cell cut to its ink also cannot
turn without its footprint changing and its grab area reaching into its
neighbour's, against [Grab a piece anywhere in the box around its
artwork](<Grab a piece anywhere in the box around its artwork.md>).

The tie-breaker in [`product.md`](../product.md) settles the open question:
when a question is open, choose whatever is more forgiving. A press that
sometimes turns a piece the child was trying to move is not the forgiving
option.
