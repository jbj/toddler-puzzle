/**
 * Pointer-based drag engine.
 *
 * Uses Pointer Events with pointer capture so mouse, touch and stylus all take
 * the same path, and so a fast-moving finger that outruns the piece still keeps
 * control of it.
 */
import type { AnimalId } from "./assets";
import { clampToCanvas, screenToLogical, type Point } from "./geometry";
import { FINGER_LIFT, PIECE_SIZE, type Layout } from "./layout";

export interface DragCallbacks {
  isDraggable(animal: AnimalId): boolean;
  getPosition(animal: AnimalId): Point;
  onPickUp(animal: AnimalId, element: SVGGElement): void;
  onMove(animal: AnimalId, position: Point): void;
  onDrop(animal: AnimalId, position: Point): void;
}

interface ActiveDrag {
  pointerId: number;
  animal: AnimalId;
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

    const animal = element.dataset["animal"] as AnimalId | undefined;
    if (!animal || !callbacks.isDraggable(animal)) return;

    event.preventDefault();
    stage.setPointerCapture(event.pointerId);

    const pointer = logicalPointer(event, stage, layout);
    const current = callbacks.getPosition(animal);
    active = {
      pointerId: event.pointerId,
      animal,
      // Lifting the piece above the finger keeps it visible under a small hand.
      offset: { x: current.x - pointer.x, y: current.y - pointer.y - FINGER_LIFT },
      position: current,
    };

    callbacks.onPickUp(animal, element);
    callbacks.onMove(animal, clampToCanvas({
      x: pointer.x + active.offset.x,
      y: pointer.y + active.offset.y,
    }, PIECE_SIZE, layout.canvas));
  });

  stage.addEventListener("pointermove", (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const pointer = logicalPointer(event, stage, layout);
    active.position = clampToCanvas(
      { x: pointer.x + active.offset.x, y: pointer.y + active.offset.y },
      PIECE_SIZE,
      layout.canvas,
    );
    callbacks.onMove(active.animal, active.position);
  });

  const finish = (event: PointerEvent): void => {
    if (!active || event.pointerId !== active.pointerId) return;
    const { animal, position } = active;
    active = null;
    if (stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
    callbacks.onDrop(animal, position);
  };

  stage.addEventListener("pointerup", finish);
  stage.addEventListener("pointercancel", finish);

  // Long-press menus and native image dragging would both interrupt play.
  stage.addEventListener("contextmenu", (event) => event.preventDefault());
  stage.addEventListener("dragstart", (event) => event.preventDefault());
}
