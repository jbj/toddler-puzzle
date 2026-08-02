/**
 * The drag engine, driven by fabricated pointer sequences.
 *
 * The bug this suite exists for is not a bug in the maths: it is what happens
 * when the browser does *not* say what the engine was waiting to hear. A
 * toddler on an iPad drags with several fingers at once, presses while
 * something else is already down, slides off the SVG onto the safe-area strip,
 * and swipes the app away mid-drag - and WebKit answers by dropping the
 * `pointerup` for a captured pointer, or by delivering it somewhere the stage
 * never hears. The engine used to hold its drag in one variable, refuse a press
 * while it was set, and clear it only on a matching release *on the stage*, so
 * every one of those left the board dead until it was re-dealt.
 *
 * None of that can be reproduced by dragging correctly, which is why the whole
 * point here is the sequences that are *not* a clean drag. Each one below ends
 * with the same question: is the next press accepted?
 *
 * There is no DOM in Vitest, and this suite deliberately does not add one. The
 * rule (`createDragging`) is pure, in the spirit of `createIdleHint` and
 * `createRest`, so most of it is exercised directly. The wiring is exercised
 * too, through a fake stage of a few dozen lines that records what was
 * registered where and fires it by hand: which listener sits on which target is
 * exactly what regressed, so a check that could not see it would be no check at
 * all. What a real drag does in a real browser is `npm run shot`'s.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ANIMAL_BOX } from "../src/assets";
import { createDragging, enableDragging, type DragCallbacks } from "../src/drag";
import type { Point } from "../src/geometry";
import { FINGER_LIFT, boxOf, buildLevelLayout, trayHome, type Layout } from "../src/layout";
import { LEVELS, type LevelSpec } from "../src/levels";
import { pieceId, type PieceId, type PieceShape } from "../src/piece";

/** A level that deals three pieces, so a second finger has somewhere to land. */
function levelOfThree(): LevelSpec {
  const level = LEVELS.find((one) => one.kind === "shape-match" && one.pieces === 3);
  if (!level) {
    throw new Error(
      "No shape-match level deals 3 pieces. This suite needs one to stand a " +
        "cast on; pick a count LEVELS still has.",
    );
  }
  return level;
}

/** Three plain pieces filling their boxes. What they draw does not matter here. */
const CAST: readonly PieceShape[] = ["one", "two", "three"].map((name) => ({
  id: pieceId(`test:${name}`),
  outline: `M0 0 h${ANIMAL_BOX.width} v${ANIMAL_BOX.height} z`,
  artwork: "",
  box: ANIMAL_BOX,
  inked: { x: 0, y: 0, ...ANIMAL_BOX },
  anchor: { x: ANIMAL_BOX.width / 2, y: ANIMAL_BOX.height },
  label: name,
}));

const [FIRST, SECOND, THIRD] = CAST.map((shape) => shape.id) as [PieceId, PieceId, PieceId];

const LAYOUT: Layout = buildLevelLayout("landscape", levelOfThree(), CAST);

/** What the host would have done, written down instead. */
interface Host {
  readonly pickedUp: PieceId[];
  readonly dropped: { piece: PieceId; position: Point }[];
  readonly placed: Set<PieceId>;
  readonly at: Map<PieceId, Point>;
}

function recorder(): { record: Host; callbacks: DragCallbacks } {
  const record: Host = {
    pickedUp: [],
    dropped: [],
    placed: new Set(),
    at: new Map(CAST.map((shape) => [shape.id, trayHome(LAYOUT, shape.id)])),
  };
  const positionOf = (piece: PieceId): Point => {
    const at = record.at.get(piece);
    if (!at) throw new Error(`No position for "${piece}".`);
    return at;
  };
  return {
    record,
    callbacks: {
      isDraggable: (piece) => !record.placed.has(piece),
      getPosition: positionOf,
      onPickUp: (piece) => record.pickedUp.push(piece),
      onMove: (piece, position) => record.at.set(piece, position),
      onDrop: (piece, position) => record.dropped.push({ piece, position }),
    },
  };
}

/** A logical point somewhere in the middle of the canvas. */
const MIDDLE: Point = { x: LAYOUT.canvas.width / 2, y: LAYOUT.canvas.height / 2 };

