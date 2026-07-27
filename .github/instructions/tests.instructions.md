---
applyTo: "tests/**"
---

# Test rules

The deal is random: tests must not assume one fixed cast, one fixed order, or one
animal always occupying a particular hole.

When testing layout behavior, rotate the animal list so every animal appears in
every place that matters. This catches foot-level and size problems that one seed
can hide.

Prefer asserting the invariant over snapshotting one deal. Good tests say things
like holes stay on canvas, snap zones do not overlap, tray slots do not collide,
and wrong drops return to the tray.

Use `?seed=` when an end-to-end or browser run needs to reproduce a specific
deal. A seed is a reproduction tool, not a reason to make tests depend on only
one cast.
