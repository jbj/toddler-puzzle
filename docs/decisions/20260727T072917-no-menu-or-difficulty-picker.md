# 20260727T072917. Keep the game moving forward

## Context

A two-year-old cannot read a menu, compare difficulty choices, or recover from a
configuration screen. A grown-up should also be able to hand over the toy without
setting it up.

The game already has a natural progression: two animals, then three, then four,
then five, then six. That gives a quick first win and lets the board fill up as
the child keeps playing.

## Decision

There is no menu and no difficulty picker. The stages are always played in the
same order, and the last stage loops back to the first.

## Consequence

The only way through the game is forward. The five dots are an indicator for a
grown-up, not a control, and new features should not add settings, scores, or a
failure state.

## Amended

This is still true of the child's game, and the play surface has not changed.
But the grown-up now has a door: a labelled button that has to be held for two
seconds opens a panel with a level map, the switches and the only reset in the
game. It is aimed squarely at the reader this decision was not about. See
[20260729T000652](20260729T000652-a-door-for-grown-ups.md).
