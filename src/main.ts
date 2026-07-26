import "./style.css";
import { createGame } from "./game";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app container.");
}

createGame(root);
