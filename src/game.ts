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
 * screen and never a buzzer. And a board that goes untouched for a while glows
 * quietly where the next piece wants to go (`hint.ts`), so a child who is stuck
 * is led rather than left.
 *
 * A game is thirty levels long, in six chapters of five (`levels.ts`). Every
 * level is dealt fresh, so it never plays out quite the same way twice.
 * Finishing a level shows one big button that leads to the next one, and the
 * button after the last level starts the whole game over - so the only way the
 * child can go is forward, and there is never a menu to get lost in. Finishing
 * the *fifth* level of a chapter shows that button on top of a celebration
 * (`celebration.ts`): a bigger moment than a level's fanfare, and one the child
 * plays with rather than watches. Thirty
 * levels is more than one sitting, so the host tells `progress.ts` which level
 * is being played and the next visit starts there. A grown-up can steer, from
 * the panel in `grownups.ts`, which is what the returned `GameHandle` is for;
 * nothing on the play surface offers it.
 *
 * Which tray slot each piece belongs to lives here and survives a re-layout, so
 * rotating the device mid-puzzle does not lose progress.
 */
import {
  playChapterFanfare,
  playFanfare,
  playPickUp,
  playReturn,
  playSnap,
  unlockAudio,
} from "./audio";
import { buildBoard, elementFor, setPiecePosition, type Board } from "./board";
import {
  FINISH_BUTTON_BEAT_MS,
  celebrationBurst,
  showFinishButton,
  sparkleBurst,
} from "./celebrate";
import { celebrationFor, createCelebration, type Celebration } from "./celebration";
import { enableDragging } from "./drag";
import { boxCenter, type Point, type Size } from "./geometry";
import { clearHint, createIdleHint, drawHint, hintPiece, type IdleHint } from "./hint";
import { kindFor } from "./kinds/registry";
import { boxOf, chooseLayout, trayHome, type Layout } from "./layout";
import { LEVEL_COUNT, endsChapter, levelSpec, nextLevel, type LevelSpec } from "./levels";
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
  /**
   * The idle hint watching this board, if this level has one: a level played by
   * touching has nothing to aim at, and a finished level has a celebration on
   * it. Held so that a board being replaced takes its hint with it - see
   * `hint.ts`, where `stop` latches for exactly that reason.
   */
  let hint: IdleHint | null = null;
  /**
   * The piece the child last picked up, which is the one the hint is about.
   * Kept across re-layouts and reset when a level is dealt; a value left over
   * from another board is ignored by `hintPiece` rather than trusted.
   */
  let lastTouched: PieceId | null = null;
  /**
   * The celebration this level ended with, if it ended a chapter. It outlives
   * the board so that turning the tablet mid-party keeps the arcs of a rainbow
   * and the half-minute of arrivals where they were, and is thrown away as soon
   * as another level is dealt.
   */
  let celebration: Celebration | null = null;
  let stopCelebration: (() => void) | null = null;
  let cancelFinishButton: (() => void) | null = null;
  /**
   * The pause between the last snap and the fanfare. Held so that re-dealing
   * inside it - the reset button, pressed the instant the last piece lands -
   * cannot raise a finish on a board that is not finished.
   */
  let finishTimer = 0;

  /** The last level of the set gets the finale and the replay arrow. */
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

  /**
   * Put the hint on the board: the glow on the target of whichever piece is
   * meant, and a quieter one under that piece where it waits. Drawn only when
   * there is still something to move; a level with nothing waiting is a level
   * that is about to be over.
   */
  function showHint(): void {
    const shape = hintPiece(puzzle.pieces, puzzle.placed, lastTouched);
    if (!shape) return;
    // Every place this piece would be taken, not just the one it is aimed at:
    // a kind that lets two identical shapes fill either of two identical
    // shadows must not be reported as though it had made up its mind.
    const targets = kind.openTargets?.(puzzle, layout, shape.id) ?? [
      kind.target(puzzle, layout, shape.id),
    ];
    drawHint(board.hintLayer, shape, {
      scale: boxOf(layout, shape.id).scale,
      targets,
      waiting: homeOf(shape.id),
    });
  }

  /**
   * Start watching this board for a stretch with nothing happening.
   *
   * Not every board gets one. A level played by touching has no tray, no
   * targets and no wrong place - a finger anywhere lands on something that
   * answers - so there is nothing an idle hint could point at; see
   * [decision 20260730T213000](../docs/decisions/20260730T213000-a-hint-points-at-both-ends.md).
   * A finished level has a celebration on it instead.
   */
  function watchForIdle(): void {
    if (kind.play || complete) return;
    hint = createIdleHint({
      show: showHint,
      hide: () => clearHint(board.hintLayer),
    });
  }

  function checkComplete(): void {
    if (complete || !kind.isComplete(puzzle)) return;

    complete = true;
    // A finished level is never hinted at. This runs before the celebration is
    // built, so nothing can glow underneath one.
    hint?.stop();
    hint = null;
    // Five levels finishing has to be a bigger moment than one level finishing,
    // or the thirty flatten into one long identical fanfare. A chapter ends
    // with a celebration that is played rather than watched (`celebration.ts`);
    // the last chapter's is the finale, and does not stop.
    const chapterEnd = endsChapter(levelNumber) ? celebrationFor(level.chapter) : null;
    celebration = chapterEnd ? createCelebration(chapterEnd) : null;
    // Let the last snap chime land before the fanfare starts. A chapter's
    // fanfare is the celebration's own; an ordinary level's walks a step along
    // the scale each time, so two levels running do not end identically.
    finishTimer = window.setTimeout(() => {
      if (chapterEnd) playChapterFanfare(chapterEnd);
      else playFanfare(levelNumber);
      showFinish(true);
    }, 260);
  }

  /**
   * The end of a level: the sparkles, the celebration if this level ended a
   * chapter, and the one big button onwards.
   *
   * The button goes up *with* the celebration rather than after it, and that is
   * the whole of what keeps a celebration from being a trap. A child who has
   * popped every balloon in four seconds already has the way on, and a child who
   * touches nothing is never waiting for permission to leave. Nothing here moves
   * them on by itself: a clock that changed the level would take the game away
   * mid-tap.
   *
   * The one qualification is a beat: on a chapter end the button *arrives*
   * rather than sitting there, because after twenty-five presses it is the most
   * conditioned thing on the screen and would otherwise be pressed before the
   * celebration is noticed. See `FINISH_BUTTON_BEAT_MS`. The beat is for a
   * celebration that has just started, so a tablet turned mid-party puts the
   * button straight back where it was.
   *
   * Called again after a re-layout, which is why it takes only that one fact and
   * reads everything else from the board that is standing now.
   */
  function showFinish(fresh: boolean): void {
    celebrationBurst(board.fxLayer, layout);
    if (celebration) {
      stopCelebration = celebration.mount({
        layer: board.celebrationLayer,
        fxLayer: board.fxLayer,
        layout,
        pieces: puzzle.pieces,
        cast: shapes,
        random,
      });
    }
    cancelFinishButton = showFinishButton(
      board.fxLayer,
      layout,
      isLastLevel() ? "again" : "next",
      () => goToLevel(nextLevel(levelNumber)),
      celebration && fresh ? FINISH_BUTTON_BEAT_MS : 0,
    );
  }

  /** Settle an accepted piece where the kind says it belongs. */
  function place(piece: PieceId): void {
    puzzle.placed.add(piece);
    const target = kind.target(puzzle, layout, piece);
    moveTo(piece, target, true);
    pieceEl(piece).classList.add("is-placed");
    renderBackdrop();

    playSnap(puzzle.kind);
    // On the piece's own drawing rather than the middle of the box it carries.
    // For an animal those are the same point; for a piece of a bigger picture -
    // a slice, a shape, a jigsaw piece - the box is the whole picture, and its
    // middle is nowhere near the corner piece that just went in.
    const { ink } = boxOf(layout, piece);
    sparkleBurst(board.fxLayer, boxCenter({ x: target.x + ink.x, y: target.y + ink.y }, ink));
    checkComplete();
    // After `checkComplete`, so a level that has just ended keeps the hint it
    // stopped rather than arming a new wait behind the celebration.
    hint?.stir();
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
    celebration = null;
    lastTouched = null;
    window.clearTimeout(finishTimer);
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
    // After `board` is standing and the pieces are where they belong, since the
    // hint is drawn from both.
    watchForIdle();
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
    hint?.stop();
    hint = null;
    stopCelebration?.();
    stopCelebration = null;
    cancelFinishButton?.();
    cancelFinishButton = null;

    const touched = kind.play !== undefined;
    const built = buildBoard(root, next, { pieces: !touched });

    // Before the drag engine, so that a press which turns out to be a piece
    // being picked up ends up *paused* rather than armed: this stirs, and the
    // pick-up that follows takes the hint down and leaves it down. A press on
    // bare sky reaches only this one, and a child who is poking about at
    // nothing in particular is not idle.
    built.stage.addEventListener("pointerdown", () => hint?.stir());

    if (!touched) {
      enableDragging(built.stage, next, {
        isDraggable: (piece) => !isPlaced(piece),
        getPosition: (piece) => stateOf(piece).position,
        onPickUp: (piece, element) => {
          unlockAudio();
          lastTouched = piece;
          // Nothing is hinted at while a piece is in the air, however long it
          // is held there: the child is already doing the thing.
          hint?.pause();
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
            // A drag that went nowhere is still the child working at it, so the
            // wait starts again from here rather than carrying on.
            hint?.stir();
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
    watchForIdle();
    // Including the celebration, which counts what has been played with outside
    // the board precisely so a turned tablet does not undo it.
    if (complete) showFinish(false);
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
