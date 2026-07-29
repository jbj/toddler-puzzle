/**
 * The picture library, and the promise it makes to whatever cuts it up.
 *
 * A scene is artwork, and artwork is what unit tests cannot see - whether a
 * farmyard looks like a farmyard, and whether every piece of it has something
 * in it, are both measured from pixels by `npm run art:check`. What is checked
 * here is the other half: that a scene can be *inlined* safely, that the level
 * table and the library agree about which scenes exist, and that the box
 * divides the way the grids need it to.
 *
 * That last one is easy to overlook and expensive to get wrong. A jigsaw piece
 * is a rectangle of the picture, so if the box does not divide evenly by the
 * grid, every piece boundary lands on a fraction of a unit and the artwork
 * under two neighbouring pieces no longer adds up to the artwork.
 */
import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/levels";
import { loadPictures, pictureFor, PICTURE_BOX, PICTURE_IDS } from "../src/pictures";

const scenesInLevels = [
  ...new Set(LEVELS.flatMap((level) => (level.options?.scene ? [level.options.scene] : []))),
];

const gridsInLevels = LEVELS.flatMap((level) => (level.options?.grid ? [level.options.grid] : []));

describe("the picture library", () => {
  it("loads every scene it registers", () => {
    const pictures = loadPictures();
    expect(pictures.map((picture) => picture.id)).toEqual([...PICTURE_IDS]);
    for (const picture of pictures) {
      expect(picture.artwork.trim(), `${picture.id} draws nothing`).not.toBe("");
      expect(picture.box).toEqual(PICTURE_BOX);
      expect(picture.label).not.toBe("");
    }
  });

  it("hands out artwork that several scenes could share one document with", () => {
    // The cutter inlines a scene inside a clipped group of its own, and a board
    // can hold more than one. Anything named, or anything pointing outside
    // itself, would collide or dangle the moment it did.
    for (const { id, artwork } of loadPictures()) {
      expect(artwork, `${id} names something`).not.toMatch(/\bid\s*=/);
      expect(artwork, `${id} points at something by id`).not.toMatch(/url\(/);
      expect(artwork, `${id} refers to something outside itself`).not.toMatch(/\bhref\s*=/);
      expect(artwork, `${id} has text in it`).not.toMatch(/<text\b/);
      expect(artwork, `${id} reaches outside itself`).not.toMatch(
        /<(?:image|use|script|foreignObject)\b/,
      );
    }
  });

  it("has the scenes the level table asks for", () => {
    expect(scenesInLevels.length).toBeGreaterThan(0);
    for (const scene of scenesInLevels) {
      expect(() => pictureFor(scene), `level table asks for "${scene}"`).not.toThrow();
    }
  });

  it("refuses a scene nobody drew, by name", () => {
    expect(() => pictureFor("moonbase")).toThrow(/moonbase/);
    // And says what there is instead, so the message is actionable.
    expect(() => pictureFor("moonbase")).toThrow(new RegExp(PICTURE_IDS[0]));
  });

  it("is authored in a box every grid divides evenly", () => {
    expect(gridsInLevels.length).toBeGreaterThan(0);
    for (const { columns, rows } of gridsInLevels) {
      expect(PICTURE_BOX.width % columns, `${columns} columns`).toBe(0);
      expect(PICTURE_BOX.height % rows, `${rows} rows`).toBe(0);
    }
  });

  it("is the same objects however often it is loaded", () => {
    // Parsing is not free and the cutter asks per level; nothing downstream
    // should have to cache it a second time.
    expect(loadPictures()).toBe(loadPictures());
    expect(pictureFor(PICTURE_IDS[0])).toBe(loadPictures()[0]);
  });
});
