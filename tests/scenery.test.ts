/**
 * The background a level is played against.
 *
 * A theme in the level table narrows the cast to a farm, the sea or a jungle;
 * the backdrop is what puts that cast somewhere. What is checked here is the
 * part of that which survives leaving the browser - that every level resolves
 * to a backdrop, that a theme reaches the markup, that the four backdrops are
 * actually different from one another, and that the rules the backdrops are
 * built on still hold. Whether any of it is *nice to look at* is not checkable
 * here and is reviewed by rendering it: `npm run shot` covers all three themes
 * (`10-level10-start` and `12-portrait-level10` are sea, `14-level14-sliced` is
 * jungle).
 */
import { describe, expect, it } from "vitest";
import sceneryRaw from "../src/scenery.ts?raw";
import { ANIMAL_BOX, ANIMAL_IDS, animalAnchor, animalInk } from "../src/assets";
import { buildLevelLayout, type Layout } from "../src/layout";
import { LEVELS, type LevelSpec } from "../src/levels";
import { pieceId, type PieceShape } from "../src/piece";
import { backdropFor, renderScenery } from "../src/scenery";
import { THEMES, type ThemeId } from "../src/themes";

const SHAPES: readonly PieceShape[] = ANIMAL_IDS.map((id) => ({
  id: pieceId(id),
  outline: "M0 0 h10 v10 z",
  artwork: "",
  box: ANIMAL_BOX,
  inked: animalInk(id),
  anchor: animalAnchor(id),
  label: id,
}));

const ORIENTATIONS = ["landscape", "portrait"] as const;

const castFor = (level: LevelSpec): PieceShape[] =>
  Array.from({ length: Math.max(1, level.pieces) }, (_, index) => SHAPES[index % SHAPES.length]!);

const layoutOf = (level: LevelSpec, id: Layout["id"] = "landscape"): Layout => {
  const cast = castFor(level);
  return buildLevelLayout(id, level, cast, cast.slice(0, level.targets));
};

/** Every level, both ways up: a backdrop has to survive every board it is behind. */
const BOARDS: { level: LevelSpec; layout: Layout }[] = LEVELS.flatMap((level) =>
  ORIENTATIONS.map((id) => ({ level, layout: layoutOf(level, id) })),
);

/**
 * One colour that belongs to each backdrop and to no other, so a check can say
 * which world a piece of markup is standing in. These are the sky washes, which
 * every backdrop paints whatever else it is asked to leave out.
 */
const SIGNATURE: Record<ThemeId | "meadow", string> = {
  meadow: "#7ec8e8",
  farm: "#9ed8ff",
  sea: "#2f8fd0",
  jungle: "#bfe6ff",
};

/**
 * The same board under another theme. `exactOptionalPropertyTypes` means an
 * unthemed level has no `theme` key at all rather than an undefined one, so it
 * is dropped rather than overwritten.
 */
const reThemed = (layout: Layout, theme: ThemeId | undefined): Layout => {
  const { theme: _was, ...rest } = layout.level;
  return { ...layout, level: theme ? { ...rest, theme } : rest };
};

/** The same board, re-themed: geometry held still so only the backdrop moves. */
const asTheme = (layout: Layout, theme: ThemeId | undefined): string =>
  renderScenery(reThemed(layout, theme));

describe("which backdrop a level gets", () => {
  it("finds one for every level in the table", () => {
    expect(LEVELS.length).toBe(30);
    for (const level of LEVELS) {
      expect(backdropFor(level.theme), `level ${level.level}`).toBeDefined();
    }
  });

  it("finds one for every theme the game names", () => {
    // A theme added to `themes.ts` and dealt from without a backdrop would put
    // its cast on the meadow silently. This is what makes that a failure.
    expect(THEMES).toEqual(["farm", "sea", "jungle"]);
    for (const theme of THEMES) {
      expect(backdropFor(theme), theme).toBeDefined();
    }
  });

  it("gives an unthemed level the meadow", () => {
    const unthemed = LEVELS.filter((level) => !level.theme);
    expect(unthemed.length).toBeGreaterThan(0);
    expect(backdropFor(undefined).wash).toEqual(["#7ec8e8", "#d6f0f8"]);
  });
});

describe("a theme reaches the screen", () => {
  it("paints each themed level in its own world, and no other", () => {
    const themed = BOARDS.filter(({ level }) => level.theme);
    expect(themed.length).toBeGreaterThan(0);
    for (const { level, layout } of themed) {
      const markup = renderScenery(layout);
      const theme = level.theme!;
      expect(markup, `level ${level.level} (${theme})`).toContain(SIGNATURE[theme]);
      for (const other of Object.keys(SIGNATURE) as (ThemeId | "meadow")[]) {
        if (SIGNATURE[other] === SIGNATURE[theme]) continue;
        expect(markup, `level ${level.level} (${theme})`).not.toContain(SIGNATURE[other]);
      }
    }
  });

  it("leaves every unthemed level on the meadow it has always had", () => {
    const plain = BOARDS.filter(({ level }) => !level.theme);
    expect(plain.length).toBeGreaterThan(0);
    for (const { level, layout } of plain) {
      const markup = renderScenery(layout);
      expect(markup, `level ${level.level}`).toContain(SIGNATURE.meadow);
      for (const theme of ["farm", "sea", "jungle"] as const) {
        expect(markup, `level ${level.level}`).not.toContain(SIGNATURE[theme]);
      }
    }
  });

  it("draws a different world for each theme on one and the same board", () => {
    // Held-still geometry: whatever is different here is the backdrop's doing
    // rather than the board's, so three themes that all quietly fell back to the
    // meadow could not pass.
    const board = layoutOf(LEVELS[5]!);
    const worlds = [undefined, "farm", "sea", "jungle"].map((theme) =>
      asTheme(board, theme as ThemeId | undefined),
    );
    expect(new Set(worlds).size).toBe(worlds.length);
  });
});

