/**
 * Builds the SVG scene graph: the backdrop the kind draws, the draggable
 * pieces, and the chrome around them. Rendering only - all decisions live in
 * game.ts and in the puzzle kind. Only the current level's pieces are built.
 *
 * A piece is more than its drawing, though: each one carries an invisible
 * rectangle over its artwork so it can be picked up anywhere inside that box.
 * See `fitGrabBox`.
 */
import { padWithin, type Point } from "./geometry";
import { replayArrow } from "./icons";
import { GRAB_PADDING, boxOf, type Layout } from "./layout";
import { CHAPTERS, LEVEL_COUNT, chapterNumber } from "./levels";
import type { PieceId, PieceShape } from "./piece";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface Board {
  readonly stage: SVGSVGElement;
  /** Everything behind the pieces; the kind decides what goes in it. */
  readonly backdropLayer: SVGGElement;
  /**
   * Where a kind played by touch draws what the child can touch
   * (`PuzzleKind.play`). Empty for every kind that is played by dragging.
   */
  readonly activityLayer: SVGGElement;
  readonly piecesLayer: SVGGElement;
  /**
   * Where a chapter celebration puts its balloons, its parade and its fireworks
   * (`celebration.ts`). Deliberately *under* `fxLayer`: the sparkles and the big
   * button onwards are drawn there, so nothing a celebration floats can ever
   * cover the way out of it.
   */
  readonly celebrationLayer: SVGGElement;
  readonly fxLayer: SVGGElement;
  readonly pieces: ReadonlyMap<PieceId, SVGGElement>;
  readonly resetButton: SVGGElement;
}

export interface BoardOptions {
  /**
   * Build the level's pieces as draggable things in the tray. False for a level
   * that is played by touching what is already in the scene: its kind deals a
   * cast so the board can be composed around it, but nothing goes in the tray
   * and there is nothing to pick up. See `PuzzleKind.play`.
   */
  readonly pieces?: boolean;
}

/** An element built for the current level. Throws if the piece isn't in play. */
export function elementFor(
  elements: ReadonlyMap<PieceId, SVGGElement>,
  piece: PieceId,
): SVGGElement {
  const element = elements.get(piece);
  if (!element) throw new Error(`Piece "${piece}" is not on the board.`);
  return element;
}

function group(className?: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  if (className) g.setAttribute("class", className);
  return g;
}

export function setPiecePosition(piece: SVGGElement, position: Point): void {
  // Set via CSS rather than the `transform` attribute so the settle animation
  // in style.css can transition it.
  piece.style.transform = `translate(${position.x}px, ${position.y}px)`;
}

function buildPiece(shape: PieceShape, scale: number): SVGGElement {
  const piece = group("piece");
  piece.dataset["piece"] = shape.id;
  piece.setAttribute("role", "img");
  piece.setAttribute("aria-label", shape.label);

  const art = group("art");
  art.setAttribute("transform", `scale(${scale})`);
  art.innerHTML = shape.artwork;
  piece.append(art);
  return piece;
}

/**
 * Give a piece an invisible rectangle covering its artwork, so it can be picked
 * up anywhere inside that box instead of only where a finger happens to land on
 * paint. The gap between a giraffe's legs and the notch under a duck's tail are
 * inside the animal as far as a two-year-old is concerned; without this they
 * are dead space that swallows the press and moves nothing.
 *
 * Do not delete this as unused markup - nothing else makes those places
 * grabbable. The reasoning is decision 0010.
 *
 * Three details are load-bearing:
 *
 *  - it goes *inside* the artwork group, so it is in authored units and moves
 *    and scales with the piece;
 *  - it goes *first*, so it sits behind the artwork rather than over it;
 *  - `fill="transparent"` is a paint and so is hit-testable, where
 *    `fill="none"` would not be, and leaving `pointer-events` alone lets
 *    `.piece.is-placed` in style.css go on switching the whole piece off.
 *
 * A shape that declares its own `inked` bounds is taken at its word rather than
 * measured. A slice is drawn by clipping a whole animal, and `getBBox` does not
 * see a clip: measuring one would hand every slice of an animal the same
 * animal-sized grab box, and three of those in a tray would fight over a press.
 */
