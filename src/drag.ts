/**
 * Before changing this file, read docs/feel.md.
 *
 * Pointer-based drag engine, in two halves: the rule, and the wiring.
 *
 * `createDragging` is the rule, and it is pure - pieces, points and boxes, no
 * DOM at all - so the sequences that break a drag can be played out in Vitest
 * (`tests/drag.test.ts`) in the spirit of `createIdleHint` and `createRest`.
 * `enableDragging` is the wiring: Pointer Events with pointer capture, so
 * mouse, touch and stylus all take the same path and a fast-moving finger that
 * outruns the piece still keeps control of it.
 *
 * **The engine must never depend on a release arriving.** That is the whole
 * point of the split, and it is what this file used to get wrong. A drag lived
 * in one variable, the only way out of it was a `pointerup` or `pointercancel`
 * on the stage for exactly that pointer, and a press was refused while it was
 * set - so a release that never arrived left the piece frozen and every
 * subsequent finger, on any piece, ignored until the board was re-dealt. On an
 * iPad in a toddler's hands that is not a rare case: WebKit drops the release
 * for a captured pointer under multi-touch, a finger that lifts on the
 * safe-area strip outside the SVG lands on an element the stage never hears
 * about, and an edge swipe or an app switch takes the touch away outright.
 *
 * So the rule holds a drag but never gates on one:
 *
 * - The **newest finger wins**. A press on a piece that can be picked up drops
 *   whatever was held and picks the new one up, so two hands can never
 *   deadlock. Nothing asks whether the old pointer is still alive, because
 *   nothing needs the answer.
 * - **Every way a finger can go away ends the drag**: `pointerup` and
 *   `pointercancel` on the *window*, in the capture phase, so a lift anywhere
 *   on the page is heard; `lostpointercapture`, so a capture taken away is a
 *   drop rather than a piece dragged blind; and the page being hidden or
 *   unloaded, because an app switched away from mid-drag may deliver nothing
 *   at all.
 * - A drop is always taken **where the piece stands**, so an interrupted drag
 *   is settled by the ordinary rule - into its hole if it was over it, back to
 *   the tray if it was not.
 *
 * The engine is torn down with the board it was mounted on: `enableDragging`
 * returns the teardown, because its listeners outlive the stage element.
 */
import { clampGripToCanvas, screenToLogical, type Point, type Rect } from "./geometry";
import { FINGER_LIFT, boxOf, type Layout } from "./layout";
import type { PieceId } from "./piece";

export interface DragCallbacks {
  isDraggable(piece: PieceId): boolean;
  getPosition(piece: PieceId): Point;
  /** Deliberately the piece rather than its element: the rule knows no DOM. */
  onPickUp(piece: PieceId): void;
  onMove(piece: PieceId, position: Point): void;
  onDrop(piece: PieceId, position: Point): void;
}

interface ActiveDrag {
  pointerId: number;
  piece: PieceId;
  /** Piece top-left minus pointer position, so the grab point is preserved. */
  offset: Point;
  /** The piece's own box inside the box it carries, which it is clamped by. */
  grip: Rect;
  position: Point;
}

/** The drag rule: which finger is holding what, and where it has got to. */
export interface Dragging {
  /**
   * A finger landed on a piece. Anything already held is dropped first, and
   * the answer says whether this press took the piece - which is what the
   * wiring captures the pointer on.
   */
  press(pointerId: number, piece: PieceId, at: Point): boolean;
  /** That finger moved. Any other pointer is somebody else's business. */
  move(pointerId: number, at: Point): void;
  /** That finger let go, was cancelled, or lost the piece. */
  release(pointerId: number): void;
  /** Whoever is holding a piece lets go of it, wherever it stands. */
  releaseAll(): void;
  /** Which pointer is holding a piece, if any. */
  holding(): number | null;
  /** The board is going: forget the drag without settling it anywhere. */
  abandon(): void;
}

