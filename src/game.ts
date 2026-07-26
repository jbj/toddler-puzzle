/**
 * Game rules and state.
 *
 * The rules are deliberately simple and forgiving:
 *  - a piece only ever goes into its own hole, so there is no way to put the
 *    wrong animal somewhere and be told off for it;
 *  - dropping near enough counts as in;
 *  - anything else drifts gently back to the tray, never off screen.
 *
 * State (which pieces are placed, and which tray slot each piece belongs to)
 * lives here and survives a re-layout, so rotating the device mid-puzzle does
 * not lose progress.
 */
import { ANIMAL_IDS, loadAnimals, type AnimalArt, type AnimalId } from "./assets";
import { playFanfare, playPickUp, playReturn, playSnap, unlockAudio } from "./audio";
import { buildBoard, setPiecePosition, type Board } from "./board";
import { celebrationBurst, clearEffects, showPlayAgain, sparkleBurst } from "./celebrate";
import { enableDragging } from "./drag";
import { boxCenter, isWithinSnapRadius, shuffle, type Point, type Size } from "./geometry";
import { PIECE_SIZE, SNAP_RADIUS, chooseLayout, type Layout } from "./layout";

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

  let layout: Layout = chooseLayout(viewport());
  let board: Board = mount(layout);
  let complete = false;

  function stateOf(animal: AnimalId): PieceState {
    const piece = state.get(animal);
    if (!piece) throw new Error(`No state for animal "${animal}".`);
    return piece;
  }

  const homeOf = (animal: AnimalId): Point =>
    layout.traySlots[stateOf(animal).slot] as Point;

  function moveTo(animal: AnimalId, position: Point, animated: boolean): void {
    const element = board.pieces[animal];
    element.classList.toggle("is-settling", animated);
    setPiecePosition(element, position);
    stateOf(animal).position = position;
    if (animated) {
      window.setTimeout(() => element.classList.remove("is-settling"), SETTLE_MS);
    }
  }

  /** Push current state into the DOM, e.g. after a fresh round or a re-layout. */
  function render(): void {
    for (const animal of ANIMAL_IDS) {
      const piece = stateOf(animal);
      const target = piece.placed ? layout.holes[animal] : homeOf(animal);
      const element = board.pieces[animal];
      element.classList.remove("is-dragging", "is-settling");
      element.classList.toggle("is-placed", piece.placed);
      board.holes[animal].style.opacity = piece.placed ? "0" : "1";
      setPiecePosition(element, target);
      piece.position = target;
    }
  }

  function checkComplete(): void {
    if (complete) return;
    if (!ANIMAL_IDS.every((animal) => stateOf(animal).placed)) return;

    complete = true;
    // Let the last snap chime land before the fanfare starts.
    window.setTimeout(() => {
      playFanfare();
      celebrationBurst(board.fxLayer, layout);
      showPlayAgain(board.fxLayer, layout, startRound);
    }, 260);
  }

  function place(animal: AnimalId): void {
    const target = layout.holes[animal];
    stateOf(animal).placed = true;
    moveTo(animal, target, true);

    board.pieces[animal].classList.add("is-placed");
    // The piece now covers the hole exactly; hiding it avoids the rim peeking.
    board.holes[animal].style.opacity = "0";

    playSnap();
    sparkleBurst(board.fxLayer, boxCenter(target, PIECE_SIZE));
    checkComplete();
  }

  function startRound(): void {
    complete = false;
    clearEffects(board.fxLayer);
    const slots = shuffle(layout.traySlots.map((_, index) => index));
    ANIMAL_IDS.forEach((animal, index) => {
      const slot = slots[index] as number;
      const existing = state.get(animal);
      if (existing) {
        existing.slot = slot;
        existing.placed = false;
      } else {
        state.set(animal, { slot, position: { x: 0, y: 0 }, placed: false });
      }
    });
    render();
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
        built.pieces[animal].classList.remove("is-dragging");
        const holeCenter = boxCenter(layout.holes[animal], PIECE_SIZE);
        if (isWithinSnapRadius(boxCenter(position, PIECE_SIZE), holeCenter, SNAP_RADIUS)) {
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
      startRound();
    });

    return built;
  }

  /** Rebuild for a new orientation, keeping progress intact. */
  function relayout(): void {
    const next = chooseLayout(viewport());
    if (next.id === layout.id) return;
    layout = next;
    board = mount(layout);
    render();
    if (complete) {
      celebrationBurst(board.fxLayer, layout);
      showPlayAgain(board.fxLayer, layout, startRound);
    }
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 150);
  });

  startRound();
}
