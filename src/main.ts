// Before changing this file, read docs/navigation.md.

import "./style.css";
import { loadAnimalShapes } from "./assets";
import { createGame } from "./game";
import { seededRandom } from "./geometry";
import { applySettings, createGrownUpPanel } from "./grownups";
import { ensureKind, recoverWhenPossible } from "./kinds/registry";
import { LEVEL_COUNT, levelSpec, playableFrom } from "./levels";
import { browserStorage, createProgressStore } from "./progress";
import { startResting } from "./rest";
import { warmAhead } from "./warm";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app container.");
}

const params = new URLSearchParams(window.location.search);

// `?seed=123` makes the cast repeatable, which is what the screenshot run uses
// to compare like with like. Without it every puzzle deals fresh animals.
const seed = Number(params.get("seed"));

/**
 * `?level=17` starts partway along the ramp. It is for whoever is working on
 * the game - the screenshot run uses it to reach the last level without playing
 * the twenty-nine before it - and not a difficulty picker: there is nothing in
 * the game that offers it, and a player who cannot read cannot type a URL. Out
 * of range values are ignored rather than argued with.
 */
const asked = Number(params.get("level"));
const deepLink = Number.isInteger(asked) && asked >= 1 && asked <= LEVEL_COUNT ? asked : null;

/**
 * `?rest=2` sleeps after two *seconds* instead of two minutes. Like `?level=`
 * it is a tool for working on the game rather than a setting: `npm run shot`
 * uses it to watch a real board freeze and wake without waiting two minutes for
 * it, and there is nothing in the game that offers it. Out of range values are
 * ignored rather than argued with.
 */
const restSeconds = Number(params.get("rest"));
const restDelayMs =
  Number.isFinite(restSeconds) && restSeconds > 0 ? restSeconds * 1000 : undefined;

/**
 * A deep link is not the child's own progress, so nothing played from one moves
 * the place they had got to.
 */
const progress = createProgressStore({
  storage: browserStorage(),
  trackLevel: deepLink === null,
});

// What a grown-up set last time, in force before the first sound can play.
applySettings(progress.settings());

/**
 * Nothing on this screen moves while nobody is playing with it. Started here
 * rather than inside the game, because it is the *page* that goes still - the
 * board, whatever celebration is up, and the speakers - and because a game that
 * never got its first chunk should stop drawing too.
 */
startResting(restDelayMs === undefined ? {} : { delayMs: restDelayMs });

/**
 * A deep link wins over the saved level, and leaves it alone: it goes where it
 * says, and nothing played from there moves the place the child had got to. It
 * also ignores the kinds a grown-up has switched off, because it is a tool for
 * looking at a particular level and has to reach the one it names.
 *
 * Without one the game resumes where it was left, or at the start of the ramp
 * when nothing can be stored. A saved level whose kind has been switched off
 * resumes at the next one still in play.
 */
const startLevel = deepLink ?? playableFrom(progress.read().level, progress.settings().kinds);

/**
 * The opening chapters are in this file's own bundle, so a new player starts
 * with nothing to wait for. A child resuming further along gets the chunk their
 * chapter needs before there is a board to draw. See
 * docs/decisions/A chapter is warmed before it is needed, not fetched when it
 * is.md.
 *
 * There is deliberately no retry around this. A browser remembers a dynamic
 * import that failed and will not go near the network for it again, so asking
 * twice cannot work; `recoverWhenPossible` waits for the connection to come
 * back and takes a fresh page instead, which can. Until then the screen is the
 * one a bundle that would not load has always given, which is what this was
 * before it was split.
 */
void ensureKind(levelSpec(startLevel).kind).then(() => {
  const game = createGame(root, loadAnimalShapes(), {
    random: Number.isFinite(seed) && seed !== 0 ? seededRandom(seed) : Math.random,
    startLevel,
    progress,
  });

  // The one way into anything that is not the puzzle, and the only place
  // progress can be cleared. It mounts outside `#app`, which the board replaces
  // wholesale.
  createGrownUpPanel({ progress, game });

  // Everything the rest of the thirty levels needs, fetched while the child
  // plays this one, so no level seam ever waits for the network.
  warmAhead(startLevel);
}, recoverWhenPossible);
