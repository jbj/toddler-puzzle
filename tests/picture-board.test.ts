/**
 * The board a cut-up picture is played on.
 *
 * Both picture chapters - jigsaw and shatter - are laid out the other way round
 * from every other level: the tray is planned first and the picture takes
 * everything left over, on flat colour rather than in a landscape. See
 * [decision 20260730T230000](../docs/decisions/20260730T230000-a-picture-takes-the-board.md).
 *
 * What is checked here is the pair of promises that make it work, because both
 * of them are invisible in a green suite otherwise:
 *
 *  - the picture is held against one edge of the room it is given, so growing
 *    the tray or moving the button can never quietly shrink it back;
 *  - a piece waits no smaller than two thirds of what it lands at, which is the
 *    price the picture is allowed to charge for the room.
 *
 * Whether the flat blue *looks* right behind a picture is `npm run shot`'s.
 */
import { describe, expect, it } from "vitest";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor } from "../src/assets";
import { seededRandom } from "../src/geometry";
import { kindFor, loadAllKinds } from "../src/kinds/registry";
import { boxOf, buildLevelLayout, holeOf, trayHome, waitingInk } from "../src/layout";
import { LEVELS, type LevelSpec } from "../src/levels";
import { pieceId, type PieceShape } from "../src/piece";
import { PICTURE_BACKDROP, pictureBackdrop } from "../src/picture-pieces";
import type { Puzzle } from "../src/puzzle";

await loadAllKinds();

const SHAPES: readonly PieceShape[] = ANIMAL_IDS.map((id) => ({
  id: pieceId(id),
  outline: "",
  artwork: "",
  box: ANIMAL_BOX,
  anchor: animalAnchor(id),
  label: id,
}));

const ORIENTATIONS = ["landscape", "portrait"] as const;

/** The levels that hand a child one picture in pieces. */
const PICTURE_LEVELS = LEVELS.filter(
  (level) => level.kind === "jigsaw" || level.kind === "shatter",
);

const dealt = (level: LevelSpec, run: number): Puzzle =>
  kindFor(level).deal({ level, shapes: SHAPES }, seededRandom(level.level * 101 + run));

/** Every picture board the table can put on screen, over a handful of deals. */
const BOARDS = PICTURE_LEVELS.flatMap((level) =>
  Array.from({ length: 6 }, (_, run) => dealt(level, run)).flatMap((puzzle) =>
    ORIENTATIONS.map((id) => ({
      level,
      id,
      puzzle,
      layout: buildLevelLayout(id, level, puzzle.pieces, puzzle.targets),
    })),
  ),
);

