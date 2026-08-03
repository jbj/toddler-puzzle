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
 * nothing on the play surface offers it. That includes taking a whole kind of
 * puzzle out: the host asks the record which kinds are in play each time it
 * needs to know where "onwards" leads, so a level of a kind switched off is
 * stepped over and the end of the game is the end of what is being played.
 *
 * Which tray slot each piece belongs to lives here and survives a re-layout, so
 * rotating the device mid-puzzle does not lose progress.
 */
import {
  playChapterFanfare,
  playFanfare,
  playInterludeFanfare,
  playPickUp,
  playReturn,
  playSnap,
  unlockAudio,
} from "./audio";
import { buildBoard, elementFor, setPiecePosition, type Board } from "./board";
import { WAY_OUT_MS, celebrationBurst, showFinishButton, sparkleBurst } from "./celebrate";
import type { Celebration, ChapterCelebrationId, InterludeId } from "./celebration";
import { enableDragging } from "./drag";
import { boxCenter, type Point, type Size } from "./geometry";
import { clearHint, createIdleHint, drawHint, hintPiece, type IdleHint } from "./hint";
import { ensureKind, isKindLoaded, kindFor, recoverWhenPossible } from "./kinds/registry";
import { boxOf, chooseLayout, trayHome, waitingHome, type Layout } from "./layout";
import {
  endsChapter,
  isLastPlayable,
  isPlayedByTouching,
  levelSpec,
  nextLevel,
  type EnabledKinds,
  type LevelSpec,
} from "./levels";
import type { PieceId, PieceShape } from "./piece";
import { createProgressStore, type ProgressStore } from "./progress";
import type { Puzzle, PuzzleKind } from "./puzzle";
import { afterWhileAwake } from "./rest";

const SETTLE_MS = 340;

/**
 * How long the end of a level waits for the celebration chunk before going on
 * without it.
 *
 * Long enough that a chunk which is a moment away is always waited for - it was
 * asked for when the level was dealt, so in practice it is already here and
 * this number is never reached. Short enough that a finished board is never
 * silent for as long as a child would take to wonder whether they had actually
 * finished it: half a second is about twice the beat that already separates the
 * last piece landing from the fanfare, so the worst case is a level that ends a
 * little late rather than one that appears never to have ended at all.
 */
const PARTY_PATIENCE_MS = 500;

interface PieceState {
  position: Point;
}

/** A CSS length in pixels, or zero for anything that will not parse. */
function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The box the board is drawn in, which the layout is composed for.
 *
 * The element's *content* box rather than the window: `#app` is padded by the
 * safe-area insets, so on a notched screen the two differ, and a board composed
 * for the window would letterbox itself inside the very margin the inset
 * bought. `clientWidth` counts the padding whichever way `box-sizing` falls, so
 * the padding comes off by hand; a box that measures as nothing - jsdom, or a
 * board asked about before it is laid out - falls back to the window, which is
 * the right answer whenever there is no inset and the old one everywhere else.
 */
