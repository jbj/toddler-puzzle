/**
 * The polygon scenes, and the kind that plays them.
 *
 * Two halves, and they are different sorts of thing:
 *
 *  - the **scenes** are geometry, and what is checked is that a picture is a
 *    picture: no two parts of it overlap, nothing in it is too small to be
 *    worth grabbing, and - the one that matters most - two parts a child
 *    cannot tell apart are painted identically. A shadow has no colour, so two
 *    shadows of one shape must be fillable by either piece, and that is only
 *    true if the two pieces are the same piece;
 *  - the **kind** is rules, and what is checked is the promise the chapter is
 *    built on: a shape is accepted by *any* free shadow of its own shape, the
 *    picture rearranges itself around that choice, and a shadow already filled
 *    is never filled twice.
 *
 * Whether a scene actually looks like a house is not checked here. Only
 * `npm run shot` can see that, which is why the shot run plays a polygon level.
 */
import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/geometry";
import { polygon } from "../src/kinds/polygon";
import { boxOf, buildLevelLayout, holeOf, type Layout } from "../src/layout";
import { LEVELS, type LevelSpec } from "../src/levels";
import { assertUniquePieceIds, type PieceId } from "../src/piece";
import {
  SCENES,
  SCENE_BOX,
  boundsOf,
  cornersOf,
  sceneAnchor,
  sceneBounds,
  sceneById,
  sceneShapes,
  signatureOf,
  sizeOf,
  type Scene,
  type ScenePart,
} from "../src/scenes";
import type { Puzzle } from "../src/puzzle";

const POLYGON_LEVELS = LEVELS.filter((level) => level.kind === "polygon");

