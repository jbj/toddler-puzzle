import "./style.css";
import { loadAnimalShapes } from "./assets";
import { createGame } from "./game";
import { seededRandom } from "./geometry";
import { applySettings, createGrownUpPanel } from "./grownups";
import { LEVEL_COUNT } from "./levels";
import { browserStorage, createProgressStore } from "./progress";

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
 * A deep link wins over the saved level, and leaves it alone: it goes where it
 * says, and nothing played from there moves the place the child had got to.
 * Without one the game resumes where it was left - which is level 1 for a new
 * player, and level 1 again for a browser that will not store anything.
 */
const progress = createProgressStore({
  storage: browserStorage(),
  trackLevel: deepLink === null,
});

// What a grown-up set last time, in force before the first sound can play.
applySettings(progress.settings());

const game = createGame(root, loadAnimalShapes(), {
  random: Number.isFinite(seed) && seed !== 0 ? seededRandom(seed) : Math.random,
  startLevel: deepLink ?? progress.read().level,
  progress,
});

// The one way into anything that is not the puzzle, and the only place progress
// can be cleared. It mounts outside `#app`, which the board replaces wholesale.
createGrownUpPanel({ progress, game });
