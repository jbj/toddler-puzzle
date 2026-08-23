# Cutting a drawing up

Several puzzle kinds hand the child one drawing in multiple pieces. Their shared
contract is simple: **cut by clipping the original drawing, never by redrawing
each piece**.

The puzzle-kind contract is in [`puzzle-kinds.md`](puzzle-kinds.md); authored
art is in [`art.md`](art.md).

## Shared rules

- **One drawing serves every piece.** A piece is original markup inside a clip
  path. Neighboring pieces cannot disagree about color or detail along a cut.
- **Each internal cut is minted once.** Both neighbors receive the same edge in
  opposite directions, so they mesh by construction. See
  [Every cut is made once](<decisions/Every cut is made once.md>).
- **A loose piece owns its cut edge.** The guide line helps while the piece is in
  the tray or under a finger, then fades when the piece settles.
- **A finished drawing has no seams.** The final clips overlap enough to cover
  anti-aliased boundaries, but only after the relevant pieces are home. See
  [A placed piece has no edge](<decisions/A placed piece has no edge.md>).
- **The guide is the same geometry as the pieces.** Never maintain a separate
  approximation of where a cut lies.

Shared cut-edge and picture-piece behavior belongs in the common cutter modules,
not in individual kinds.

## Sliced animals

A sliced animal keeps the original animal box, anchor, outline, and scale for
every piece. Each slice clips the artwork and aims at its own position inside
the animal's one silhouette-shaped hole.

Cut placement is measured offline and committed as generated recipes. The
generator searches for connected, balanced, grabbable slices; the art check
re-judges every committed recipe. Regenerate after changing an animal and never
hand-edit the output. See
[Slices are clipped, not cut](<decisions/Slices are clipped, not cut.md>).

## Jigsaws

A jigsaw cuts one authored scene on a grid described by the level table.

- Internal edges are generated once and shared by their neighbors.
- The dimmed whole picture remains under the frame as a placement guide.
- The whole picture is one target even though several pieces rebuild it.
- Tab geometry scales with its cell so a busier cut does not make pieces harder
  to pack or grasp.
- The cutter constrains tab assignment to keep pieces readable and the tray
  viable.

The current grid contract and geometric checks live in the level table, cutter,
and tests. Adding a cut is a level-table change followed by the art and puzzle
checks, not a prose update.

## Shattered pictures

A shattered picture is divided into irregular convex shards that are visibly
different enough to match by outline.

- Use recursive half-plane splits so convexity follows from construction.
- Plan with search and backtracking; a greedy cut can leave an impossible final
  region.
- Enforce size, thickness, spread, and distinctness on intermediate regions as
  well as final shards.
- Choose among passing candidates without preferring the roomiest one, which
  would make results drift toward a regular grid.
- Keep shared edge creation and guide rendering in the common picture cutter.

The cutter and tests own current floors and supported piece counts. See
[Cut a picture into shards that are things to hold](<decisions/Cut a picture into shards that are things to hold.md>).
