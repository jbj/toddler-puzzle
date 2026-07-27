import "./style.css";
import { loadAnimalShapes } from "./assets";
import { createGame } from "./game";
import { seededRandom } from "./geometry";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app container.");
}

// `?seed=123` makes the cast repeatable, which is what the screenshot run uses
// to compare like with like. Without it every puzzle deals fresh animals.
const seed = Number(new URLSearchParams(window.location.search).get("seed"));
createGame(
  root,
  loadAnimalShapes(),
  Number.isFinite(seed) && seed !== 0 ? seededRandom(seed) : Math.random,
);
