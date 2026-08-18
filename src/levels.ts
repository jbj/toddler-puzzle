/**
 * Before changing this file, read docs/puzzle-kinds.md.
 *
 * The thirty levels, and the deal.
 *
 * This is the one file that tunes the difficulty curve. A level is a record
 * rather than code: which kind of puzzle it is, how many things there are to
 * fill, how many pieces fill them, and how forgiving a drop of one of them is.
 * Nothing here places a piece or draws anything - the kind does that, and the
 * layout is composed around whatever the deal produced.
 *
 * The ramp runs in five chapters of six, from one huge animal to drag to a
 * two-year-old assembling a picture:
 *
 * | Levels | Chapter | What it is |
 * | --- | --- | --- |
 * | 1-6 | Animals | Shape-match, one piece growing to six, themed casts |
 * | 7-12 | Sliced animals | One or two animals, each cut into two to four slices |
 * | 13-18 | Shapes | Polygon and tangram scenes |
 * | 19-24 | Pictures | Jigsaw, 2x2 growing to 3x3 |
 * | 25-30 | Mastery | 4x3 jigsaw, irregular partitions, mixed kinds |
 *
 * **The table says what kind, how many, and which cast; never which pieces.**
 * Which animals turn up and the order they stand in are dealt fresh every time
 * a level starts (`dealPieces`), narrowed to the level's `theme` where it names
 * one, which is what keeps the game from going stale after three plays.
 * `?seed=` replays a deal exactly by handing the same `random` in.
 *
 * **A level is its kind, its subject and its size, and no two levels are all
 * three.** The subject is whatever the row names - the theme, the scene, the
 * shape picture - so that no two levels being the same puzzle is
 * something a reader can check by looking down the table, and a test holds it.
 * A picture may come back at another size, because a scene cut four ways and
 * the same scene cut nine ways are two different things to solve; the same
 * picture at the same size twice is a level nobody chose.
 *
 * Every kind this table names is built and registered (`kinds/registry.ts`),
 * and the tests hold the two to each other.
 *
 * **A grown-up can take a kind out.** The panel (`grownups.ts`) carries a switch
 * per `PuzzleKindId`, so thirty levels can be narrowed to the ones the child in
 * front of it can do. That never edits the table: the rows stand as they are and
 * the ones whose kind is switched off are stepped over, by `nextLevel` and the
 * handful of functions beside it that all take the same optional `EnabledKinds`.
 * Nothing that does not care about the setting has to know it exists.
 */
import { shuffle } from "./geometry";
import { assertUniquePieceIds, type PieceShape } from "./piece";
import type { ThemeId } from "./themes";

/** A run of six levels. Chapters are what a celebration is hung on later. */
export type ChapterId = "animals" | "sliced-animals" | "shapes" | "pictures" | "mastery";

/**
 * The chapters in play order. A chapter is six levels long, so a level's
 * chapter is also a way of asking how far into the thirty it is.
 */
export const CHAPTERS: readonly ChapterId[] = [
  "animals",
  "sliced-animals",
  "shapes",
  "pictures",
  "mastery",
];

/**
 * Every kind of puzzle the ramp names, in the order the ramp introduces them.
 * Each one is registered by the kind that implements it (`kinds/registry.ts`),
 * and a level naming one that is not is a mistake the tests catch.
 *
 * It is a list rather than a bare union because a grown-up can switch a kind
 * off (`EnabledKinds`), and the panel that offers that has to be able to walk
 * the kinds without being told them a second time - a sixth kind added to the
 * union but forgotten in the panel would be a kind nobody could turn off.
 */
export const PUZZLE_KINDS = ["shape-match", "sliced", "polygon", "jigsaw", "shatter"] as const;

export type PuzzleKindId = (typeof PUZZLE_KINDS)[number];

/**
 * Which kinds of puzzle are in play, as a grown-up left them (#8). Thirty
 * levels have to suit one particular child, and a two-year-old who cannot yet
 * do jigsaws should not meet six of them: a kind switched off here is skipped
 * wherever it appears, so the game goes on running forward through the levels
 * that are left.
 *
 * Every function here takes it as an option and treats an absent one as "all
 * of them", so nothing that does not care about the setting has to know it
 * exists. **An all-off record is read as all-on** - see `playableLevels` - so
 * there is always a game to play whatever is in storage.
 */
export type EnabledKinds = Readonly<Record<PuzzleKindId, boolean>>;

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
   * Which shape picture a polygon level stands (`scenes.ts`). A key of its own
   * rather than `scene`, because the two name different catalogues: `scene` is
   * a hand-drawn picture from `pictures.ts` that gets cut into pieces, and the
   * art check reads the table for that word to know what to rasterise.
   */
  readonly shapePicture?: string;
}

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
   * Grows the box a piece is placed by (`onTarget` in `layout.ts`) about its
   * own centre. Never below 1: the piece's own box - half a piece out, on
   * either axis - is the floor the whole game is forgiving at, and this only
   * ever makes an early level more forgiving still. See
   * docs/decisions/One box measures a piece, and one rule places it.md
   * and
   * docs/decisions/Keep snapping generous and owned.md.
   */
  readonly snapForgiveness: number;
  readonly options?: LevelOptions;
}