describe("the drag rule", () => {
  it("carries the piece under the finger, lifted clear of it", () => {
    const { record, callbacks } = recorder();
    const dragging = createDragging(LAYOUT, callbacks);
    const from = record.at.get(FIRST)!;

    expect(dragging.press(1, FIRST, MIDDLE)).toBe(true);
    dragging.move(1, { x: MIDDLE.x + 40, y: MIDDLE.y + 40 });

    expect(record.at.get(FIRST)).toEqual({
      x: from.x + 40,
      y: from.y + 40 - FINGER_LIFT,
    });
  });

  it("keeps the piece's own box on the canvas however far the finger goes", () => {
    const { record, callbacks } = recorder();
    const dragging = createDragging(LAYOUT, callbacks);

    dragging.press(1, FIRST, MIDDLE);
    dragging.move(1, { x: -10_000, y: -10_000 });

    const { grip } = boxOf(LAYOUT, FIRST);
    const at = record.at.get(FIRST)!;
    expect(at.x + grip.x).toBeGreaterThanOrEqual(0);
    expect(at.y + grip.y).toBeGreaterThanOrEqual(0);
  });

  it("ignores a pointer that is not the one holding the piece", () => {
    const { record, callbacks } = recorder();
    const dragging = createDragging(LAYOUT, callbacks);

    dragging.press(1, FIRST, MIDDLE);
    const held = record.at.get(FIRST)!;
    dragging.move(2, { x: 10, y: 10 });
    dragging.release(2);

    expect(record.at.get(FIRST)).toEqual(held);
    expect(record.dropped).toEqual([]);
    expect(dragging.holding()).toBe(1);
  });

  it("hands the piece to the newest finger, whatever became of the last one", () => {
    const { record, callbacks } = recorder();
    const dragging = createDragging(LAYOUT, callbacks);

    // A press whose release never arrives - the iPad case this all exists for.
    dragging.press(1, FIRST, MIDDLE);
    dragging.move(1, { x: MIDDLE.x + 100, y: MIDDLE.y });
    const stranded = record.at.get(FIRST)!;

    expect(dragging.press(2, SECOND, MIDDLE)).toBe(true);
    expect(record.pickedUp).toEqual([FIRST, SECOND]);
    // The abandoned piece is settled where it stood, by the ordinary rule.
    expect(record.dropped).toEqual([{ piece: FIRST, position: stranded }]);
    expect(dragging.holding()).toBe(2);
  });

  it("leaves the held piece alone when a stray finger lands on a placed one", () => {
    const { record, callbacks } = recorder();
    const dragging = createDragging(LAYOUT, callbacks);

    record.placed.add(THIRD);
    dragging.press(1, FIRST, MIDDLE);

    expect(dragging.press(2, THIRD, MIDDLE)).toBe(false);
    expect(record.dropped).toEqual([]);
    expect(dragging.holding()).toBe(1);
  });

  it("lets go of whatever is held when the page goes away", () => {
    const { record, callbacks } = recorder();
    const dragging = createDragging(LAYOUT, callbacks);

    dragging.press(1, FIRST, MIDDLE);
    dragging.releaseAll();

    expect(record.dropped.map((drop) => drop.piece)).toEqual([FIRST]);
    expect(dragging.holding()).toBe(null);
    // And letting go twice is not two drops.
    dragging.releaseAll();
    expect(record.dropped).toHaveLength(1);
  });

  it("drops nothing when the board is abandoned", () => {
    const { record, callbacks } = recorder();
    const dragging = createDragging(LAYOUT, callbacks);

    dragging.press(1, FIRST, MIDDLE);
    dragging.abandon();

    expect(record.dropped).toEqual([]);
    expect(dragging.holding()).toBe(null);
    // The pointer that was holding it can no longer move anything.
    const abandoned = record.at.get(FIRST)!;
    dragging.move(1, { x: 10, y: 10 });
    expect(record.at.get(FIRST)).toEqual(abandoned);
  });
});

// --- the wiring -------------------------------------------------------------

interface Listener {
  readonly run: (event: unknown) => void;
  readonly capture: boolean;
}

/** A target that records what was registered on it and fires it by hand. */
class FakeTarget {
  readonly listeners = new Map<string, Listener[]>();

