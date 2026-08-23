# Artwork

The repository contains two authored art forms:

- **animals**, whose silhouette is both a draggable piece and its matching hole;
- **picture scenes**, which are cut into pieces and rebuilt as one picture.

`npm run art:check` enforces legality. It cannot decide whether the drawing is
good.

## Visual review is required

Whenever an authored coordinate changes:

1. Render the affected animal or scene with the existing art command.
2. Open the large render and inspect it at play size.
3. For an animal, inspect both the colored drawing and bare silhouette, then
   compare it with the rest of its theme.
4. For a picture scene, inspect the whole picture and every rendered cut.
5. Repeat until the drawing, silhouette, margins, and pieces all read clearly.

Do not add or alter artwork when you cannot view the render. Passing the art
check proves the file is legal, not that a toddler can recognize it.

Look deliberately for:

- a pose that mixes viewpoints;
- detail that nearly meets an outline instead of sharing its coordinates;
- accidental uneven margins;
- a silhouette distinguishable only by color or fine detail;
- a scene piece containing only featureless background.

## Animal contract

Use an existing animal SVG as the structural template. The checked contract has
one closed outer `<path id="silhouette">` and a `<g id="detail">` containing the
interior artwork.

- **One path is drawn twice.** The silhouette cuts the hole and outlines the
  piece. Never draw them separately.
- **Detail stays inside the silhouette** unless an intentional element is tagged
  with `data-overhang`. The checker owns the permitted budget.
- **The silhouette must read at a glance.** Animals that can be dealt together
  must remain distinct after the checker removes detail and reduces them to play
  scale. Fix the mass, pose, scale, or theme when they collide; do not weaken the
  measure.
- **Measured geometry is generated evidence.** The authored foot anchor and ink
  bounds in `src/assets.ts` come from the art check, never from visual estimates.
- **Every supported cut must remain viable.** Slice recipes are generated and
  rechecked for connected, balanced, grabbable pieces. Do not hand-edit a recipe
  to pass.

See [Budget overhang instead of banning it](<decisions/Budget overhang instead of banning it.md>),
[Check silhouettes for distinctness at a glance](<decisions/Check silhouettes for distinctness at a glance.md>),
and [Slices are clipped, not cut](<decisions/Slices are clipped, not cut.md>).

### Adding or redrawing an animal

1. Choose the theme and pose after reviewing the silhouettes already eligible
   for that cast.
2. Create or edit `src/assets/animals/<name>.svg` using an existing legal animal
   as the markup template.
3. Render the animal large and inspect both color and silhouette.
4. Render the animal contact sheet and compare it with its peers.
5. Register the animal in the canonical asset and theme registries in
   `src/assets.ts`.
6. Run the art check and copy its reported foot anchor and ink bounds into the
   measured tables in `src/assets.ts`.
7. Regenerate `src/slice-recipes.json` with the slice-recipe command.
8. Run the art check again and inspect representative whole and sliced gameplay.
9. Commit the SVG, measured metadata, and regenerated recipes together.

The check reports missing registration, stale measurements, invalid overhang,
silhouette collisions, and failed cuts. Follow those failures rather than
maintaining their current inventory here.

## Picture-scene contract

Picture scenes live under `src/assets/scenes/` and are loaded through
`src/pictures.ts`. Use an existing scene as the structural template.

- Wrap everything drawn in one `<g id="scene">`.
- Keep the scene self-contained and safe to inline repeatedly: no nested ids,
  outward references, scripts, embedded images, text, filters, masks, or other
  document-global machinery.
- Paint the whole authored box opaquely.
- Use broad, flat shapes that survive at piece size.
- Put a recognizable feature in every region that any supported cut can produce.

The source of truth for the authored box and supported cuts is the picture
loader and level table. `npm run art:check` reads both; do not copy their current
values into this guide.

### Every piece needs something to hold visually

A valid opaque scene can still make a bad puzzle when one piece contains only
sky, water, or field. The art check judges each supported cut at reduced render
size and rejects a region without enough contrast from its own dominant color.

Fix the picture, not the threshold. Add a broad cloud, plant, stone, building,
or other readable feature. Fine texture and gradients do not turn an empty
piece into an understandable one. See
[Insist that every piece of a picture has something in it](<decisions/Insist that every piece of a picture has something in it.md>).

### Adding or redrawing a picture scene

1. Review the cuts currently supported by the level table and plan a broad
   feature for every region they can produce.
2. Create or edit `src/assets/scenes/<id>.svg` using an existing legal scene as
   the markup template.
3. Register the scene through `src/pictures.ts` with a grown-up-readable label.
4. Render the large scene and every gridded preview; inspect the whole and each
   piece.
5. Render the scene contact sheet and compare composition and palette.
6. Run the art check and repair the picture wherever it reports a featureless
   region or invalid markup.
7. Inspect representative gameplay before committing the scene and registration
   together.

## Before calling artwork finished

- Run the art check.
- Open current renders made from the branch as it stands.
- Inspect the large art, bare silhouettes, and every relevant cut.
- State in the pull request what was viewed.

The tools and current output paths are owned by the art scripts. If a required
external renderer is unavailable, stop and surface that environment failure
rather than approving unseen art.
