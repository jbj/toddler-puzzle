/**
 * The host the puzzle kinds plug into.
 *
 * This file owns everything that is the same whatever sort of level is being
 * played: picking a piece up, following the finger, settling it back down,
 * sound, sparkles, and the level lifecycle. It owns no rules. Which pieces are
 * dealt, what sits behind them, whether a drop counts and when a level is over
 * all come from the `PuzzleKind` (see `puzzle.ts`), and which kind plays a
 * given level comes from the level table by way of the registry. The host
 * cannot tell one kind from another.
 *
 * Not every level is dragged. A kind that implements `play` is handed a layer
 * and answers the finger itself, and the host then builds no tray pieces and
 * starts no drag engine for it - the first chapter's bubbles and peekaboo are
 * that. Everything after the touch is the host's again: the sparkle, the level
 * ending, the button onwards.
 *
 * What the host does insist on is that the game stays forgiving: a drop the
 * kind refuses drifts gently back to the tray with a soft tone, never off
 * screen and never a buzzer.
 *
 * A game is thirty levels long, in six chapters of five (`levels.ts`). Every
 * level is dealt fresh, so it never plays out quite the same way twice.
 * Finishing a level shows one big button that leads to the next one, and the
 * button after the last level starts the whole game over - so the only way the
 * child can go is forward, and there is never a menu to get lost in. Thirty
 * levels is more than one sitting, so the host tells `progress.ts` which level
 * is being played and the next visit starts there. A grown-up can steer, from
 * the panel in `grownups.ts`, which is what the returned `GameHandle` is for;
 * nothing on the play surface offers it.
 *
 * Which tray slot each piece belongs to lives here and survives a re-layout, so
 * rotating the device mid-puzzle does not lose progress.
 */
import { playFanfare, playPickUp, playReturn, playSnap, unlockAudio } from "./audio";
import { buildBoard, elementFor, setPiecePosition, type Board } from "./board";
import { celebrationBurst, showFinishButton, sparkleBurst } from "./celebrate";
import { enableDragging } from "./drag";
import { boxCenter, type Point, type Size } from "./geometry";
import { kindFor } from "./kinds/registry";
import { boxOf, chooseLayout, trayHome, type Layout } from "./layout";
import { LEVEL_COUNT, levelSpec, nextLevel, type LevelSpec } from "./levels";
import type { PieceId, PieceShape } from "./piece";
import { createProgressStore, type ProgressStore } from "./progress";
import type { Puzzle, PuzzleKind } from "./puzzle";

const SETTLE_MS = 340;

interface PieceState {
  position: Point;
}

const viewport = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

export interface GameOptions {
  /**
   * Injectable so a run can be made repeatable - `?seed=` in main.ts uses it -
   * and left alone every puzzle deals a fresh cast.
   */
  readonly random?: () => number;
  /**
   * Where the game begins: level 1 for a new player, the level they stopped on
   * for one coming back, and whatever `?level=` said for whoever is working on
   * the game. Which of those it is, is main.ts's business rather than the
   * host's.
   */
  readonly startLevel?: number;
  /**
   * Where "the level they stopped on" is kept. The host tells it which level is
   * being played and never reads it back: resuming is a decision taken once, at
   * boot, in main.ts. Left out, a game remembers nothing beyond this sitting.
   */
  readonly progress?: ProgressStore;
}

/**
 * How the level being played was arrived at. The two are the same board dealt
 * the same way, and differ only in what they mean for what is remembered: a
 * level played through is where the child has got to, and a level chosen from
 * the grown-up panel's map is not.
 */
type Arrival = "played" | "chosen";

/** What the shell around the game can ask of it once it is running. */
export interface GameHandle {
  /**
   * Deal a level a grown-up picked out of the panel's level map. The only
   * caller is `grownups.ts`; play itself moves on by its own finish button.
   */
  chooseLevel(level: number): void;
  /** The level on the board now, which the panel's map marks as current. */
  currentLevel(): number;
}

