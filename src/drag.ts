/**
 * Pointer-based drag engine.
 *
 * Uses Pointer Events with pointer capture so mouse, touch and stylus all take
 * the same path, and so a fast-moving finger that outruns the piece still keeps
 * control of it.
 */
import { clampToCanvas, screenToLogical, type Point } from "./geometry";
import { FINGER_LIFT, type Layout } from "./layout";
import type { PieceId } from "./piece";

export interface DragCallbacks {
  isDraggable(piece: PieceId): boolean;
  getPosition(piece: PieceId): Point;
  onPickUp(piece: PieceId, element: SVGGElement): void;
  onMove(piece: PieceId, position: Point): void;
  onDrop(piece: PieceId, position: Point): void;
}

interface ActiveDrag {
  pointerId: number;
  piece: PieceId;
  /** Piece top-left minus pointer position, so the grab point is preserved. */
  offset: Point;
  position: Point;
}

function logicalPointer(event: PointerEvent, stage: SVGSVGElement, layout: Layout): Point {
  const rect = stage.getBoundingClientRect();
  return screenToLogical({ x: event.clientX, y: event.clientY }, rect, layout.canvas);
}

export function enableDragging(
  stage: SVGSVGElement,
  layout: Layout,
  callbacks: DragCallbacks,
): void {
  let active: ActiveDrag | null = null;

  stage.addEventListener("pointerdown", (event: PointerEvent) => {
    if (active) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const element = target.closest(".piece");
    if (!(element instanceof SVGGElement)) return;

    const piece = element.dataset["piece"] as PieceId | undefined;
    if (!piece || !callbacks.isDraggable(piece)) return;

    event.preventDefault();
    stage.setPointerCapture(event.pointerId);

    const pointer = logicalPointer(event, stage, layout);
    const current = callbacks.getPosition(piece);
    active = {
      pointerId: event.pointerId,
      piece,
      // Lifting the piece above the finger keeps it visible under a small hand.
      offset: { x: current.x - pointer.x, y: current.y - pointer.y - FINGER_LIFT },
      position: current,
    };

    callbacks.onPickUp(piece, element);
    callbacks.onMove(
      piece,
      clampToCanvas(
        {
          x: pointer.x + active.offset.x,
          y: pointer.y + active.offset.y,
        },
        layout.pieceSize,
        layout.canvas,
      ),
    );
  });

  stage.addEventListener("pointermove", (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const pointer = logicalPointer(event, stage, layout);
    active.position = clampToCanvas(
      { x: pointer.x + active.offset.x, y: pointer.y + active.offset.y },
      layout.pieceSize,
      layout.canvas,
    );
    callbacks.onMove(active.piece, active.position);
  });

  const finish = (event: PointerEvent): void => {
    if (!active || event.pointerId !== active.pointerId) return;
    const { piece, position } = active;
    active = null;
    if (stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
    callbacks.onDrop(piece, position);
  };

  stage.addEventListener("pointerup", finish);
  stage.addEventListener("pointercancel", finish);

  // Long-press menus and native image dragging would both interrupt play.
  stage.addEventListener("contextmenu", (event) => event.preventDefault());
  stage.addEventListener("dragstart", (event) => event.preventDefault());
}