function boxOfElement(element: HTMLElement): Size {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const across = style ? pixels(style.paddingLeft) + pixels(style.paddingRight) : 0;
  const down = style ? pixels(style.paddingTop) + pixels(style.paddingBottom) : 0;
  const width = element.clientWidth - across;
  const height = element.clientHeight - down;
  return {
    width: width > 0 ? width : window.innerWidth,
    height: height > 0 ? height : window.innerHeight,
  };
}

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
   * How to take the drag engine down. It listens on the window as well as on
   * the stage - a release has to be heard wherever it lands, see `drag.ts` - so
   * a board that is replaced has to unhook it rather than letting it go with
   * the element.
   */
  let stopDragging: (() => void) | null = null;
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
   * The piece in the air right now, if the child is carrying one. Only ever the
   * answer to "would rebuilding the board take something out of a hand" - see
   * `relayout`, which waits for the hand to be empty.
   */
  let held: PieceId | null = null;
  /** A rebuild the screen has asked for and a held piece is holding up. */
  let relayoutWaiting = false;
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
  /**
   * How many times a level has been dealt onto this stage. Anything that has to
   * wait - a chunk arriving, the pause before the fanfare - takes a copy and
   * checks it before touching the board, so a re-deal in the meantime cannot be
   * finished, or replaced, by the board it succeeded.
   */
  let deals = 0;
  /**
   * How many deals have been *asked* for, including ones still waiting for a
   * chunk. A deal that arrives to find this has moved on is a board the child
   * has already left, and is thrown away rather than mounted.
   */
  let awaited = 0;

  /**
   * The celebration module, once somebody has asked for it. It is a chunk of
   * its own - the largest single piece of the game - so it is fetched when a
   * chapter-ending level is *dealt* rather than when one is finished: five
   * levels of warning, and no chance of the button onwards being late. A failed
   * fetch is forgotten, so the next chapter tries again.
   */
  let celebrationModule: Promise<typeof import("./celebration")> | null = null;
  function loadCelebration(): Promise<typeof import("./celebration")> {
    celebrationModule ??= import("./celebration");
    celebrationModule.catch(() => (celebrationModule = null));
    return celebrationModule;
  }

  /**
   * Which kinds of puzzle a grown-up has left in play, asked at the moment it
   * matters rather than kept. A switch moved mid-level has to be answered by
   * the button at the end of that level, not by the next sitting, so nothing
   * here caches it.
   */
  const kindsInPlay = (): EnabledKinds => progress.settings().kinds;

  /** The last level of the set gets the finale and the replay arrow. */
  const isLastLevel = (): boolean => isLastPlayable(levelNumber, kindsInPlay());

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

  /**
   * Move a piece to a position, which is always the corner its box takes at
   * full size - the only currency the drag engine and the kinds deal in.
   *
   * `waiting` says the piece is coming to rest in its tray cell, where a
   * picture board draws it smaller than it lands. That shrink is a fact about
   * the drawing rather than about the position, so what is written down stays
   * the full-size corner and nothing downstream has to know about it.
   */
  function moveTo(piece: PieceId, position: Point, animated: boolean, waiting = false): void {
    const element = pieceEl(piece);
    element.classList.toggle("is-settling", animated);
    const rest = waiting ? waitingHome(layout, piece) : { at: position, shrink: 1 };
    setPiecePosition(element, rest.at, rest.shrink);
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
    showComplete();
    // A level played by touch has no pieces on the board to place: what there
    // is to see, the kind drew for itself when the board was mounted.
    if (kind.play) return;
    for (const shape of puzzle.pieces) {
      const element = pieceEl(shape.id);
      element.classList.remove("is-dragging", "is-settling");
      element.classList.toggle("is-placed", isPlaced(shape.id));
      moveTo(shape.id, restingPlace(shape.id), false, !isPlaced(shape.id));
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
    const { scale } = boxOf(layout, shape.id);
    const rest = waitingHome(layout, shape.id);
    drawHint(board.hintLayer, shape, {
      scale,
      targets,
      waiting: { at: rest.at, scale: scale * rest.shrink },
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

  /**
   * Tell the board the puzzle is whole. The only thing that reads it is the
   * artwork of a drawing that was cut up: a slice or a piece of a picture is
   * clipped to its own cut while there is still a gap to fill, and to a hair
   * past it once there is not, so the joins close as the last piece lands
   * (`.cut-art` in `style.css` and `cut.ts`).
   */
  function showComplete(): void {
    board.stage.classList.toggle("is-complete", complete);
  }

  function checkComplete(): void {
    if (complete || !kind.isComplete(puzzle)) return;

    complete = true;
    showComplete();
    // A finished level is never hinted at. This runs before the celebration is
    // built, so nothing can glow underneath one.
    hint?.stop();
    hint = null;
    // Let the last snap chime land before the fanfare starts.
    const dealt = deals;
    finishTimer = window.setTimeout(() => void raiseFinish(dealt), 260);
  }

  /**
   * Raise the end of a level: its fanfare, its celebration, and the button
   * onwards.
   *
   * A level ends with a celebration because a finished board leading straight
   * into a fresh one is more than a one-year-old can carry. Ordinary levels get
   * an *interlude* - balloons, beach balls, confetti, streamers, rotated so two
   * levels running never end alike - and five levels finishing is a bigger
   * moment still, so a chapter ends with one of its own and the last chapter
   * with the finale, which does not stop. An ordinary level's fanfare walks a
   * step along the scale each time, with the interlude's own arrival behind it.
   *
   * A level played by touching gets no interlude, and no pause either. It is
   * already the thing an interlude is: things on a screen that answer a finger
   * and ask nothing, which the child leaves when they are ready. Following one
   * with four seconds of balloons is the same screen again, and a break from
   * nothing. Such a level that *ends a chapter* still gets the chapter's own
   * celebration - that is a moment being marked rather than a rest being given.
   *
   * The celebration is a chunk of its own, and one that was asked for when this
   * level was dealt, so the wait here is over before it starts. If it somehow
   * is not - a chunk that never arrived - the level ends the way it did before
   * any of this existed, with its fanfare, its sparkle and its button, and the
   * child goes on at once rather than waiting out a pause with nothing in it. A
   * missing party is a disappointment; a missing way out would be a trap.
   *
   * Which is why the wait is a *bounded* one. A chunk that fails outright
   * rejects and is caught, but one that is merely still coming down a bad
   * connection does neither, and waiting on it would leave a finished board
   * silent and buttonless for as long as the network felt like taking - the
   * trap the paragraph above says this must not be, arrived at by patience
   * rather than by design. So the module has `PARTY_PATIENCE_MS` to turn up,
   * and after that the level ends without it. This matters most at level 1,
   * where the chunk has had the least time.
   */
  async function raiseFinish(dealt: number): Promise<void> {
    let chapterEnd: ChapterCelebrationId | null = null;
    let interlude: InterludeId | null = null;
    const closesChapter = endsChapter(levelNumber, kindsInPlay());
    const wants = closesChapter || !isPlayedByTouching(levelNumber);
    const module = wants
      ? await Promise.race([
          loadCelebration().catch(() => null),
          new Promise<null>((settle) => {
            afterWhileAwake(PARTY_PATIENCE_MS, () => settle(null));
          }),
        ])
      : null;
    // A board dealt while that was in flight - the reset button, or a level
    // chosen from the panel - is not this board, and must not be finished.
    if (dealt !== deals) return;
    if (module) {
      if (closesChapter) {
        chapterEnd = module.celebrationFor(level.chapter);
      } else {
        interlude = module.interludeFor(levelNumber);
      }
      celebration = module.createCelebration(chapterEnd ?? (interlude as InterludeId));
    }
    if (chapterEnd) playChapterFanfare(chapterEnd);
    else playFanfare(levelNumber);
    if (interlude) playInterludeFanfare(interlude);
    showFinish(true);
  }

  /**
   * The end of a level: the sparkles, the celebration and the one big button
   * onwards.
   *
   * The button *arrives* rather than sitting there, `WAY_OUT_MS` after the level
   * ends. That pause is the point of a celebration between levels - it is what
   * the child gets instead of the next board landing on top of the one they
   * have just finished - and it is also what stops the button being pressed
   * before anything else is noticed, which after twenty-nine presses it
   * otherwise would be. Nothing else is withheld: the celebration answers a
   * finger from its first frame, and nothing here moves the child on by itself.
   *
   * The pause is for a celebration that is actually on the screen, and for one
   * that has just started. A tablet turned mid-party puts the button straight
   * back where it was, and a celebration chunk that never arrived leaves an
   * empty pause nobody would understand - so in both of those the button is
   * there at once.
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
      () => goToLevel(nextLevel(levelNumber, kindsInPlay())),
      celebration && fresh ? WAY_OUT_MS : 0,
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
   *
   * A kind is a chunk (`kinds/registry.ts`), and `warm.ts` fetches every one of
   * them during play, so in practice the code is always already here and this
   * runs straight through. When it is not - the first sitting, on a connection
   * slow enough that the child got ahead of the warm - the board that is up
   * stays up until it arrives, and the asking goes on until it does. Whatever
   * the child was looking at is a better thing to look at than an empty stage,
   * and a game that needs pressing again to unstick itself is no use to a
   * two-year-old who cannot tell that anything is wrong. The screenshot run
   * blocks a chunk outright and checks both halves of that.
   */
  function startPuzzle(): void {
    const next = levelSpec(levelNumber);
    if (isKindLoaded(next.kind)) {
      deal(next, kindFor(next));
      return;
    }
    const wanted = ++awaited;
    // A reload lands wherever progress says, so record the level the child
    // asked for *before* waiting for its code. If the chunk arrives this is
    // written again by `deal` and nothing has changed; if it does not, the
    // fresh page opens on the level they were going to rather than the one they
    // had just finished.
    if (arrival === "chosen") progress.jumpToLevel(levelNumber);
    else progress.reachLevel(levelNumber);
    void ensureKind(next.kind).then(
      (loaded) => {
        // Only the most recent thing asked for gets to land: a child pressing
        // on while a chunk was in flight has already chosen a different board.
        if (wanted === awaited) deal(next, loaded);
      },
      () => {
        // Nothing is taken off the screen. The board the child just finished
        // stays exactly where it is - a thing to look at and touch beats an
        // empty stage - and `recoverWhenPossible` brings the game back by
        // itself if the connection returns.
        if (wanted === awaited) recoverWhenPossible();
      },
    );
  }

  function deal(next: LevelSpec, dealer: PuzzleKind): void {
    deals++;
    complete = false;
    celebration = null;
    lastTouched = null;
    window.clearTimeout(finishTimer);
    if (arrival === "chosen") progress.jumpToLevel(levelNumber);
    else progress.reachLevel(levelNumber);
    level = next;
    kind = dealer;
    // Asked for now rather than when the last piece lands, so the party is here
    // by the time there is anything to celebrate. Every level ends with one, so
    // this is asked for on every deal - after the first it is a resolved
    // promise, and `warm.ts` has usually fetched it before level 1 is finished.
    void loadCelebration().catch(() => null);
    puzzle = kind.deal({ level, shapes }, random);
    layout = chooseLayout(boxOfElement(root), level, puzzle.pieces, puzzle.targets);
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
    stopDragging?.();
    stopDragging = null;
    hint?.stop();
    hint = null;
    stopCelebration?.();
    stopCelebration = null;
    cancelFinishButton?.();
    cancelFinishButton = null;

    const touched = kind.play !== undefined;
    // Whatever was in the air belonged to the board being replaced.
    held = null;
    const built = buildBoard(root, next, { pieces: !touched });

    // Before the drag engine, so that a press which turns out to be a piece
    // being picked up ends up *paused* rather than armed: this stirs, and the
    // pick-up that follows takes the hint down and leaves it down. A press on
    // bare sky reaches only this one, and a child who is poking about at
    // nothing in particular is not idle.
    built.stage.addEventListener("pointerdown", () => hint?.stir());

    if (!touched) {
      stopDragging = enableDragging(built.stage, next, {
        isDraggable: (piece) => !isPlaced(piece),
        getPosition: (piece) => stateOf(piece).position,
        onPickUp: (piece) => {
          unlockAudio();
          lastTouched = piece;
          held = piece;
          // Nothing is hinted at while a piece is in the air, however long it
          // is held there: the child is already doing the thing.
          hint?.pause();
          const element = elementFor(built.pieces, piece);
          element.classList.add("is-dragging");
          element.classList.remove("is-settling");
          // Re-appending raises the piece above its siblings while it is held.
          built.piecesLayer.append(element);
          playPickUp();
        },
        onMove: (piece, position) => moveTo(piece, position, false),
        onDrop: (piece, position) => {
          held = null;
          elementFor(built.pieces, piece).classList.remove("is-dragging");
          if (kind.accepts(puzzle, layout, piece, position)) {
            // The drop point is the last the kind hears of where the finger was;
            // a kind that had a choice of place gets to write down which one.
            kind.settle?.(puzzle, layout, piece, position);
            place(piece);
          } else {
            moveTo(piece, homeOf(piece), true, true);
            playReturn();
            // A drag that went nowhere is still the child working at it, so the
            // wait starts again from here rather than carrying on.
            hint?.stir();
          }
          // The hand is empty again, so a screen that changed shape mid-drag
          // gets its rebuild - after the drop has been judged, so the piece
          // lands where the child aimed it and then the board reshapes. Not
          // here and now, though: the newest finger wins, so this drop may be
          // the first half of a press, and rebuilding inside it would pull the
          // board out from under the piece being picked up. A tick later the
          // press has finished, and if it took a piece the rebuild waits again.
          if (relayoutWaiting) queueMicrotask(relayout);
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
          if (at) sparkleBurst(built.fxLayer, at);
          checkComplete();
        },
      });
    }

    return built;
  }

  /**
   * Rebuild for a screen that has changed shape, keeping progress intact.
   *
   * The board is composed for the box it is drawn in rather than for one of two
   * orientations, so this compares the *canvas* - a turned tablet, a resized
   * window and a browser collapsing its address bar all land here alike, and a
   * screen whose shape did not really change still costs nothing.
   */
  function relayout(): void {
    const next = chooseLayout(boxOfElement(root), level, puzzle.pieces, puzzle.targets);
    if (next.canvas.width === layout.canvas.width && next.canvas.height === layout.canvas.height) {
      relayoutWaiting = false;
      return;
    }
    // Never out from under a held piece. Rebuilding the board replaces the
    // element the finger is carrying, so a phone collapsing its address bar
    // part way through a drag would drop the animal a child was holding.
    if (held !== null) {
      relayoutWaiting = true;
      return;
    }
    relayoutWaiting = false;
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
