import "./style.css";
import { loadAnimalShapes } from "./assets";
import { createGame } from "./game";
import { seededRandom } from "./geometry";
import { LEVEL_COUNT } from "./levels";

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
const level = Number.isInteger(asked) && asked >= 1 && asked <= LEVEL_COUNT ? asked : 1;

createGame(
  root,
  loadAnimalShapes(),
  Number.isFinite(seed) && seed !== 0 ? seededRandom(seed) : Math.random,
  level,
);
