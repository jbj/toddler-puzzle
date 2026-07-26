/**
 * Game rules and state.
 *
 * The rules are deliberately simple and forgiving:
 *  - a piece only ever goes into its own hole, so there is no way to put the
 *    wrong animal somewhere and be told off for it;
 *  - dropping near enough counts as in;
 *  - anything else drifts gently back to the tray, never off screen.
 *
 * A game is three stages long: three animals, then four, then six. Finishing a
 * stage shows one big button that leads to the next one, and the button after
 * the last stage starts the whole game over - so the only way to go is forward
 * and there is never a menu to get lost in.
 *
 * Which pieces are placed, and which tray slot each piece belongs to, lives
 * here and survives a re-layout, so rotating the device mid-puzzle does not
 * lose progress.
 */
import { loadAnimals, type AnimalArt, type AnimalId } from "./assets";
import { playFanfare, playPickUp, playReturn, playSnap, unlockAudio } from "./audio";
import { buildBoard, elementFor, setPiecePosition, type Board } from "./board";
import { celebrationBurst, clearEffects, showFinishButton, sparkleBurst } from "./celebrate";
import { enableDragging } from "./drag";
import { boxCenter, isWithinSnapRadius, shuffle, type Point, type Size } from "./geometry";
import { STAGE_COUNT, chooseLayout, holeOf, nextStage, type Layout } from "./layout";

const SETTLE_MS = 340;

interface PieceState {
  /** Index into the current layout's tray slots. */
  slot: number;
  position: Point;
  placed: boolean;
}

const viewport = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

export function createGame(root: HTMLElement): void {
  const animals: Record<AnimalId, AnimalArt> = loadAnimals();
  const state = new Map<AnimalId, PieceState>();

  let stage = 1;
  let layout: Layout = chooseLayout(viewport(), stage);
  let board: Board = mount(layout);
  let complete = false;

  function stateOf(animal: AnimalId): PieceState {
    const piece = state.get(animal);
    if (!piece) throw new Error(`No state for animal "${animal}".`);
    return piece;
  }

  const pieceEl = (animal: AnimalId): SVGGElement => elementFor(board.pieces, animal);

  const homeOf = (animal: AnimalId): Point =>
    layout.traySlots[stateOf(animal).slot] as Point;

  function moveTo(animal: AnimalId, position: Point, animated: boolean): void {
    const element = pieceEl(animal);
    element.classList.toggle("is-settling", animated);
    setPiecePosition(element, position);
    stateOf(animal).position = position;
    if (animated) {
      window.setTimeout(() => element.classList.remove("is-settling"), SETTLE_MS);
    }
  }

  /** Push current state into the DOM, e.g. after a fresh puzzle or a re-layout. */
  function render(): void {
    for (const animal of layout.animals) {
      const piece = stateOf(animal);
      const target = piece.placed ? holeOf(layout, animal) : homeOf(animal);
      const element = pieceEl(animal);
      element.classList.remove("is-dragging", "is-settling");
      element.classList.toggle("is-placed", piece.placed);
      elementFor(board.holes, animal).style.opacity = piece.placed ? "0" : "1";
      setPiecePosition(element, target);
      piece.position = target;
    }
  }

  function checkComplete(): void {
    if (complete) return;
    if (!layout.animals.every((animal) => stateOf(animal).placed)) return;

    complete = true;
    const last = stage === STAGE_COUNT;
    // Let the last snap chime land before the fanfare starts.
    window.setTimeout(() => {
      playFanfare(last);
      celebrationBurst(board.fxLayer, layout);
      showFinishButton(board.fxLayer, layout, last ? "again" : "next", () =>
        goToStage(nextStage(stage)),
      );
    }, 260);
  }

  function place(animal: AnimalId): void {
    const target = holeOf(layout, animal);
    stateOf(animal).placed = true;
    moveTo(animal, target, true);

    pieceEl(animal).classList.add("is-placed");
    // The piece now covers the hole exactly; hiding it avoids the rim peeking.
    elementFor(board.holes, animal).style.opacity = "0";

    playSnap();
    sparkleBurst(board.fxLayer, boxCenter(target, layout.pieceSize));
    checkComplete();
  }

  /** Deal this stage's animals into shuffled tray slots and draw them there. */
  function startPuzzle(): void {
    complete = false;
    clearEffects(board.fxLayer);
    state.clear();
    const slots = shuffle(layout.traySlots.map((_, index) => index));
    layout.animals.forEach((animal, index) => {
      state.set(animal, { slot: slots[index] as number, position: { x: 0, y: 0 }, placed: false });
    });
    render();
  }

  /** Move on to a different stage: new animal set, new layout, fresh board. */
  function goToStage(next: number): void {
    stage = next;
    layout = chooseLayout(viewport(), stage);
    board = mount(layout);
    startPuzzle();
  }

  function mount(next: Layout): Board {
    const built = buildBoard(root, animals, next);

    enableDragging(built.stage, next, {
      isDraggable: (animal) => !stateOf(animal).placed,
      getPosition: (animal) => stateOf(animal).position,
      onPickUp: (_animal, element) => {
        unlockAudio();
        element.classList.add("is-dragging");
        element.classList.remove("is-settling");
        // Re-appending raises the piece above its siblings while it is held.
        built.piecesLayer.append(element);
        playPickUp();
      },
      onMove: (animal, position) => moveTo(animal, position, false),
      onDrop: (animal, position) => {
        elementFor(built.pieces, animal).classList.remove("is-dragging");
        const holeCenter = boxCenter(holeOf(layout, animal), layout.pieceSize);
        const dropped = boxCenter(position, layout.pieceSize);
        if (isWithinSnapRadius(dropped, holeCenter, layout.snapRadius)) {
          place(animal);
        } else {
          moveTo(animal, homeOf(animal), true);
          playReturn();
        }
      },
    });

    built.resetButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      unlockAudio();
      startPuzzle();
    });

    return built;
  }

  /** Rebuild for a new orientation, keeping progress intact. */
  function relayout(): void {
    const next = chooseLayout(viewport(), stage);
    if (next.id === layout.id) return;
    layout = next;
    board = mount(layout);
    render();
    if (complete) {
      const last = stage === STAGE_COUNT;
      celebrationBurst(board.fxLayer, layout);
      showFinishButton(board.fxLayer, layout, last ? "again" : "next", () =>
        goToStage(nextStage(stage)),
      );
    }
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 150);
  });

  startPuzzle();
}
