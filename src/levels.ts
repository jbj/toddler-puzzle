/**
 * The thirty levels, and the deal.
 *
 * This is the one file that tunes the difficulty curve. A level is a record
 * rather than code: which kind of puzzle it is, how many things there are to
 * fill, how many pieces fill them, and how forgiving a drop of one of them is.
 * Nothing here places a piece or draws anything - the kind does that, and the
 * layout is composed around whatever the deal produced.
 *
 * The ramp runs in six chapters of five, from a one-year-old's first touch to a
 * two-year-old assembling a picture:
 *
 * | Levels | Chapter | What it is |
 * | --- | --- | --- |
 * | 1-5 | First touches | Cause-and-effect play, alternating with one or two huge pieces |
 * | 6-10 | Animals | Shape-match, three to six pieces, themed casts |
 * | 11-15 | Sliced animals | One or two animals, each cut into two to four slices |
 * | 16-20 | Shapes | Polygon and tangram scenes |
 * | 21-25 | Pictures | Jigsaw, 2x2 growing to 3x3 |
 * | 26-30 | Mastery | 4x3 jigsaw, irregular partitions, mixed kinds |
 *
 * **The table says what kind, how many, and which cast; never which pieces.**
 * Which animals turn up and the order they stand in are dealt fresh every time
 * a level starts (`dealPieces`), narrowed to the level's `theme` where it names
 * one, which is what keeps the game from going stale after three plays.
 * `?seed=` replays a deal exactly by handing the same `random` in.
 *
 * Every kind this table names is built and registered (`kinds/registry.ts`),
 * and the tests hold the two to each other.
 */
import { shuffle } from "./geometry";
import { assertUniquePieceIds, type PieceShape } from "./piece";
import type { ThemeId } from "./themes";

/** A run of five levels. Chapters are what a celebration is hung on later. */
export type ChapterId =
  "first-touches" | "animals" | "sliced-animals" | "shapes" | "pictures" | "mastery";

/**
 * The chapters in play order. A chapter is five levels long, so a level's
 * chapter is also a way of asking how far into the thirty it is.
 */
export const CHAPTERS: readonly ChapterId[] = [
  "first-touches",
  "animals",
  "sliced-animals",
  "shapes",
  "pictures",
  "mastery",
];

/**
 * Every kind of puzzle the ramp names. Each one is registered by the kind that
 * implements it (`kinds/registry.ts`), and a level naming one that is not is a
 * mistake the tests catch.
 */
export type PuzzleKindId = "play" | "shape-match" | "sliced" | "polygon" | "jigsaw" | "shatter";

/**
 * A themed cast. A level naming one is dealt from the pieces that belong to it
 * (`dealPieces`); a level naming none is dealt from everything. The names live
 * in `themes.ts`, because a piece has to speak them too, and are re-exported
 * here so the level table reads as one thing.
 */
export type { ThemeId } from "./themes";

/**
 * Per-kind hints. A kind reads the ones it understands and ignores the rest - a
 * shape-match board has no grid and no scene. Anything a kind cannot work out
 * for itself belongs here rather than in the kind, so the curve stays tunable
 * from this file.
 */
export interface LevelOptions {
  /**
   * The grid a picture is cut into. Kept in step with `pieces` by the level
   * table's own tests, so the two can never drift apart.
   */
  readonly grid?: { readonly columns: number; readonly rows: number };
  /** Which hand-authored scene a picture or tangram kind should cut up. */
  readonly scene?: string;
  /**
   * Which cause-and-effect activity a `play` level runs. Every `play` level
   * names one; the table's own tests insist on it, because a level that fell
   * back to a default would be a level nobody chose.
   */
  readonly activity?: ActivityId;
}

/**
 * The cause-and-effect activities of the first chapter (`kinds/play.ts`). They
 * are levels a one-year-old can play before they can drag anything: touch a
 * thing, a thing happens, and the level ends when enough things have been
 * touched.
 */
export const ACTIVITIES = ["bubbles", "peekaboo", "alive"] as const;

export type ActivityId = (typeof ACTIVITIES)[number];

