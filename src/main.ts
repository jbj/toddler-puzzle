import "./style.css";
import { loadAnimalShapes } from "./assets";
import { createGame } from "./game";
import { seededRandom } from "./geometry";
import { applySettings, createGrownUpPanel } from "./grownups";
import { ensureKind } from "./kinds/registry";
import { LEVEL_COUNT, levelSpec } from "./levels";
import { browserStorage, createProgressStore } from "./progress";
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

const startLevel = deepLink ?? progress.read().level;

/**
 * Chapters 1 and 2 are in this file's own bundle, so a new player starts with
 * nothing to wait for. A child resuming further along needs the chunk their
 * chapter is in before there is a board to draw, and gets it here - which is
 * still less to download than the single bundle this used to be. See
 * [decision 20260729T223500](../docs/decisions/20260729T223500-a-chapter-is-warmed-before-it-is-needed.md).
 *
 * A fetch that fails is tried again rather than left as a blank screen. If it
 * will not come at all there is nothing to draw and nothing to be done, which
 * is what a bundle that would not load has always meant.
 */
async function kindForStart(attempts = 3): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureKind(levelSpec(startLevel).kind);
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resume) => window.setTimeout(resume, 300 * attempt));
    }
  }
}

void kindForStart().then(() => {
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
});