/** Is this point inside the part? Ray casting for a polygon, radius for a circle. */
function covers(part: ScenePart, x: number, y: number): boolean {
  const corners = cornersOf(part);
  if (corners === null) {
    const { width } = sizeOf(part.shape);
    const cx = part.at.x + width / 2;
    const cy = part.at.y + width / 2;
    return Math.hypot(x - cx, y - cy) < width / 2;
  }
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i]!;
    const b = corners[j]!;
    const crosses = a.y > y !== b.y > y;
    if (crosses && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The parts of a scene grouped by what shape they are. */
function bySignature(scene: Scene): Map<string, ScenePart[]> {
  const groups = new Map<string, ScenePart[]>();
  for (const part of scene.parts) {
    const key = signatureOf(part);
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  return groups;
}

/** Every pair of places in a scene that want the same shape. */
function twins(scene: Scene): { a: number; b: number }[] {
  const pairs: { a: number; b: number }[] = [];
  for (let a = 0; a < scene.parts.length; a++) {
    for (let b = a + 1; b < scene.parts.length; b++) {
      if (signatureOf(scene.parts[a]!) === signatureOf(scene.parts[b]!)) pairs.push({ a, b });
    }
  }
  return pairs;
}

describe("the scene catalogue", () => {
  it("builds a picture for every polygon level, and keeps spares besides", () => {
    // Six scenes was the ask. A level names the picture it stands, so the
    // catalogue being longer than the chapter is the point: the spares are what
    // a retune of the chapter is made of, and they are held to every rule
    // below so one can be dropped into the table without a second thought.
    expect(SCENES.length).toBeGreaterThanOrEqual(6);
    expect(SCENES.length).toBeGreaterThan(POLYGON_LEVELS.length);
  });

  it("gives every scene a name of its own and every part an id of its own", () => {
    expect(new Set(SCENES.map((scene) => scene.id)).size).toBe(SCENES.length);
    for (const scene of SCENES) {
      const { picture, parts } = sceneShapes(scene);
      assertUniquePieceIds([picture, ...parts], scene.id);
      expect(parts).toHaveLength(scene.parts.length);
    }
  });

  it("never lets two parts of a picture overlap", () => {
    // Sampled rather than reasoned about, because the parts are of five
    // different forms and a circle overlapping a triangle has no tidy formula.
    // Two pieces drawn on top of each other would fight over which is in front.
    for (const scene of SCENES) {
      let overlapping = 0;
      for (let x = 0.5; x < SCENE_BOX.width; x++) {
        for (let y = 0.5; y < SCENE_BOX.height; y++) {
          const covered = scene.parts.filter((part) => covers(part, x, y)).length;
          if (covered > 1) overlapping++;
        }
      }
      expect(overlapping, `${scene.id} overlaps itself`).toBe(0);
    }
  });

  it("keeps every part inside the scene box, and the picture filling it", () => {
    for (const scene of SCENES) {
      for (const part of scene.parts) {
        const box = boundsOf(part);
        expect(box.x, `${scene.id} ${part.name}`).toBeGreaterThanOrEqual(0);
        expect(box.y, `${scene.id} ${part.name}`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(SCENE_BOX.width);
        expect(box.y + box.height).toBeLessThanOrEqual(SCENE_BOX.height);
      }
      // A picture rattling around inside its box would be drawn smaller than
      // the slot it was given, since the slot is fitted to the box.
      const bounds = sceneBounds(scene);
      expect(Math.max(bounds.width, bounds.height), scene.id).toBeGreaterThan(
        0.9 * SCENE_BOX.width,
      );
      // And it stands on its own foot rather than on the bottom of the box.
      expect(sceneAnchor(scene).y).toBe(bounds.y + bounds.height);
    }
  });

  it("keeps the parts of a picture of a size with each other", () => {
    // The tray is packed by what each piece draws, so the smallest part of a
    // scene is what decides how big the whole picture may be: one window-sized
    // piece would shrink the house until nothing in it was worth grabbing. The
    // layout promises are what actually hold this; the floor is here so a new
    // scene fails on the part that is wrong rather than on a slot size.
    for (const scene of SCENES) {
      for (const part of scene.parts) {
        const box = boundsOf(part);
        const share = Math.max(box.width, box.height) / SCENE_BOX.width;
        expect(share, `${scene.id} ${part.name}`).toBeGreaterThan(0.28);
      }
    }
  });

  it("paints two parts of one shape identically", () => {
    // The rule the whole chapter turns on. A target is a shadow and a shadow
    // has no colour, so two shadows of one shape have to be fillable by either
    // piece - and that is only true if the two pieces are the same piece. A
    // scene painting one wall yellow and the other blue would either refuse a
    // visibly right drop or change the picture when it took it.
    for (const scene of SCENES) {
      for (const [signature, parts] of bySignature(scene)) {
        for (const part of parts) {
          expect(part.fill, `${scene.id} ${signature}`).toBe(parts[0]!.fill);
          expect(part.detail ?? "", `${scene.id} ${signature}`).toBe(parts[0]!.detail ?? "");
          expect(part.name).toBe(parts[0]!.name);
        }
      }
    }
  });

  it("has something interchangeable at all but one polygon level", () => {
    // Not every picture - a boat has one hull and two different sails - but a
    // chapter built on the swap cannot be five pictures that never show it.
    // One level may stand a picture without a twin in it, which is how the
    // chapter is allowed to open on something very plain; no more than one.
    const plain = POLYGON_LEVELS.filter((level) => {
      const scene = sceneById(level.options?.shapePicture ?? "");
      return scene === undefined || twins(scene).length === 0;
    });
    expect(
      plain.length,
      `levels with no twin to swap: ${plain.map((one) => one.level).join(", ")}`,
    ).toBeLessThanOrEqual(1);
    const withTwins = SCENES.filter((scene) => twins(scene).length > 0);
    expect(withTwins.length * 2).toBeGreaterThanOrEqual(SCENES.length);
  });

  it("draws every piece from the same path its shadow is cut from", () => {
    for (const scene of SCENES) {
      const { picture, parts } = sceneShapes(scene);
      for (const [index, piece] of parts.entries()) {
        expect(piece.artwork).toContain(`d="${piece.outline}"`);
        expect(picture.outline).toContain(piece.outline);
        // Every part carries the whole scene box and the scene's own anchor,
        // which is what makes the parts assemble by construction.
        expect(piece.box).toEqual(SCENE_BOX);
        expect(piece.anchor).toEqual(picture.anchor);
        expect(piece.inked).toEqual(boundsOf(scene.parts[index]!));
      }
    }
  });
});

/**
 * Deal a level standing the picture we want to reason about. A row names its
 * picture now, so this overrides the name rather than dealing until the one it
 * wants turns up - which is also how the catalogue's spares get played here.
 */
function dealScene(level: LevelSpec, id: string): Puzzle {
  const named = { ...level, options: { ...level.options, shapePicture: id } };
  return polygon.deal({ level: named, shapes: [] }, seededRandom(level.level));
}

/**
 * Where a piece's box has to be for its drawing to land on place `place`,
 * worked out from the scene rather than from the kind: the picture's corner,
 * shifted by however far that place is from where the piece was drawn.
 */
function spot(scene: Scene, layout: Layout, piece: number, place: number) {
  const picture = layout.targets[0]!;
  const { scale } = boxOf(layout, picture.id);
  const origin = holeOf(layout, picture.id);
  const from = scene.parts[piece]!.at;
  const to = scene.parts[place]!.at;
  return { x: origin.x + (to.x - from.x) * scale, y: origin.y + (to.y - from.y) * scale };
}

/**
 * The piece drawn for the scene's `index`th part. Pieces are dealt in a random
 * order - the tray cell a piece waits in is cut for it, so the deal is where
 * the shuffle has to happen - so this looks the part up rather than counting.
 */
const idOf = (puzzle: Puzzle, index: number): PieceId => {
  const { homeOf } = puzzle as unknown as { homeOf: ReadonlyMap<PieceId, number> };
  const piece = puzzle.pieces.find((shape) => homeOf.get(shape.id) === index);
  if (!piece) throw new Error(`No piece was dealt for scene part ${index}.`);
  return piece.id;
};

describe("the polygon kind", () => {
  it("deals one picture and one piece per part", () => {
    for (const level of POLYGON_LEVELS) {
      for (let seed = 0; seed < 8; seed++) {
        const puzzle = polygon.deal({ level, shapes: [] }, seededRandom(seed));
        expect(puzzle.targets, `level ${level.level}`).toHaveLength(1);
        expect(puzzle.pieces, `level ${level.level}`).toHaveLength(level.pieces);
        assertUniquePieceIds(puzzle.pieces, `level ${level.level}`);
      }
    }
  });

  it("stands the picture its row names, whatever the seed, and shuffles only the order", () => {
    // Which picture is the table's business: a level is the same picture every
    // time it is played, so two levels of the chapter cannot turn out to be the
    // same puzzle. What is still dealt fresh is the order the pieces wait in.
    for (const level of POLYGON_LEVELS) {
      const named = `polygon:${level.options?.shapePicture}`;
      const orders = new Set<string>();
      for (let seed = 0; seed < 20; seed++) {
        const puzzle = polygon.deal({ level, shapes: [] }, seededRandom(seed));
        expect(puzzle.targets[0]!.id, `level ${level.level}`).toBe(named);
        orders.add(puzzle.pieces.map((piece) => piece.id).join(","));
      }
      expect(orders.size, `level ${level.level}`).toBeGreaterThan(1);
    }
    // And a seed replays a deal exactly, order and all.
    const level = POLYGON_LEVELS[0]!;
    const once = polygon.deal({ level, shapes: [] }, seededRandom(4));
    const again = polygon.deal({ level, shapes: [] }, seededRandom(4));
    expect(again.pieces.map((piece) => piece.id)).toEqual(once.pieces.map((piece) => piece.id));
  });

  it("refuses a level that asks for more than one picture", () => {
    const level = { ...POLYGON_LEVELS[0]!, targets: 2 };
    expect(() => polygon.deal({ level, shapes: [] }, seededRandom(1))).toThrow(/1 target/i);
  });

  it("refuses a level that names no picture at all", () => {
    // A level nobody chose the picture for is a mistake in the table, and one
    // the child would never see reported. Better a loud start than a quiet
    // default.
    const level = { ...POLYGON_LEVELS[0]!, options: {} };
    expect(() => polygon.deal({ level, shapes: [] }, seededRandom(1))).toThrow(
      /names no shape picture/i,
    );
  });

  it("refuses a level that names a picture the catalogue does not have", () => {
    const level = { ...POLYGON_LEVELS[0]!, options: { shapePicture: "spaceship" } };
    expect(() => polygon.deal({ level, shapes: [] }, seededRandom(1))).toThrow(
      /no shape picture is called "spaceship"/i,
    );
  });

  it("refuses a level whose size disagrees with the picture it names", () => {
    // The row and the catalogue have to say the same thing: a picture arrives
    // whole, so a table asking for four pieces of a three-part house has
    // drifted rather than tuned.
    const level = { ...POLYGON_LEVELS[0]!, pieces: 9 };
    expect(() => polygon.deal({ level, shapes: [] }, seededRandom(1))).toThrow(
      /asks for 9 pieces but "house" is built from 3/i,
    );
  });

  it("cuts one shadow per part, all in the one picture's hole", () => {
    for (const level of POLYGON_LEVELS) {
      const puzzle = polygon.deal({ level, shapes: [] }, seededRandom(2));
      for (const id of ["landscape", "portrait"] as const) {
        const layout = buildLevelLayout(id, level, puzzle.pieces, puzzle.targets);
        expect(layout.holes.size).toBe(1);
        const shadows = polygon.backdrop(puzzle, layout).match(/class="hole"/g) ?? [];
        expect(shadows, `level ${level.level} ${id}`).toHaveLength(level.pieces);
        // Every part is drawn at the picture's own scale, or they would not
        // assemble into it.
        const whole = boxOf(layout, puzzle.targets[0]!.id);
        for (const piece of puzzle.pieces) {
          expect(boxOf(layout, piece.id).scale).toBe(whole.scale);
        }
      }
    }
  });

  it("settles each piece where the scene drew it, when nothing has been swapped", () => {
    for (const scene of SCENES) {
      const level = POLYGON_LEVELS.find((one) => one.pieces === scene.parts.length)!;
      const puzzle = dealScene(level, scene.id);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
      const origin = holeOf(layout, puzzle.targets[0]!.id);
      for (const piece of puzzle.pieces) {
        expect(polygon.target(puzzle, layout, piece.id)).toEqual(origin);
      }
    }
  });

  it("takes a sloppy drop on a piece's own place, and refuses a distant one", () => {
    for (const scene of SCENES) {
      const level = POLYGON_LEVELS.find((one) => one.pieces === scene.parts.length)!;
      const puzzle = dealScene(level, scene.id);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
      for (const [index, piece] of puzzle.pieces.entries()) {
        const home = spot(scene, layout, index, index);
        const { reach } = boxOf(layout, piece.id);
        expect(polygon.accepts(puzzle, layout, piece.id, home), piece.id).toBe(true);
        const near = { x: home.x + reach.width * 0.45, y: home.y - reach.height * 0.45 };
        expect(polygon.accepts(puzzle, layout, piece.id, near), piece.id).toBe(true);
        const far = { x: home.x + reach.width * 6, y: home.y + reach.height * 6 };
        expect(polygon.accepts(puzzle, layout, piece.id, far), piece.id).toBe(false);
      }
    }
  });

  it("never takes a piece into a place of another shape", () => {
    // The invariant the whole game keeps: a piece can only ever be right, so a
    // triangle aimed at a square-shaped shadow is not taken as that square. It
    // may still be near enough to count as its *own* place - the parts of a
    // picture touch - so what is checked is where it would land, not whether
    // the drop counted.
    for (const scene of SCENES) {
      const level = POLYGON_LEVELS.find((one) => one.pieces === scene.parts.length)!;
      const puzzle = dealScene(level, scene.id);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
      for (const [piece, part] of scene.parts.entries()) {
        for (const [place, other] of scene.parts.entries()) {
          if (signatureOf(part) === signatureOf(other)) continue;
          const chosen = accepted(puzzle, layout, piece, spot(scene, layout, piece, place));
          if (chosen === null) continue;
          expect(signatureOf(scene.parts[chosen]!), `${scene.id} ${piece}->${place}`).toBe(
            signatureOf(part),
          );
        }
      }
    }
  });

  it("lets two shapes the same fill either of their places, and swaps them over", () => {
    // The rule this chapter exists for. A child who drops one petal on another
    // petal's shadow has done something visibly right, and this game never
    // answers that with "no": the piece is taken, and the petal it displaced
    // now belongs in the place it came from.
    for (const scene of SCENES) {
      const pairs = twins(scene);
      if (pairs.length === 0) continue;
      const level = POLYGON_LEVELS.find((one) => one.pieces === scene.parts.length)!;
      for (const { a, b } of pairs) {
        const puzzle = dealScene(level, scene.id);
        const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
        const first = idOf(puzzle, a);
        const second = idOf(puzzle, b);

        const swapped = spot(scene, layout, a, b);
        expect(polygon.accepts(puzzle, layout, first, swapped), `${scene.id} ${a}->${b}`).toBe(
          true,
        );
        polygon.settle?.(puzzle, layout, first, swapped);
        puzzle.placed.add(first);

        // The piece settles where the finger let it go, not where it was drawn,
        // and stays there through every later re-render.
        expect(polygon.target(puzzle, layout, first)).toEqual(swapped);
        expect(polygon.target(puzzle, layout, second)).toEqual(spot(scene, layout, b, a));
        expect(polygon.accepts(puzzle, layout, second, spot(scene, layout, b, a))).toBe(true);

        // And the place it took is spoken for: the shadow now names the piece
        // standing in it, and nothing else is offered it.
        expect(polygon.backdrop(puzzle, layout)).toContain(`data-piece="${first}"`);
        expect(polygon.accepts(puzzle, layout, second, spot(scene, layout, b, b))).toBe(false);
      }
    }
  });

  it("offers a hint every place a piece would be taken, not just the one it is aimed at", () => {
    // The reason `openTargets` exists. This kind accepts a piece into *any*
    // free congruent shadow, so a hint that glowed only the one it happens to
    // be aimed at would teach a rule the game does not have - and the child
    // being hinted at is in no position to discover the rule was a lie.
    for (const scene of SCENES) {
      const level = POLYGON_LEVELS.find((one) => one.pieces === scene.parts.length)!;
      const puzzle = dealScene(level, scene.id);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
      // Pieces are dealt in a random order, so a part is looked up rather than
      // counted off the tray.
      for (const [index, part] of scene.parts.entries()) {
        const piece = idOf(puzzle, index);
        const open = openFor(puzzle, layout, piece);
        const congruent = scene.parts.filter((other) => signatureOf(other) === signatureOf(part));
        expect(open, `${scene.id} ${piece}`).toHaveLength(congruent.length);
        // Nothing offered would be refused, and where it is aimed now is
        // always among them - so the hint is never a superset of the truth,
        // and never a subset of it either.
        for (const at of open) {
          expect(polygon.accepts(puzzle, layout, piece, at), `${scene.id} ${piece}`).toBe(true);
        }
        expect(open).toContainEqual(polygon.target(puzzle, layout, piece));
      }
    }
  });

  it("stops offering a place once a piece is standing in it", () => {
    for (const scene of SCENES) {
      const pairs = twins(scene);
      if (pairs.length === 0) continue;
      const level = POLYGON_LEVELS.find((one) => one.pieces === scene.parts.length)!;
      const { a, b } = pairs[0]!;
      const puzzle = dealScene(level, scene.id);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);
      const first = idOf(puzzle, a);
      const second = idOf(puzzle, b);

      const before = openFor(puzzle, layout, second);
      expect(before.length, scene.id).toBeGreaterThan(1);
      expect(before).toContainEqual(spot(scene, layout, b, a));

      const at = spot(scene, layout, a, a);
      polygon.settle?.(puzzle, layout, first, at);
      puzzle.placed.add(first);

      const after = openFor(puzzle, layout, second);
      expect(after, scene.id).toHaveLength(before.length - 1);
      expect(after).not.toContainEqual(spot(scene, layout, b, a));
    }
  });

  it("finishes a picture however the identical pieces were shared out", () => {
    for (const scene of SCENES) {
      const level = POLYGON_LEVELS.find((one) => one.pieces === scene.parts.length)!;
      const puzzle = dealScene(level, scene.id);
      const layout = buildLevelLayout("landscape", level, puzzle.pieces, puzzle.targets);

      // Played backwards, so every piece that has a twin meets a place its twin
      // was drawn for before its own.
      const order = [...puzzle.pieces.keys()].reverse();
      const filled = new Set<number>();
      for (const index of order) {
        const piece = idOf(puzzle, index);
        const place = [...scene.parts.keys()].find(
          (place) =>
            !filled.has(place) &&
            signatureOf(scene.parts[place]!) === signatureOf(scene.parts[index]!),
        )!;
        const at = spot(scene, layout, index, place);
        expect(polygon.isComplete(puzzle)).toBe(false);
        expect(polygon.accepts(puzzle, layout, piece, at), `${scene.id} ${index}->${place}`).toBe(
          true,
        );
        polygon.settle?.(puzzle, layout, piece, at);
        puzzle.placed.add(piece);
        filled.add(place);
        expect(polygon.target(puzzle, layout, piece)).toEqual(at);
      }
      expect(polygon.isComplete(puzzle)).toBe(true);

      // And the finished picture is the picture: every place filled exactly
      // once, by a piece of the shape it wanted.
      expect(filled.size).toBe(scene.parts.length);
      const shadows = polygon.backdrop(puzzle, layout).match(/opacity: 0/g) ?? [];
      expect(shadows).toHaveLength(scene.parts.length);
    }
  });
});

/**
 * Everywhere a hint would point for this piece. `openTargets` is optional on
 * the contract, so this insists the kind that has a choice of place implements
 * it rather than quietly testing nothing.
 */
function openFor(puzzle: Puzzle, layout: Layout, piece: PieceId) {
  if (!polygon.openTargets)
    throw new Error("A kind with a choice of place must offer openTargets.");
  return polygon.openTargets(puzzle, layout, piece);
}

/** Which place a drop would take, or null: `accepts` with the answer showing. */ function accepted(
  puzzle: Puzzle,
  layout: Layout,
  piece: number,
  at: { x: number; y: number },
) {
  const id = idOf(puzzle, piece);
  if (!polygon.accepts(puzzle, layout, id, at)) return null;
  const before = polygon.target(puzzle, layout, id);
  polygon.settle?.(puzzle, layout, id, at);
  const after = polygon.target(puzzle, layout, id);
  const scene = SCENES.find((one) => `polygon:${one.id}` === puzzle.targets[0]!.id)!;
  const place = [...scene.parts.keys()].find((place) => {
    const where = spot(scene, layout, piece, place);
    return Math.abs(where.x - after.x) < 0.001 && Math.abs(where.y - after.y) < 0.001;
  });
  // Put it back: this is a question, not a move.
  polygon.settle?.(puzzle, layout, id, before);
  return place ?? null;
}