export interface LevelSpec {
  /** 1-based position in the thirty. */
  readonly level: number;
  readonly chapter: ChapterId;
  readonly kind: PuzzleKindId;
  readonly theme?: ThemeId;
  /**
   * Things to fill: holes, sockets, or things to touch. Usually the same as
   * `pieces`, but a sliced level fills one animal-shaped target with several
   * slices, so the two are separate numbers.
   */
  readonly targets: number;
  /** Pieces in play, which is what the tray and the deal are sized from. */
  readonly pieces: number;
  /**
   * Multiplies the snap radius (`SNAP_FRACTION` in `layout.ts`). Never below 1:
   * two thirds of a piece is the floor the whole game is forgiving at, and this
   * only ever makes an early level more forgiving still. See
   * [decision 20260727T072917](../docs/decisions/20260727T072917-generous-snap-radius.md).
   */
  readonly snapForgiveness: number;
  readonly options?: LevelOptions;
}

/** The floor for `snapForgiveness`: never tighter than two thirds of a piece. */
export const MIN_SNAP_FORGIVENESS = 1;

/**
 * The ceiling for `snapForgiveness`. A radius past this starts to reach a
 * neighbouring target on a busy board, which would let a piece snap into
 * somebody else's place - the one thing the game may never do.
 */
export const MAX_SNAP_FORGIVENESS = 1.5;

/**
 * The curve. Read down the `pieces` and `snapForgiveness` columns to see it:
 * the board fills up as the ramp climbs, and the forgiveness that carries a
 * one-year-old through their first touches eases back to the standard two
 * thirds of a piece by the last chapter.
 */