describe("what every backdrop owes the board", () => {
  const THEMED_BOARDS = (["meadow", "farm", "sea", "jungle"] as const).flatMap((theme) =>
    ORIENTATIONS.map((id) => ({
      theme,
      layout: layoutOf(LEVELS[5]!, id),
    })),
  );

  it("covers the canvas to the very bottom", () => {
    // A gap under the last band would be a white stripe along the bottom of an
    // iPad, in whichever theme forgot to paint it. The sky wash is excluded from
    // the measure: it is painted full height by construction, so counting it
    // would make this pass whatever the ground did.
    expect(THEMED_BOARDS.length).toBe(8);
    for (const { theme, layout } of THEMED_BOARDS) {
      const markup = asTheme(layout, theme === "meadow" ? undefined : theme);
      const bands = [
        ...markup.matchAll(
          /<rect x="0" y="([\d.]+)" width="\d+" height="([\d.]+)" fill="(?!url\(#sky\))[^"]+"/g,
        ),
      ].map(([, y, height]) => Number(y) + Number(height));
      expect(bands.length, `${theme} ${layout.id}`).toBeGreaterThan(0);
      const reach = bands.reduce((low, high) => Math.max(low, high), 0);
      expect(reach, `${theme} ${layout.id}`).toBeGreaterThanOrEqual(layout.canvas.height);
    }
  });

  it("washes the whole ground from one gradient, measured against the board", () => {
    // The near band and the crest that rises out of it are two shapes cut from
    // one wash. Left in SVG's default per-shape units each runs the whole wash
    // inside its own box, so a crest thirty units deep finishes dark along its
    // flat bottom edge while the band under it is still light, ruling a seam
    // across the board - worst in portrait, where the band below is deepest.
    // Whether it looks continuous is a matter for the eye; that the shapes are
    // measured against the canvas rather than against themselves is not.
    for (const { theme, layout } of THEMED_BOARDS) {
      const markup = renderScenery(reThemed(layout, theme === "meadow" ? undefined : theme));
      const where = `${theme} ${layout.id}`;
      const washed = markup.match(/url\(#ground\)/g) ?? [];
      expect(washed.length, `${where}: shapes filled from the ground wash`).toBeGreaterThan(1);
      const wash = /<linearGradient id="ground"([^>]*)>/.exec(markup)?.[1];
      expect(wash, where).toBeDefined();
      expect(wash, where).toContain('gradientUnits="userSpaceOnUse"');
      // Each end read on its own rather than as one fixed run of attributes:
      // where the wash starts and stops is the invariant, the order the tag
      // happens to be written in is not.
      const endAt = (name: string): number => {
        const found = new RegExp(`\\b${name}="([-\\d.]+)"`).exec(wash!);
        expect(found, `${where}: no ${name} in ${wash}`).not.toBeNull();
        return Number(found![1]);
      };
      const grassTop = layout.bands[1]?.top ?? layout.horizon;
      expect(endAt("y1"), `${where}: wash starts at the grass`).toBe(grassTop);
      expect(endAt("y2"), `${where}: wash ends at the bottom`).toBe(layout.canvas.height);
    }
  });

  it("draws a tray to stand the pieces on, in every theme", () => {
    // The tray's sand and its lip: every level has a shelf, because every level
    // is dragged from one.
    for (const { theme, layout } of THEMED_BOARDS) {
      const board = reThemed(layout, theme === "meadow" ? undefined : theme);
      const markup = renderScenery(board);
      expect(markup, `${theme} ${layout.id}`).toContain("#f6ead0");
      expect(markup, `${theme} ${layout.id}`).toContain("#d9c398");
      expect(markup).toContain(SIGNATURE[theme]);
    }
  });
});

describe("the rule a backdrop is drawn under", () => {
  it("paints no animal into any background", () => {
    // A cow standing in the field beside a cow-shaped hole tells a two-year-old,
    // correctly as far as they can tell, that the cow they are holding is
    // already placed. So the farmyard's cow is drawn here as a tractor, and this
    // is the check that keeps it that way - comments stripped first, because the
    // reason has to be allowed to name the animal it is about.
    const code = sceneryRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code.length).toBeGreaterThan(0);
    for (const animal of ANIMAL_IDS) {
      expect(code, `${animal} in the scenery`).not.toMatch(new RegExp(`\\b${animal}\\b`, "i"));
    }
  });
});