  addEventListener(
    type: string,
    run: (event: never) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const held_ = run as (event: unknown) => void;
    const capture = typeof options === "boolean" ? options : (options?.capture ?? false);
    const listener: Listener = { run: held_, capture };
    const held = this.listeners.get(type) ?? [];
    held.push(listener);
    this.listeners.set(type, held);
    const signal = typeof options === "object" ? options.signal : undefined;
    signal?.addEventListener("abort", () => {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter((one) => one !== listener),
      );
    });
  }

  removeEventListener(type: string, run: (event: never) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((one) => one.run !== (run as unknown)),
    );
  }

  /** How many listeners of this type are registered, for the teardown check. */
  count(type: string): number {
    return (this.listeners.get(type) ?? []).length;
  }

  fire(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener.run(event);
    }
  }
}

/** Enough of an element for `closest(".piece")` and `dataset` to work. */
class FakeElement extends FakeTarget {
  readonly dataset: Partial<Record<string, string>> = {};
  parent: FakeElement | null = null;
  className = "";

  closest(selector: string): FakeElement | null {
    const wanted = selector.replace(".", "");
    if (this.className.split(" ").includes(wanted)) return this;
    return this.parent?.closest(selector) ?? null;
  }
}

/** The class the engine tests pieces against, so a piece is an `SVGGElement`. */
class FakeGroup extends FakeElement {}

// `drag.ts` asks `instanceof Element` and `instanceof SVGGElement`, which do not
// exist outside a browser. Pointing them at the fakes is what lets the real
// wiring run here at all.
const browserGlobals = globalThis as unknown as Record<string, unknown>;
browserGlobals["Element"] = FakeElement;
browserGlobals["SVGGElement"] = FakeGroup;

interface Stage {
  readonly stage: FakeElement;
  readonly view: FakeTarget;
  readonly document: FakeTarget & { visibilityState: string };
  readonly pieces: ReadonlyMap<PieceId, FakeGroup>;
  readonly captured: Set<number>;
  refuseCapture: boolean;
}

function fakeStage(): Stage {
  const captured = new Set<number>();
  const view = new FakeTarget();
  const document = Object.assign(new FakeTarget(), { visibilityState: "visible" });
  const stage = new FakeElement();
  const pieces = new Map<PieceId, FakeGroup>();
  const built: Stage = { stage, view, document, pieces, captured, refuseCapture: false };

  for (const shape of CAST) {
    const element = new FakeGroup();
    element.className = "piece";
    element.dataset["piece"] = shape.id;
    element.parent = stage;
    pieces.set(shape.id, element);
  }

  Object.assign(stage, {
    ownerDocument: Object.assign(document, { defaultView: view }),
    // The container is exactly the canvas, so a client point is a logical one.
    getBoundingClientRect: () => ({ x: 0, y: 0, ...LAYOUT.canvas }),
    setPointerCapture: (pointerId: number) => {
      if (built.refuseCapture) throw new Error("no capture here");
      captured.add(pointerId);
    },
    hasPointerCapture: (pointerId: number) => captured.has(pointerId),
    releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
  });

  return built;
}

interface FakePointerEvent {
  readonly pointerId: number;
  readonly target?: unknown;
  readonly clientX?: number;
  readonly clientY?: number;
  prevented: boolean;
  readonly preventDefault: () => void;
}

function pointerEvent(pointerId: number, at?: Point, target?: unknown): FakePointerEvent {
  const event: FakePointerEvent = {
    pointerId,
    ...(target === undefined ? {} : { target }),
    ...(at === undefined ? {} : { clientX: at.x, clientY: at.y }),
    prevented: false,
    preventDefault: () => {
      event.prevented = true;
    },
  };
  return event;
}