export const LEVELS: readonly LevelSpec[] = [
  // Chapter 1: first touches. The chapter alternates: something to touch,
  // something to drag, and back. Dragging is beyond many one-year-olds, so the
  // game opens on a level that asks for nothing but a finger, and every other
  // level after it is one of those - a child who cannot drag yet still wins
  // something on levels 1, 3 and 5, and finds the drag waiting whenever they
  // are ready for it. See
  // [decision 20260729T072100](../docs/decisions/20260729T072100-the-game-opens-with-something-to-touch.md).
  {
    level: 1,
    chapter: "first-touches",
    kind: "play",
    targets: 1,
    pieces: 1,
    snapForgiveness: 1.5,
    options: { activity: "bubbles" },
  },
  {
    level: 2,
    chapter: "first-touches",
    kind: "shape-match",
    targets: 1,
    pieces: 1,
    snapForgiveness: 1.5,
  },
  {
    level: 3,
    chapter: "first-touches",
    kind: "play",
    targets: 2,
    pieces: 2,
    snapForgiveness: 1.45,
    options: { activity: "peekaboo" },
  },
  {
    level: 4,
    chapter: "first-touches",
    kind: "shape-match",
    targets: 2,
    pieces: 2,
    snapForgiveness: 1.45,
  },
  {
    level: 5,
    chapter: "first-touches",
    kind: "play",
    targets: 3,
    pieces: 3,
    snapForgiveness: 1.4,
    options: { activity: "alive" },
  },

  // Chapter 2: animals. The game as it has always been, growing to a full board.
  {
    level: 6,
    chapter: "animals",
    kind: "shape-match",
    theme: "farm",
    targets: 3,
    pieces: 3,
    snapForgiveness: 1.35,
  },
  {
    level: 7,
    chapter: "animals",
    kind: "shape-match",
    theme: "sea",
    targets: 4,
    pieces: 4,
    snapForgiveness: 1.3,
  },
  {
    level: 8,
    chapter: "animals",
    kind: "shape-match",
    theme: "jungle",
    targets: 4,
    pieces: 4,
    snapForgiveness: 1.3,
  },
  {
    level: 9,
    chapter: "animals",
    kind: "shape-match",
    theme: "farm",
    targets: 5,
    pieces: 5,
    snapForgiveness: 1.25,
  },
  {
    level: 10,
    chapter: "animals",
    kind: "shape-match",
    theme: "sea",
    targets: 6,
    pieces: 6,
    snapForgiveness: 1.2,
  },

  // Chapter 3: sliced animals. The same silhouettes, one degree harder: a
  // target holds several slices, so `targets` and `pieces` part company.
  {
    level: 11,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "farm",
    targets: 1,
    pieces: 2,
    snapForgiveness: 1.2,
  },
  {
    level: 12,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "jungle",
    targets: 1,
    pieces: 3,
    snapForgiveness: 1.2,
  },
  {
    level: 13,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "sea",
    targets: 2,
    pieces: 4,
    snapForgiveness: 1.15,
  },
  {
    level: 14,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "jungle",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.15,
  },
  {
    level: 15,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "farm",
    targets: 2,
    pieces: 6,
    snapForgiveness: 1.15,
  },

  // Chapter 4: shapes. One picture - a house, a boat, a rocket - built out of
  // plain coloured shapes, so every level here stands a single target and deals
  // the shapes it takes. Which picture is drawn fresh each time from the scenes
  // of that size (`scenes.ts`), the same way the animal chapters deal a cast.
  {
    level: 16,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 3,
    snapForgiveness: 1.15,
  },
  {
    level: 17,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.1,
  },
  {
    level: 18,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.1,
  },
  {
    level: 19,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 5,
    snapForgiveness: 1.1,
  },
  {
    level: 20,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 6,
    snapForgiveness: 1.1,
  },

  // Chapter 5: pictures. One hand-drawn scene, cut into a grid of interlocking
  // pieces and rebuilt in the frame it came out of. One picture is one thing to
  // fill however many pieces it took, so every row here stands a single target,
  // as the sliced and polygon chapters do.
  {
    level: 21,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.05,
    options: { grid: { columns: 2, rows: 2 }, scene: "farmyard" },
  },
  {
    level: 22,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.05,
    options: { grid: { columns: 2, rows: 2 }, scene: "rockpool" },
  },
  {
    level: 23,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 6,
    snapForgiveness: 1.05,
    options: { grid: { columns: 3, rows: 2 }, scene: "farmyard" },
  },
  {
    level: 24,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 6,
    snapForgiveness: 1.05,
    options: { grid: { columns: 3, rows: 2 }, scene: "jungle-path" },
  },
  {
    level: 25,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 9,
    snapForgiveness: 1.05,
    options: { grid: { columns: 3, rows: 3 }, scene: "rockpool" },
  },

  // Chapter 6: mastery. The kinds already met, at their busiest, mixed up, and
  // a twelve-piece picture to finish on.
  {
    level: 26,
    chapter: "mastery",
    kind: "shatter",
    // One picture to fill, in six irregular shards. Like a jigsaw, the target
    // is the whole scene and the pieces are the cuts of it.
    targets: 1,
    pieces: 6,
    snapForgiveness: 1,
    options: { scene: "farmyard" },
  },
  {
    level: 27,
    chapter: "mastery",
    kind: "sliced",
    theme: "jungle",
    targets: 2,
    pieces: 8,
    snapForgiveness: 1,
  },
  {
    level: 28,
    chapter: "mastery",
    kind: "shatter",
    targets: 1,
    pieces: 8,
    snapForgiveness: 1,
    options: { scene: "jungle-path" },
  },
  {
    level: 29,
    chapter: "mastery",
    kind: "jigsaw",
    targets: 1,
    pieces: 9,
    snapForgiveness: 1,
    options: { grid: { columns: 3, rows: 3 }, scene: "farmyard" },
  },
  {
    level: 30,
    chapter: "mastery",
    kind: "jigsaw",
    targets: 1,
    pieces: 12,
    snapForgiveness: 1,
    options: { grid: { columns: 4, rows: 3 }, scene: "jungle-path" },
  },
];

export const LEVEL_COUNT = LEVELS.length;

/** The level with this number. Throws rather than showing an empty board. */
export function levelSpec(level: number): LevelSpec {
  const spec = LEVELS[level - 1];
  if (!spec) throw new Error(`No level ${level}; the game is ${LEVEL_COUNT} levels long.`);
  return spec;
}

