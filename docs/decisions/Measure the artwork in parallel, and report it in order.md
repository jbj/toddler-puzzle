# Measure the artwork in parallel, and report it in order

The art check spends most of its time waiting for independent external
rasterizer processes. Animals, scenes, recipes, and silhouette comparisons do
not need one another's results, so running them serially wastes the resource
budget assigned to the check.

The check uses a worker pool bounded by the CPU share supplied by the verify
scheduler. Each rasterizer process is restricted to one thread so a worker slot
cannot multiply into unaccounted work. As with every parallel check, the child
may divide its assigned capacity and may never raise it.

Workers do not print. Each records its observations, and the parent replays the
records in canonical file order after all work finishes. Stable ordering keeps
passing and failing output readable and comparable regardless of which process
finishes first, while a worker error still stops the check with one clear
failure.
