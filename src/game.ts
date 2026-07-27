/**
 * Game rules and state.
 *
 * The rules are deliberately simple and forgiving:
 *  - a piece only ever goes into its own hole, so there is no way to put the
 *    wrong animal somewhere and be told off for it;
 *  - dropping near enough counts as in;
 *  - anything else drifts gently back to the tray, never off screen.
 *
 * A game is three stages long: three pieces, then four, then six. The pieces
 * themselves are dealt at random every time a puzzle starts - which ones turn up
 * and where they stand - so a stage never plays out quite the same way twice.
 * Finishing a stage shows one big button that leads to the next one, and the
 * button after the last stage starts the whole game over - so the only way to go
 * is forward and there is never a menu to get lost in.
 *
 * Which pieces are placed, and which tray slot each piece belongs to, lives
 * here and survives a re-layout, so rotating the device mid-puzzle does not
 * lose progress.
 */
import { playFanfare, playPickUp, playReturn, playSnap, unlockAudio } from "./audio";
import { buildBoard, elementFor, setPiecePosition, type Board } from "./board";
import { celebrationBurst, showFinishButton, sparkleBurst } from "./celebrate";
import { enableDragging } from "./drag";
import { boxCenter, isWithinSnapRadius, shuffle, type Point, type Size } from "./geometry";
import {
  STAGE_COUNT,
  chooseLayout,
  holeOf,
  nextStage,
  pickStagePieces,
  type Layout,
} from "./layout";
import type { PieceId, PieceShape } from "./piece";

const SETTLE_MS = 340;

interface PieceState {
  /** Index into the current layout's tray slots. */
  slot: number;
  position: Point;
  placed: boolean;
}

const viewport = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * `shapes` are the pieces the game may deal from; `random` is injectable so a
 * run can be made repeatable - `?seed=` in main.ts uses it. Left alone, every
 * puzzle deals a fresh cast.
 */
export function createGame(
  root: HTMLElement,
  shapes: readonly PieceShape[],
  random: () => number = Math.random,
): void {
  const state = new Map<PieceId, PieceState>();

  let stage = 1;
  // Assigned by the startPuzzle() call at the end of this function, which is
  // what deals the first cast and mounts the first board.
  let cast: readonly PieceShape[] = [];
  let layout!: Layout;
  let board!: Board;
  let complete = false;

  function stateOf(piece: PieceId): PieceState {
    const found = state.get(piece);
    if (!found) throw new Error(`No state for piece "${piece}".`);
    return found;
  }

  const pieceEl = (piece: PieceId): SVGGElement => elementFor(board.pieces, piece);

  const homeOf = (piece: PieceId): Point => layout.traySlots[stateOf(piece).slot] as Point;

  function moveTo(piece: PieceId, position: Point, animated: boolean): void {
    const element = pieceEl(piece);
    element.classList.toggle("is-settling", animated);
    setPiecePosition(element, position);
    stateOf(piece).position = position;
    if (animated) {
      window.setTimeout(() => element.classList.remove("is-settling"), SETTLE_MS);
    }
  }

  /** Push current state into the DOM, e.g. after a fresh puzzle or a re-layout. */
  function render(): void {
    for (const shape of layout.pieces) {
      const current = stateOf(shape.id);
      const target = current.placed ? holeOf(layout, shape.id) : homeOf(shape.id);
      const element = pieceEl(shape.id);
      element.classList.remove("is-dragging", "is-settling");
      element.classList.toggle("is-placed", current.placed);
      elementFor(board.holes, shape.id).style.opacity = current.placed ? "0" : "1";
      setPiecePosition(element, target);
      current.position = target;
    }
  }

  function checkComplete(): void {
    if (complete) return;
    if (!layout.pieces.every((shape) => stateOf(shape.id).placed)) return;

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

  function place(piece: PieceId): void {
    const target = holeOf(layout, piece);
    stateOf(piece).placed = true;
    moveTo(piece, target, true);

    pieceEl(piece).classList.add("is-placed");
    // The piece now covers the hole exactly; hiding it avoids the rim peeking.
    elementFor(board.holes, piece).style.opacity = "0";

    playSnap();
    sparkleBurst(board.fxLayer, boxCenter(target, layout.pieceSize));
    checkComplete();
  }

  /**
   * Deal a fresh puzzle for the current stage: new cast, new board, shuffled
   * tray slots. Both the reset button and moving between stages come through
   * here, so a toddler never sees the same line-up twice in a row for long.
   */
  function startPuzzle(): void {
    complete = false;
    cast = pickStagePieces(stage, shapes, random);
    layout = chooseLayout(viewport(), stage, cast);
    board = mount(layout);
    state.clear();
    const slots = shuffle(
      layout.traySlots.map((_, index) => index),
      random,
    );
    layout.pieces.forEach((shape, index) => {
      state.set(shape.id, {
        slot: slots[index] as number,
        position: { x: 0, y: 0 },
        placed: false,
      });
    });
    render();
  }

  /** Move on to a different stage: new cast, new layout, fresh board. */
  function goToStage(next: number): void {
    stage = next;
    startPuzzle();
  }

  function mount(next: Layout): Board {
    const built = buildBoard(root, next);

    enableDragging(built.stage, next, {
      isDraggable: (piece) => !stateOf(piece).placed,
      getPosition: (piece) => stateOf(piece).position,
      onPickUp: (_piece, element) => {
        unlockAudio();
        element.classList.add("is-dragging");
        element.classList.remove("is-settling");
        // Re-appending raises the piece above its siblings while it is held.
        built.piecesLayer.append(element);
        playPickUp();
      },
      onMove: (piece, position) => moveTo(piece, position, false),
      onDrop: (piece, position) => {
        elementFor(built.pieces, piece).classList.remove("is-dragging");
        const holeCenter = boxCenter(holeOf(layout, piece), layout.pieceSize);
        const dropped = boxCenter(position, layout.pieceSize);
        if (isWithinSnapRadius(dropped, holeCenter, layout.snapRadius)) {
          place(piece);
        } else {
          moveTo(piece, homeOf(piece), true);
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
    const next = chooseLayout(viewport(), stage, cast);
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