/**
 * Every level this module vouches for: the thirty themselves. A `LevelSpec` is
 * a plain record, so nothing stops code elsewhere writing one out - and a board
 * composed from an invented level is a board whose difficulty came from
 * somewhere other than the table, which is the one thing the table is for.
 * Membership rather than equality, so a record that merely *looks* like a level
 * of the thirty does not pass for one.
 */
const VOUCHED = new WeakSet<LevelSpec>(LEVELS);

/** Is this one of the thirty? */
export function isVouchedLevel(spec: LevelSpec): boolean {
  return VOUCHED.has(spec);
}

/** Levels are numbered from 1; the level after the last one is the first again. */
export function nextLevel(level: number): number {
  return (level % LEVEL_COUNT) + 1;
}

/** 1-based chapter number, which is also how far into the six the level is. */
export function chapterNumber(spec: LevelSpec): number {
  const index = CHAPTERS.indexOf(spec.chapter);
  if (index < 0) throw new Error(`Level ${spec.level} names an unknown chapter "${spec.chapter}".`);
  return index + 1;
}

/**
 * The pieces of a themed cast, in the order they were given. A piece joins a
 * theme by listing it (`piece.ts`); a piece with no themes at all is in none of
 * them, which is what makes a provider that does not group its pieces simply
 * fall through to the whole cast below.
 */
export function castOf(theme: ThemeId, shapes: readonly PieceShape[]): readonly PieceShape[] {
  return shapes.filter((shape) => shape.themes?.includes(theme));
}

/**
 * Deal this level's pieces: a random subset of the shapes on offer, in a random
 * order. Both matter - which pieces turn up keeps the puzzle fresh, and their
 * order decides which target each one belongs to, so the same piece isn't
 * always on the left.
 *
 * A level with a `theme` is dealt from that theme's cast first. If the theme is
 * too small for the level - a cast half-drawn, or a level asking for a busier
 * board than the theme has animals - the rest of the level is topped up
 * from everything else rather than throwing or dealing a short board. **A
 * mostly-themed level is a far better failure than a broken one**, and the
 * child cannot read the theme's name anywhere on screen to notice.
 *
 * `random` is injectable so a run can be replayed: the same seed deals the same
 * level, which is what `?seed=` and the screenshot run rely on.
 */
export function dealPieces(
  level: LevelSpec,
  shapes: readonly PieceShape[],
  random: () => number = Math.random,
): readonly PieceShape[] {
  return deal(level, level.pieces, shapes, random);
}

/**
 * Deal this level's *targets*: the shapes the holes are cut from. The same deal
 * as `dealPieces`, for the count that says how many things there are to fill.
 *
 * Usually the two are the same number and a kind only needs one of them. A
 * sliced level is where they part company: it deals one or two animals here and
 * cuts each into the slices that fill them, so what goes in the tray is not
 * what the scene is holes for.
 */
export function dealTargets(
  level: LevelSpec,
  shapes: readonly PieceShape[],
  random: () => number = Math.random,
): readonly PieceShape[] {
  return deal(level, level.targets, shapes, random);
}

function deal(
  level: LevelSpec,
  count: number,
  shapes: readonly PieceShape[],
  random: () => number,
): readonly PieceShape[] {
  assertUniquePieceIds(shapes, "dealPieces()");
  if (count > shapes.length) {
    throw new Error(`Level ${level.level} needs ${count} pieces but only ${shapes.length} exist.`);
  }
  if (level.theme === undefined) return shuffle(shapes, random).slice(0, count);

  const themed = shuffle(castOf(level.theme, shapes), random);
  if (themed.length >= count) return themed.slice(0, count);

  // Short of a full board: take the whole theme and make the number up from
  // the rest, then shuffle the two together so the animals that came in to
  // fill the gap are not always the ones at the end of the row.
  const inTheme = new Set(themed);
  const spare = shuffle(
    shapes.filter((shape) => !inTheme.has(shape)),
    random,
  );
  return shuffle([...themed, ...spare].slice(0, count), random);
}