function fitGrabBox(piece: SVGGElement, shape: PieceShape): void {
  const art = piece.querySelector(".art");
  if (!(art instanceof SVGGElement)) return;

  // In the element's own units, i.e. before its `scale()`. Measured rather than
  // declared per animal, so redrawing one moves its grab box with it.
  const drawn = shape.inked ?? art.getBBox();
  // An unmeasurable piece keeps the artwork it already had to be grabbed by,
  // which is no worse than having no grab box at all.
  if (drawn.width <= 0 || drawn.height <= 0) return;

  const padding = GRAB_PADDING * Math.min(shape.box.width, shape.box.height);
  const box = padWithin(drawn, padding, shape.box);

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("class", "grab-box");
  rect.setAttribute("x", String(box.x));
  rect.setAttribute("y", String(box.y));
  rect.setAttribute("width", String(box.width));
  rect.setAttribute("height", String(box.height));
  rect.setAttribute("fill", "transparent");
  art.prepend(rect);
}

function buildResetButton(canvasHeight: number): SVGGElement {
  const button = group("reset-button");
  button.setAttribute("transform", `translate(58 ${canvasHeight - 58})`);
  button.setAttribute("role", "button");
  button.setAttribute("aria-label", "Start a fresh puzzle");
  button.innerHTML = `
    <circle r="32" fill="#ffffff" fill-opacity="0.82" stroke="#4f7d8c" stroke-width="4" />
    ${replayArrow(13, 6, "#4f7d8c")}
  `;
  return button;
}

/**
 * One dot per chapter, filled up to the one being played, so a grown-up can see
 * how far along the thirty levels are. A dot per level would be thirty of them
 * across the bottom of the board; the chapters are the six milestones worth
 * showing, and the exact level is in the label for anyone who wants it.
 *
 * Deliberately not interactive: every target a toddler can hit should do
 * something they meant to do.
 */
function buildChapterDots(layout: Layout): SVGGElement {
  const chapter = chapterNumber(layout.level);
  const dots = group("chapter-dots");
  dots.setAttribute("transform", `translate(122 ${layout.canvas.height - 58})`);
  dots.setAttribute("aria-label", `Level ${layout.level.level} of ${LEVEL_COUNT}`);
  dots.style.pointerEvents = "none";
  dots.innerHTML = Array.from({ length: CHAPTERS.length }, (_, index) => {
    const reached = index < chapter;
    return `<circle cx="${index * 32}" cy="0" r="11"
      fill="${reached ? "#ffd23f" : "#ffffff"}" fill-opacity="${reached ? 1 : 0.35}"
      stroke="#4f7d8c" stroke-width="3" stroke-opacity="0.75" />`;
  }).join("");
  return dots;
}

export function buildBoard(root: HTMLElement, layout: Layout, options: BoardOptions = {}): Board {
  const stage = document.createElementNS(SVG_NS, "svg");
  stage.setAttribute("id", "stage");
  stage.setAttribute("viewBox", `0 0 ${layout.canvas.width} ${layout.canvas.height}`);
  stage.setAttribute("preserveAspectRatio", "xMidYMid meet");
  stage.dataset["layout"] = layout.id;
  stage.dataset["level"] = String(layout.level.level);
  stage.dataset["chapter"] = layout.level.chapter;
  // Which kind is actually playing, which is the level's own until the kind it
  // asked for is built; see kinds/registry.ts.
  stage.dataset["kind"] = layout.level.kind;

  const backdropLayer = group("backdrop");
  const activityLayer = group("activity");
  const piecesLayer = group("pieces");
  const celebrationLayer = group("celebration");
  const fxLayer = group("fx");

  const built = options.pieces ?? true;
  const pieces = new Map<PieceId, SVGGElement>();
  if (built) {
    for (const shape of layout.pieces) {
      // Authored units -> logical units, at this piece's own scale.
      const piece = buildPiece(shape, boxOf(layout, shape.id).scale);
      pieces.set(shape.id, piece);
      piecesLayer.append(piece);
    }
  }

  const resetButton = buildResetButton(layout.canvas.height);
  stage.append(
    backdropLayer,
    activityLayer,
    piecesLayer,
    celebrationLayer,
    fxLayer,
    resetButton,
    buildChapterDots(layout),
  );

  root.replaceChildren(stage);

  // Measuring artwork needs it in the document, so the grab boxes are fitted
  // once the board is mounted rather than while it is being built.
  if (built) for (const shape of layout.pieces) fitGrabBox(elementFor(pieces, shape.id), shape);

  return {
    stage,
    backdropLayer,
    activityLayer,
    piecesLayer,
    celebrationLayer,
    fxLayer,
    pieces,
    resetButton,
  };
}