/** The floor for `snapForgiveness`: never tighter than the piece's own box. */
export const MIN_SNAP_FORGIVENESS = 1;

/**
 * The ceiling for `snapForgiveness`. A box grown past this starts to reach a
 * neighbouring target on a busy board, which would let a piece snap into
 * somebody else's place - the one thing the game may never do.
 */
export const MAX_SNAP_FORGIVENESS = 1.5;

/**
 * The curve. Read down the `pieces` and `snapForgiveness` columns to see it:
 * the board fills up as the ramp climbs, and the forgiveness that carries a
 * child through their first drags eases back to the standard two thirds of a
 * piece by the last chapter.
 */
export const LEVELS: readonly LevelSpec[] = [
  // Chapter 1: animals. The game opens on the easiest drag it can ask for - one
  // huge animal, one huge hole, and the whole cast to deal it from - and grows
  // an animal a level to a full board. The first two deal from everything,
  // because a theme is a promise about a boardful and one animal is not one.
  {
    level: 1,
    chapter: "animals",
    kind: "shape-match",
    targets: 1,
    pieces: 1,
    snapForgiveness: 1.5,
  },
  {
    level: 2,
    chapter: "animals",
    kind: "shape-match",
    targets: 2,
    pieces: 2,
    snapForgiveness: 1.45,
  },
  {
    level: 3,
    chapter: "animals",
    kind: "shape-match",
    theme: "farm",
    targets: 3,
    pieces: 3,
    snapForgiveness: 1.4,
  },
  {
    level: 4,
    chapter: "animals",
    kind: "shape-match",
    theme: "jungle",
    targets: 4,
    pieces: 4,
    snapForgiveness: 1.35,
  },
  {
    level: 5,
    chapter: "animals",
    kind: "shape-match",
    theme: "farm",
    targets: 5,
    pieces: 5,
    snapForgiveness: 1.3,
  },
  {
    level: 6,
    chapter: "animals",
    kind: "shape-match",
    theme: "sea",
    targets: 6,
    pieces: 6,
    snapForgiveness: 1.25,
  },

  // Chapter 2: sliced animals. The same silhouettes, one degree harder: a
  // target holds several slices, so `targets` and `pieces` part company. It
  // opens on the gentlest form of that - one animal in two halves - twice over,
  // because the idea is new even where the animals are not.
  {
    level: 7,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "sea",
    targets: 1,
    pieces: 2,
    snapForgiveness: 1.2,
  },
  {
    level: 8,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "farm",
    targets: 1,
    pieces: 2,
    snapForgiveness: 1.2,
  },
  {
    level: 9,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "jungle",
    targets: 1,
    pieces: 3,
    snapForgiveness: 1.2,
  },
  {
    level: 10,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "sea",
    targets: 2,
    pieces: 4,
    snapForgiveness: 1.15,
  },
  {
    level: 11,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "jungle",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.15,
  },
  {
    level: 12,
    chapter: "sliced-animals",
    kind: "sliced",
    theme: "farm",
    targets: 2,
    pieces: 6,
    snapForgiveness: 1.15,
  },

  // Chapter 3: shapes. One picture - a house, a boat, a car - built out of
  // plain coloured shapes, so every level here stands a single target and deals
  // the shapes it takes. Which picture is the row's business rather than the
  // deal's: a level names it, the way a jigsaw level names the scene it cuts
  // up, so no two levels of the chapter can turn out to be the same puzzle.
  // The catalogue holds more pictures than the chapter has room for; the spares
  // are there to retune it with.
  {
    level: 13,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 3,
    snapForgiveness: 1.15,
    options: { shapePicture: "house" },
  },
  {
    level: 14,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 3,
    snapForgiveness: 1.1,
    options: { shapePicture: "boat" },
  },
  {
    level: 15,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.1,
    options: { shapePicture: "car" },
  },
  {
    level: 16,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 5,
    snapForgiveness: 1.1,
    options: { shapePicture: "butterfly" },
  },
  {
    level: 17,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 6,
    snapForgiveness: 1.1,
    options: { shapePicture: "train" },
  },
  {
    level: 18,
    chapter: "shapes",
    kind: "polygon",
    targets: 1,
    pieces: 6,
    snapForgiveness: 1.1,
    options: { shapePicture: "sunflower" },
  },

  // Chapter 4: pictures. One hand-drawn scene, cut into a grid of interlocking
  // pieces and rebuilt in the frame it came out of. One picture is one thing to
  // fill however many pieces it took, so every row here stands a single target,
  // as the sliced and polygon chapters do.
  {
    level: 19,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.05,
    options: { grid: { columns: 2, rows: 2 }, scene: "farmyard" },
  },
  {
    level: 20,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 4,
    snapForgiveness: 1.05,
    options: { grid: { columns: 2, rows: 2 }, scene: "rockpool" },
  },
  {
    level: 21,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 6,
    snapForgiveness: 1.05,
    options: { grid: { columns: 3, rows: 2 }, scene: "night-sky" },
  },
  {
    level: 22,
    chapter: "pictures",
    kind: "jigsaw",
    targets: 1,
    pieces: 6,
    snapForgiveness: 1.05,
    options: { grid: { columns: 3, rows: 2 }, scene: "jungle-path" },
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
    pieces: 9,
    snapForgiveness: 1.05,
    options: { grid: { columns: 3, rows: 3 }, scene: "rockpool" },
  },

  // Chapter 5: mastery. The kinds already met, at their busiest, mixed up, and
  // a twelve-piece picture to finish on.
  {
    level: 25,
    chapter: "mastery",
    kind: "shatter",
    // One picture to fill, in six irregular shards. Like a jigsaw, the target
    // is the whole scene and the pieces are the cuts of it.
    targets: 1,
    pieces: 6,
    snapForgiveness: 1,
    options: { scene: "rockpool" },
  },
  {
    level: 26,
    chapter: "mastery",
    kind: "shatter",
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

/**
 * The levels a grown-up has left in play, in order.
 *
 * The whole thirty when nothing is switched off, which is what every caller
 * that does not know about the setting gets. **And the whole thirty when
 * everything is switched off**, because the alternative is a game with no
 * levels in it: the panel already refuses to turn the last kind off, and this
 * is the second answer to the same question, for a record that arrived from
 * storage rather than from the panel.
 */
export function playableLevels(enabled?: EnabledKinds): readonly LevelSpec[] {
  if (!enabled) return LEVELS;
  const kept = LEVELS.filter((level) => enabled[level.kind]);
  return kept.length > 0 ? kept : LEVELS;
}

/** Would this level be dealt, as the kinds stand? */
export function isPlayable(level: number, enabled?: EnabledKinds): boolean {
  return playableLevels(enabled).some((spec) => spec.level === level);
}

/**
 * This level if it is in play, else the next one that is, wrapping round.
 *
 * Where a level number that came from somewhere other than play is turned into
 * a level to deal: the one resumed from storage, and the one a child is sitting
 * on when the kind under them is switched off.
 */
export function playableFrom(level: number, enabled?: EnabledKinds): number {
  const playable = playableLevels(enabled);
  return (playable.find((spec) => spec.level >= level) ?? playable[0])?.level ?? 1;
}

/**
 * Levels are numbered from 1; the level after the last one is the first again,
 * so the only way the child can go is forward. Kinds a grown-up has switched
 * off are stepped over rather than dealt, which is the one thing that setting
 * does to the shape of the game.
 */
export function nextLevel(level: number, enabled?: EnabledKinds): number {
  const playable = playableLevels(enabled);
  return (playable.find((spec) => spec.level > level) ?? playable[0])?.level ?? 1;
}

/**
 * The last level of the set, which gets the finale and the replay arrow. With
 * a kind switched off that is not necessarily level 30 - the end of the game is
 * the end of what is being played, not the end of the table.
 */
export function isLastPlayable(level: number, enabled?: EnabledKinds): boolean {
  return playableLevels(enabled).at(-1)?.level === level;
}

/** 1-based chapter number, which is also how far into the five the level is. */
export function chapterNumber(spec: LevelSpec): number {
  const index = CHAPTERS.indexOf(spec.chapter);
  if (index < 0) throw new Error(`Level ${spec.level} names an unknown chapter "${spec.chapter}".`);
  return index + 1;
}

/**
 * Is this the last level of its chapter? True at 6, 12, 18, 24 and 30 as the
 * table stands, and the moment a chapter celebration is hung on
 * (`celebration.ts`).
 *
 * Read off the table rather than written down as a list of level numbers, so
 * retuning the ramp - a chapter of seven, a thirty-fifth level - moves the
 * celebrations with it instead of leaving them stranded mid-chapter. A level
 * the table does not have ends nothing, rather than throwing: a number out of
 * range has already been dealt with by the time anything asks this, and a
 * celebration is not worth a crash.
 *
 * Asked with the kinds a grown-up has left on, it means the same thing about
 * the game actually being played: the last level *in play* of its chapter, and
 * the last one of all whatever number it carries. A child who never meets a
 * jigsaw should still get the party at the end of every chapter they do meet.
 */
export function endsChapter(level: number, enabled?: EnabledKinds): boolean {
  if (level < 1 || level > LEVEL_COUNT) return false;
  const ahead = playableLevels(enabled).find((spec) => spec.level > level);
  if (!ahead) return true;
  return levelSpec(level).chapter !== ahead.chapter;
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