describe("the drag wiring", () => {
  let stage: Stage;
  let record: Host;
  let stop: () => void;

  const pressOn = (piece: PieceId, pointerId: number, at: Point = MIDDLE): FakePointerEvent => {
    const event = pointerEvent(pointerId, at, stage.pieces.get(piece));
    stage.stage.fire("pointerdown", event);
    return event;
  };

  beforeEach(() => {
    stage = fakeStage();
    const kit = recorder();
    record = kit.record;
    stop = enableDragging(stage.stage as unknown as SVGSVGElement, LAYOUT, kit.callbacks);
  });

  it("hears a release that lands anywhere but the stage", () => {
    pressOn(FIRST, 1);
    expect(record.pickedUp).toEqual([FIRST]);

    // A finger lifted on the safe-area strip outside the SVG: the stage is
    // never the target, and the window is the only listener that can hear it.
    stage.view.fire("pointerup", pointerEvent(1));

    expect(record.dropped.map((drop) => drop.piece)).toEqual([FIRST]);
    expect(stage.captured.size).toBe(0);
    // And the board is alive: the next press is taken.
    pressOn(SECOND, 2);
    expect(record.pickedUp).toEqual([FIRST, SECOND]);
  });

  it("takes a capture that is snatched away as a drop", () => {
    pressOn(FIRST, 1);
    stage.stage.fire("lostpointercapture", pointerEvent(1));

    expect(record.dropped.map((drop) => drop.piece)).toEqual([FIRST]);
    // The release that may or may not follow is not a second drop.
    stage.view.fire("pointerup", pointerEvent(1));
    expect(record.dropped).toHaveLength(1);

    pressOn(SECOND, 2);
    expect(record.pickedUp).toEqual([FIRST, SECOND]);
  });

  it("accepts the next press when the release never comes at all", () => {
    pressOn(FIRST, 1);
    stage.view.fire("pointermove", pointerEvent(1, { x: MIDDLE.x + 60, y: MIDDLE.y }));
    // No pointerup, no pointercancel, nothing. WebKit under multi-touch.
    const stranded = record.at.get(FIRST)!;

    pressOn(SECOND, 2);
    expect(record.pickedUp).toEqual([FIRST, SECOND]);
    expect(record.dropped).toEqual([{ piece: FIRST, position: stranded }]);

    // The ghost of the first finger cannot take the second piece back down.
    stage.view.fire("pointerup", pointerEvent(1));
    expect(record.dropped).toHaveLength(1);
    stage.view.fire("pointermove", pointerEvent(2, { x: MIDDLE.x + 30, y: MIDDLE.y }));
    stage.view.fire("pointerup", pointerEvent(2));
    expect(record.dropped.map((drop) => drop.piece)).toEqual([FIRST, SECOND]);
  });

  it("prevents a second finger from starting a gesture over a held piece", () => {
    pressOn(FIRST, 1);
    // Bare sky rather than a piece: nothing to pick up, and still not something
    // the browser may turn into a scroll or a zoom.
    const stray = pointerEvent(2, MIDDLE, stage.stage);
    stage.stage.fire("pointerdown", stray);

    expect(stray.prevented).toBe(true);
    expect(record.dropped).toEqual([]);
    expect(record.pickedUp).toEqual([FIRST]);
  });

  it("lets go of the piece when the page is hidden", () => {
    pressOn(FIRST, 1);
    stage.document.visibilityState = "hidden";
    stage.document.fire("visibilitychange", {});

    expect(record.dropped.map((drop) => drop.piece)).toEqual([FIRST]);
    expect(stage.captured.size).toBe(0);

    stage.document.visibilityState = "visible";
    stage.document.fire("visibilitychange", {});
    pressOn(SECOND, 2);
    expect(record.pickedUp).toEqual([FIRST, SECOND]);
  });

  it("lets go of the piece when the page is unloaded", () => {
    pressOn(FIRST, 1);
    stage.view.fire("pagehide", {});

    expect(record.dropped.map((drop) => drop.piece)).toEqual([FIRST]);
  });

  it("still drags when the browser refuses to capture the pointer", () => {
    stage.refuseCapture = true;

    pressOn(FIRST, 1);
    stage.view.fire("pointermove", pointerEvent(1, { x: MIDDLE.x + 25, y: MIDDLE.y }));
    stage.view.fire("pointerup", pointerEvent(1));

    expect(record.pickedUp).toEqual([FIRST]);
    expect(record.dropped).toHaveLength(1);
  });

  it("takes its listeners off the window when the board is replaced", () => {
    expect(stage.view.count("pointerup")).toBe(1);

    pressOn(FIRST, 1);
    stop();

    // Nothing is settled onto a board that has gone...
    expect(record.dropped).toEqual([]);
    // ...and nothing is left listening for the next one to be built over.
    expect(stage.view.count("pointerup")).toBe(0);
    expect(stage.view.count("pointercancel")).toBe(0);
    expect(stage.view.count("pointermove")).toBe(0);
    expect(stage.view.count("pagehide")).toBe(0);
    expect(stage.document.count("visibilitychange")).toBe(0);
    expect(stage.stage.count("pointerdown")).toBe(0);

    stage.view.fire("pointerup", pointerEvent(1));
    expect(record.dropped).toEqual([]);
  });
});