describe("the board a picture is rebuilt on", () => {
  it("has one to look at for every picture level in both orientations", () => {
    // The sweeps below iterate a set they discovered; this is what says the set
    // is not empty, so a table that stopped naming a jigsaw cannot pass them
    // all by having nothing to check.
    expect(PICTURE_LEVELS.length, `${PICTURE_LEVELS.length} picture levels`).toBeGreaterThan(4);
    expect(BOARDS).toHaveLength(PICTURE_LEVELS.length * 6 * ORIENTATIONS.length);
  });

  it("fills the room the tray leaves it, unless the two-thirds floor stopped it", () => {
    // The picture is as big as two things allow, so one of them is always
    // tight: either it has reached an edge of the room, or growing it further
    // would have taken a waiting piece below two thirds of its landing size.
    // A board where *neither* is tight is a board that has quietly stopped
    // growing the picture, which is what this exists to catch.
    for (const { level, id, layout } of BOARDS) {
      const { size } = boxOf(layout, layout.targets[0]!.id);
      const room = layout.sceneBox;
      const filled = Math.max(size.width / room.width, size.height / room.height);
      const atFloor = layout.waitingScale <= 2 / 3 + 0.005;
      expect(
        atFloor || filled > 0.99,
        `level ${level.level} ${id}: fills ${filled.toFixed(2)} of the room with pieces ` +
          `waiting at ${layout.waitingScale.toFixed(3)}, so neither limit is tight`,
      ).toBe(true);
    }
  });

  it("never draws a waiting piece below two thirds of what it lands at", () => {
    for (const { level, id, layout } of BOARDS) {
      expect(layout.waitingScale, `level ${level.level} ${id}`).toBeGreaterThanOrEqual(2 / 3);
      expect(layout.waitingScale, `level ${level.level} ${id}`).toBeLessThanOrEqual(1);
      for (const piece of layout.pieces) {
        const { ink } = boxOf(layout, piece.id);
        const waiting = waitingInk(layout, piece.id);
        expect(waiting.width / ink.width, piece.id).toBeCloseTo(layout.waitingScale, 9);
        expect(waiting.height / ink.height, piece.id).toBeCloseTo(layout.waitingScale, 9);
      }
    }
  });

  it("keeps the whole picture on canvas", () => {
    for (const { level, id, layout } of BOARDS) {
      const target = layout.targets[0]!;
      const at = holeOf(layout, target.id);
      const { size } = boxOf(layout, target.id);
      const where = `level ${level.level} ${id}`;
      expect(at.x, where).toBeGreaterThanOrEqual(-0.5);
      expect(at.y, where).toBeGreaterThanOrEqual(layout.sceneTop - 0.5);
      expect(at.x + size.width, where).toBeLessThanOrEqual(layout.canvas.width + 0.5);
      expect(at.y + size.height, where).toBeLessThanOrEqual(layout.canvas.height + 0.5);
    }
  });

  it("spends no more sand on the tray than the pieces standing in it are worth", () => {
    // The other half of the room the picture takes, and the one that is
    // invisible from the numbers: a tray's margins are shares of the *slot*,
    // and on a picture board the slot is the whole picture. Left at that a
    // single shard stands in a third of a picture's width of sand, and every
    // unit of it is off the picture. Measured across the direction the tray
    // costs the picture - down for a band, across for a gutter - the sand
    // spare around the pieces is held to a third of the largest of them.
    //
    // A shelf is as tall as the tallest *box* standing on it, not the tallest
    // drawing, so part of this sand is the margin a hand needs around a piece
    // it presses - and a shard thickened to 1:2 carries more of it than the
    // drawing shows. That is what the last hundredth here bought; see
    // [decision 20260731T133000](../docs/decisions/20260731T133000-one-box-measures-a-piece.md).
    for (const { level, id, layout } of BOARDS) {
      const drawn = layout.pieces.map((piece) => waitingInk(layout, piece.id));
      const biggest = Math.max(...drawn.map((ink) => Math.max(ink.width, ink.height)));
      const across = layout.trayBands[0]!.rect.width < layout.canvas.width;
      const home = layout.pieces.map((piece) => trayHome(layout, piece.id));
      const low = Math.min(
        ...drawn.map((ink, at) => (across ? home[at]!.x + ink.x : home[at]!.y + ink.y)),
      );
      const high = Math.max(
        ...drawn.map((ink, at) =>
          across ? home[at]!.x + ink.x + ink.width : home[at]!.y + ink.y + ink.height,
        ),
      );
      for (const band of layout.trayBands) {
        const thickness = across ? band.rect.width : band.rect.height;
        // A gutter's two bands hold their own pieces; taking the spread of all
        // of them is the same measure mirrored, because both are the same width.
        const spare = thickness - Math.min(high - low, thickness);
        expect(
          spare / biggest,
          `level ${level.level} ${id}: ${Math.round(spare)} units of sand around a ` +
            `${Math.round(biggest)}-unit piece`,
        ).toBeLessThan(0.35);
      }
    }
  });

  it("stands the pieces near the outside, where the picture is not", () => {
    // The sand runs to the edge of the canvas either way, so the margin on the
    // far side of the tray - above a band, outside a gutter - buys nothing and
    // is charged to the picture. Measured on the piece that comes closest,
    // because a shelf below the first one is meant to be further in.
    for (const { level, id, layout } of BOARDS) {
      const across = layout.trayBands[0]!.rect.width < layout.canvas.width;
      let outside = Infinity;
      let biggest = 0;
      for (const piece of layout.pieces) {
        const home = trayHome(layout, piece.id);
        const ink = waitingInk(layout, piece.id);
        biggest = Math.max(biggest, ink.width, ink.height);
        outside = Math.min(
          outside,
          across
            ? Math.min(home.x + ink.x, layout.canvas.width - (home.x + ink.x + ink.width))
            : home.y + ink.y,
        );
      }
      expect(
        outside / biggest,
        `level ${level.level} ${id}: the tray starts ${Math.round(outside)} units in`,
      ).toBeLessThan(0.2);
    }
  });

  it("shrinks a waiting piece about its own drawing, so it grows where it stands", () => {
    // Picked up, a piece jumps to full size. If it grew about its box corner
    // instead it would leap across the board, because a piece of a picture
    // carries the whole picture's box.
    for (const { layout } of BOARDS) {
      for (const piece of layout.pieces) {
        const { ink } = boxOf(layout, piece.id);
        const waiting = waitingInk(layout, piece.id);
        expect(waiting.x + waiting.width / 2, piece.id).toBeCloseTo(ink.x + ink.width / 2, 9);
        expect(waiting.y + waiting.height / 2, piece.id).toBeCloseTo(ink.y + ink.height / 2, 9);
      }
    }
  });
});

describe("what a picture is drawn on", () => {
  it("asks for the colour behind the page rather than repeating it", () => {
    // The canvas letterboxes inside the window, so the page's background and
    // the picture's backdrop are on screen at once and a seam between them
    // would be the first thing anyone saw. They are one CSS variable rather
    // than two copies of one colour, which is what makes drift impossible; the
    // shot run checks it resolves to the same paint in a real browser.
    expect(PICTURE_BACKDROP).toContain("var(--board-blue");
    for (const { layout } of BOARDS) {
      // As a style property, not a `fill` attribute: `var()` is only reliably
      // resolved in the one that is unambiguously CSS.
      expect(pictureBackdrop(layout)).toContain(`style="fill: ${PICTURE_BACKDROP}"`);
    }
  });

  it("is flat colour and a tray, with no landscape in it", () => {
    for (const { level, id, puzzle, layout } of BOARDS) {
      const backdrop = kindFor(level).backdrop(puzzle, layout);
      const where = `level ${level.level} ${id}`;
      expect(backdrop, where).toContain(pictureBackdrop(layout));
      // The sky gradient, the grass gradient and the hill crests are the
      // landscape; a picture is a scene already and does not stand in one.
      expect(backdrop, where).not.toContain("url(#sky)");
      expect(backdrop, where).not.toContain("url(#grass)");
      expect(layout.bands, where).toEqual([]);
      expect(layout.decorLines, where).toEqual([]);
    }
  });

  it("still paints the shelf the pieces wait on", () => {
    for (const { layout } of BOARDS) {
      const backdrop = pictureBackdrop(layout);
      expect(layout.trayBands.length).toBeGreaterThan(0);
      for (const band of layout.trayBands) {
        expect(backdrop).toContain(`width="${band.rect.width}" height="${band.rect.height}"`);
      }
    }
  });
});