export function createDragging(layout: Layout, callbacks: DragCallbacks): Dragging {
  let active: ActiveDrag | null = null;

  /** Where the piece stands for a pointer at `at`, kept inside the canvas. */
  const follow = (drag: ActiveDrag, at: Point): Point =>
    clampGripToCanvas(
      { x: at.x + drag.offset.x, y: at.y + drag.offset.y },
      drag.grip,
      layout.canvas,
    );

  /** Let go of whatever is held, where it stands. Nothing held is nothing to do. */
  const drop = (): void => {
    if (!active) return;
    const { piece, position } = active;
    active = null;
    callbacks.onDrop(piece, position);
  };

  return {
    press(pointerId, piece, at) {
      // Asked before anything is dropped, so a stray palm on a piece that is
      // already home cannot knock the piece a child is carrying out of the air.
      if (!callbacks.isDraggable(piece)) return false;
      // The newest finger wins. A toddler drags with more than one hand, and a
      // press that was refused because another finger was still notionally down
      // is how the board used to lock up.
      drop();

      const current = callbacks.getPosition(piece);
      const { grip } = boxOf(layout, piece);
      const drag: ActiveDrag = {
        pointerId,
        piece,
        // Lifting the piece above the finger keeps it visible under a small hand.
        offset: { x: current.x - at.x, y: current.y - at.y - FINGER_LIFT },
        grip,
        position: current,
      };
      active = drag;

      callbacks.onPickUp(piece);
      drag.position = follow(drag, at);
      callbacks.onMove(piece, drag.position);
      return true;
    },

    move(pointerId, at) {
      if (!active || active.pointerId !== pointerId) return;
      active.position = follow(active, at);
      callbacks.onMove(active.piece, active.position);
    },

    release(pointerId) {
      if (!active || active.pointerId !== pointerId) return;
      drop();
    },

    releaseAll: drop,

    holding: () => active?.pointerId ?? null,

    abandon() {
      active = null;
    },
  };
}

/**
 * Wire the rule to a stage. Returns the teardown, which must be called when the
 * board is replaced: the release listeners live on the window and would
 * otherwise outlive every stage the game ever mounts.
 */
export function enableDragging(
  stage: SVGSVGElement,
  layout: Layout,
  callbacks: DragCallbacks,
): () => void {
  const dragging = createDragging(layout, callbacks);
  const view = stage.ownerDocument.defaultView ?? window;
  const gone = new AbortController();
  const until = { signal: gone.signal };
  /** Heard wherever they land, and before anything else can swallow them. */
  const anywhere = { capture: true, signal: gone.signal };

  const logicalPointer = (event: PointerEvent): Point =>
    screenToLogical(
      { x: event.clientX, y: event.clientY },
      stage.getBoundingClientRect(),
      layout.canvas,
    );

  const letGoOfCapture = (pointerId: number): void => {
    try {
      if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
    } catch {
      // A capture the browser has already taken back. Nothing to give up.
    }
  };

  stage.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      // Before any decision about this press: a second finger arriving while a
      // piece is held must not start a native gesture on top of the drag, which
      // is one of the things that makes WebKit drop the first finger's release.
      if (dragging.holding() !== null) event.preventDefault();

      const target = event.target;
      if (!(target instanceof Element)) return;

      const element = target.closest(".piece");
      if (!(element instanceof SVGGElement)) return;

      const piece = element.dataset["piece"] as PieceId | undefined;
      if (!piece) return;
      if (!dragging.press(event.pointerId, piece, logicalPointer(event))) return;

      event.preventDefault();
      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
        // A browser that will not capture still drags: the move and release
        // listeners are on the window, so they are heard either way.
      }
    },
    until,
  );

  // On the window rather than the stage, for the same reason as the releases
  // below: a move after the capture has quietly gone is hit-tested afresh, and
  // may never touch the stage again.
  view.addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (dragging.holding() !== event.pointerId) return;
      event.preventDefault();
      dragging.move(event.pointerId, logicalPointer(event));
    },
    anywhere,
  );

  const finish = (event: PointerEvent): void => {
    if (dragging.holding() !== event.pointerId) return;
    letGoOfCapture(event.pointerId);
    dragging.release(event.pointerId);
  };

  // A second finger can land off the stage (safe-area strip) while a piece is
  // held. Prevent the browser from turning that press into a native gesture.
  view.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      if (dragging.holding() === null) return;
      event.preventDefault();
    },
    anywhere,
  );
  view.addEventListener("pointerup", finish, anywhere);
  view.addEventListener("pointercancel", finish, anywhere);
  // The capture being taken away is the piece being taken away: carrying on
  // would follow a finger whose events are now going somewhere else.
  stage.addEventListener("lostpointercapture", (event) => dragging.release(event.pointerId), until);

  // A page put behind another app mid-drag may deliver no release at all, so
  // the piece is settled here instead. The same signal `rest.ts` freezes on.
  const letGo = (): void => {
    const held = dragging.holding();
    if (held === null) return;
    letGoOfCapture(held);
    dragging.releaseAll();
  };
  stage.ownerDocument.addEventListener(
    "visibilitychange",
    () => {
      if (stage.ownerDocument.visibilityState === "hidden") letGo();
    },
    until,
  );
  view.addEventListener("pagehide", letGo, until);

  // Long-press menus and native image dragging would both interrupt play.
  stage.addEventListener("contextmenu", (event) => event.preventDefault(), until);
  stage.addEventListener("dragstart", (event) => event.preventDefault(), until);

  return () => {
    gone.abort();
    // Not a drop: the board these callbacks belong to is being replaced, and
    // the piece's place comes from the puzzle when the new one is rendered.
    dragging.abandon();
  };
}