/** `shapes` are the pieces a kind may deal from. */
export function createGame(
  root: HTMLElement,
  shapes: readonly PieceShape[],
  options: GameOptions = {},
): GameHandle {
  const random = options.random ?? Math.random;
  const progress = options.progress ?? createProgressStore({ storage: null });
  const state = new Map<PieceId, PieceState>();

  let levelNumber = options.startLevel ?? 1;
  /**
   * How this level was arrived at, kept so that re-dealing it - the reset
   * button - records it the same way the first deal did.
   */
  let arrival: Arrival = "played";
  // Assigned by the startPuzzle() call at the end of this function, which is
  // what resolves the first level, deals it and mounts the first board.
  let kind!: PuzzleKind;
  let level!: LevelSpec;
  let puzzle!: Puzzle;
  let layout!: Layout;
  let board!: Board;
  let complete = false;
  /**
   * How to take down the activity of a level played by touch, if there is one.
   * A board that is replaced - a new level, a re-deal, a turned tablet - has to
   * let go of whatever the kind armed, or a level's bubbles would go on
   * arriving over the top of the next one.
   */
  let stopActivity: (() => void) | null = null;

  /** The last level of the set gets the fanfare and the replay arrow. */
  const isLastLevel = (): boolean => levelNumber === LEVEL_COUNT;

  function stateOf(piece: PieceId): PieceState {
    const found = state.get(piece);
    if (!found) throw new Error(`No state for piece "${piece}".`);
    return found;
  }

  const pieceEl = (piece: PieceId): SVGGElement => elementFor(board.pieces, piece);

  const isPlaced = (piece: PieceId): boolean => puzzle.placed.has(piece);

  const homeOf = (piece: PieceId): Point => trayHome(layout, piece);

  const restingPlace = (piece: PieceId): Point =>
    isPlaced(piece) ? kind.target(puzzle, layout, piece) : homeOf(piece);

  function moveTo(piece: PieceId, position: Point, animated: boolean): void {
    const element = pieceEl(piece);
    element.classList.toggle("is-settling", animated);
    setPiecePosition(element, position);
    stateOf(piece).position = position;
    if (animated) {
      window.setTimeout(() => element.classList.remove("is-settling"), SETTLE_MS);
    }
  }

  /**
   * The kind draws everything behind the pieces, so a filled target can look
   * different from an empty one. Redrawn whenever the puzzle moves on.
   */
  function renderBackdrop(): void {
    board.backdropLayer.innerHTML = kind.backdrop(puzzle, layout);
  }

  /** Push current state into the DOM, e.g. after a fresh puzzle or a re-layout. */
  function render(): void {
    renderBackdrop();
    // A level played by touch has no pieces on the board to place: what there
    // is to see, the kind drew for itself when the board was mounted.
    if (kind.play) return;
    for (const shape of puzzle.pieces) {
      const element = pieceEl(shape.id);
      const target = restingPlace(shape.id);
      element.classList.remove("is-dragging", "is-settling");
      element.classList.toggle("is-placed", isPlaced(shape.id));
      setPiecePosition(element, target);
      stateOf(shape.id).position = target;
    }
  }

  function checkComplete(): void {
    if (complete || !kind.isComplete(puzzle)) return;

    complete = true;
    const last = isLastLevel();
    // Let the last snap chime land before the fanfare starts.
    window.setTimeout(() => {
      playFanfare(last);
      celebrationBurst(board.fxLayer, layout);
      showFinishButton(board.fxLayer, layout, last ? "again" : "next", () =>
        goToLevel(nextLevel(levelNumber)),
      );
    }, 260);
  }

  /** Settle an accepted piece where the kind says it belongs. */
  function place(piece: PieceId): void {
    puzzle.placed.add(piece);
    const target = kind.target(puzzle, layout, piece);
    moveTo(piece, target, true);
    pieceEl(piece).classList.add("is-placed");
    renderBackdrop();

    playSnap();
    // On the piece's own drawing rather than the middle of the box it carries.
    // For an animal those are the same point; for a piece of a bigger picture -
    // a slice, a shape, a jigsaw piece - the box is the whole picture, and its
    // middle is nowhere near the corner piece that just went in.
    const { ink } = boxOf(layout, piece);
    sparkleBurst(board.fxLayer, boxCenter({ x: target.x + ink.x, y: target.y + ink.y }, ink));
    checkComplete();
  }

  /**
   * Deal the current level afresh: whoever plays it, new pieces, new board,
   * new order in the tray. Both the reset button and moving between levels come
   * through here, so a toddler never sees the same line-up twice in a row for
   * long.
   *
   * It is also the one place the level being played is recorded, which is what
   * makes coming back tomorrow land on the right board. Re-dealing the same
   * level writes nothing, so the reset button stays what it is: a fresh puzzle,
   * never a change to how far the child has got. A level a grown-up chose from
   * the panel is recorded as somewhere the child is rather than somewhere they
   * reached, so reading the level map never fills the level map in.
   */
  function startPuzzle(): void {
    complete = false;
    if (arrival === "chosen") progress.jumpToLevel(levelNumber);
    else progress.reachLevel(levelNumber);
    level = levelSpec(levelNumber);
    kind = kindFor(level);
    puzzle = kind.deal({ level, shapes }, random);
    layout = chooseLayout(viewport(), level, puzzle.pieces, puzzle.targets);
    board = mount(layout);
    state.clear();
    // Where a piece waits is settled by the deal rather than shuffled here: a
    // tray cell is cut for the piece that stands in it, so the two cannot be
    // dealt separately. Every kind deals its pieces in a random order.
    for (const shape of puzzle.pieces) {
      state.set(shape.id, { position: { x: 0, y: 0 } });
    }
    render();
  }

  /** Move on to a different level: new deal, new layout, fresh board. */
  function goToLevel(next: number, how: Arrival = "played"): void {
    levelNumber = next;
    arrival = how;
    startPuzzle();
  }

  function mount(next: Layout): Board {
    // Whatever the last board armed goes now, before the DOM it was drawing
    // into is replaced.
    stopActivity?.();
    stopActivity = null;

    const touched = kind.play !== undefined;
    const built = buildBoard(root, next, { pieces: !touched });

    if (!touched) {
      enableDragging(built.stage, next, {
        isDraggable: (piece) => !isPlaced(piece),
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
          if (kind.accepts(puzzle, layout, piece, position)) {
            // The drop point is the last the kind hears of where the finger was;
            // a kind that had a choice of place gets to write down which one.
            kind.settle?.(puzzle, layout, piece, position);
            place(piece);
          } else {
            moveTo(piece, homeOf(piece), true);
            playReturn();
          }
        },
      });
    }

    built.resetButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      unlockAudio();
      startPuzzle();
    });

    // Last, so the kind draws into a board that is already standing and can
    // measure it if it wants to.
    if (kind.play) {
      stopActivity = kind.play(puzzle, next, {
        layer: built.activityLayer,
        touched: (at) => {
          sparkleBurst(built.fxLayer, at);
          checkComplete();
        },
      });
    }

    return built;
  }

  /** Rebuild for a new orientation, keeping progress intact. */
  function relayout(): void {
    const next = chooseLayout(viewport(), level, puzzle.pieces, puzzle.targets);
    if (next.id === layout.id) return;
    layout = next;
    board = mount(layout);
    render();
    if (complete) {
      const last = isLastLevel();
      celebrationBurst(board.fxLayer, layout);
      showFinishButton(board.fxLayer, layout, last ? "again" : "next", () =>
        goToLevel(nextLevel(levelNumber)),
      );
    }
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 150);
  });

  startPuzzle();

  return {
    chooseLevel: (level) => goToLevel(level, "chosen"),
    currentLevel: () => levelNumber,
  };
}
