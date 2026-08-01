/**
 * What happens when a chapter ends, and what happens when the game does.
 *
 * Thirty levels that all end with the same four-note fanfare and the same
 * sparkle flatten completely: by level twenty the reward for finishing has
 * stopped meaning anything, and after level thirty there was nothing at all -
 * the arrow simply looped back to level 1 as though nothing had happened. So
 * the end of each chapter is a moment of its own, and the end of the game is a
 * party that does not stop.
 *
 * **A celebration is played, not watched.** This is the whole design and every
 * decision below follows from it. A two-year-old will not sit through a
 * cutscene; they will put a finger on it, and what a finger lands on has to
 * answer. So every celebration is a thing to do: balloons to pop, animals to
 * poke, a sky to fire into, a rainbow to paint. Nothing here is a film.
 *
 * **A celebration is never made of what the finished board is made of.** It is
 * drawn over the puzzle the child has just solved, so anything it has in common
 * with that puzzle arrives as a second copy of it: the parade of animals ended
 * the chapter of animals once, and an elephant walking over an elephant is one
 * busy picture rather than one thing happening. That is why the parade is hung
 * on the chapter of coloured shapes and deals from the animals the board is not
 * holding. See [decision 20260801T160000](../docs/decisions/20260801T160000-a-celebration-is-not-made-of-the-board.md).
 *
 * **A celebration is not a level, and deliberately not a `PuzzleKind`.** A kind
 * is dealt a cast, composes a layout, cuts holes, judges drops, and above all is
 * named by a row of the thirty-level table - the one place difficulty is tuned.
 * A celebration has none of those: no pieces, no targets, no difficulty and no
 * place in the thirty. Putting it in the table would mean inventing levels
 * nobody plays. What it does copy from `PuzzleKind.play` is the *shape*: it is
 * handed a layer, it answers the finger itself, it returns a teardown, and its
 * progress lives outside the board so that turning the tablet does not lose it.
 * See [decision 20260729T152400](../docs/decisions/20260729T152400-a-celebration-is-played-not-finished.md).
 *
 * **It cannot be a trap at either end.** Two failures are possible and both are
 * closed here:
 *
 *  - a child who pops everything in four seconds must not be left looking at an
 *    empty screen, so things keep arriving by themselves for half a minute;
 *  - a child who touches nothing must not be stuck, so the big button onwards is
 *    on screen from the first instant of the celebration rather than after it,
 *    and it is the same button they have pressed at the end of every level.
 *
 * Nothing here ever moves the child on by itself. A clock that advanced the
 * level would take the game away mid-tap, and a celebration that had to be
 * finished would be another level. What the half-minute governs is only whether
 * *new* things arrive unasked; everything already on screen goes on answering a
 * finger for as long as the child stays.
 *
 * The floating and the bursting are `pop.ts`, shared with the bubbles of the
 * first chapter, so a balloon bursts with exactly the feel of a bubble.
 * `prefers-reduced-motion` is honoured through `motion.ts` as everywhere else:
 * the moment still happens, more calmly.
 */
import { playFirework, playPlink, playPop, unlockAudio } from "./audio";
import { sparkleBurst } from "./celebrate";
import { shuffle, type Point } from "./geometry";
import type { Layout } from "./layout";
import type { ChapterId } from "./levels";
import { prefersReducedMotion } from "./motion";
import type { PieceShape } from "./piece";
import { POP_COLOURS, popBurst, releasePoppable, type Poppable } from "./pop";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * How long new things go on arriving unasked - about the half-minute of delight
 * the celebration is meant to be. It ends the *arriving*, never the
 * celebration: whatever is on screen when it expires still answers a finger,
 * and the way onwards was there from the start.
 */
export const CELEBRATION_SPAN_MS = 30_000;

export type CelebrationId = "balloons" | "parade" | "petals" | "rainbow" | "fireworks" | "finale";

/**
 * Which chapter ends with which celebration. Keyed by chapter rather than by
 * level number, so retuning the ramp cannot strand a celebration in the middle
 * of a chapter; `endsChapter` in `levels.ts` says when one is due.
 *
 * The order is a ramp of its own. The first chapter's is the balloons, because
 * a one-year-old has just spent five levels learning that a finger makes things
 * happen and a balloon is that sentence again; the rainbow follows it, because
 * a finger that bursts a thing and a finger that builds a thing are one step
 * apart. The last is the finale, which is every other celebration at once and
 * never stops.
 *
 * The rest of the order is settled by the rule at the top of this file: the
 * parade is made of animals, so it ends the chapter of coloured shapes and not
 * the chapter of animals, where it used to walk an elephant over an elephant.
 */
export const CELEBRATIONS: Record<ChapterId, CelebrationId> = {
  "first-touches": "balloons",
  animals: "rainbow",
  "sliced-animals": "petals",
  shapes: "parade",
  pictures: "fireworks",
  mastery: "finale",
};

/** The celebration that ends the whole game rather than a chapter. */
export const FINALE: CelebrationId = "finale";

/** What ends this chapter. */
export function celebrationFor(chapter: ChapterId): CelebrationId {
  return CELEBRATIONS[chapter];
}

/** What the host lends a celebration: a layer, a layout, and the cast. */
export interface CelebrationStage {
  /**
   * Where to draw. It sits above the pieces and *below* the effects layer, so a
   * balloon can never float over the button onwards.
   */
  readonly layer: SVGGElement;
  /** Above everything: where a sparkle goes, and where the button already is. */
  readonly fxLayer: SVGGElement;
  readonly layout: Layout;
  /**
   * The pieces this level was dealt - what the finished board is holding, and
   * so what a celebration may *not* draw. The parade reads it as an exclusion
   * list rather than as a cast: an animal standing in its own hole must not
   * also be walking over it.
   */
  readonly pieces: readonly PieceShape[];
  /** Every shape the game has, for a parade or a finale to deal from. */
  readonly cast: readonly PieceShape[];
  /** The level's own random source, so `?seed=` still means something. */
  readonly random: () => number;
}

export interface Celebration {
  readonly id: CelebrationId;
  /** Whether things go on arriving for ever. Only the finale does. */
  readonly endless: boolean;
  /**
   * Draw it and answer the finger. Called once per mounted board, so again
   * after the tablet is turned - what has been played with survives, because it
   * is counted here rather than on the board. Whatever is returned is called
   * before the next board goes up.
   */
  mount(stage: CelebrationStage): () => void;
}

/** Everything tunable, as fractions of the canvas wherever it is a size. */
const TUNING = {
  /** A balloon's radius. Bigger than a bubble: this is a treat, not a level. */
  balloonRadius: 0.088,
  balloonsAtOnce: 7,
  /**
   * How fast a balloon rises, in logical units per millisecond. Twice a
   * bubble's, and deliberately: a bubble is a level, paced so a child has time
   * to aim, while a balloon is a party, and balloons let go at a party go up.
   * It is also what keeps the sky full - a replacement that took four seconds
   * to climb into reach would leave a child who popped the lot looking at
   * nothing, which is the one thing a celebration must never do.
   */
  balloonSpeed: 0.16,
  balloonSway: 0.06,
  petalRadius: 0.072,
  /**
   * More than there are balloons, because blossom falls thicker than balloons
   * rise and because a wide board with four petals on it reads as a fault
   * rather than as a quiet moment. Petals fall slowly, so a full sky stays
   * full: the number is what is on screen, not a rate.
   */
  petalsAtOnce: 9,
  petalSpeed: 0.05,
  petalSway: 0.1,
  /**
   * How far through its journey a floater gives up its place in the sky, so
   * that its replacement is on its way while it is still there to be popped.
   * Anything close to 1 lets a handful released together reach the edge
   * together and leave a hole behind them - and an empty screen is the one
   * thing a celebration must never show a child who looked away for a moment.
   */
  handOnAt: 0.55,
  /** How wide a parading animal is drawn. */
  paradeWidth: 0.19,
  /** How fast one walks, in logical units per millisecond. */
  paradeSpeed: 0.055,
  /** How many animals walk in a parade, at most - a chapter's or the finale's. */
  paradeAtOnce: 5,
  arcs: 7,
  /** How often an arc paints itself if nobody asks for one. */
  arcEvery: 1800,
  /** How often a firework goes off on its own. */
  fireworkEvery: 2100,
  fireworkRadius: 0.11,
} as const;

/** Blossom rather than the pop palette: petals are pale, balloons are not. */
const PETAL_COLOURS: readonly string[] = [
  "#ffc2d1",
  "#ffe5ec",
  "#f7d6ff",
  "#fff3b0",
  "#ffb7c5",
  "#e8d5ff",
];

/** The seven arcs, outermost first. */
const RAINBOW: readonly string[] = [
  "#ff6b6b",
  "#ffa14a",
  "#ffd23f",
  "#7ed957",
  "#6ec6ff",
  "#7a86e8",
  "#c9a7f5",
];

/** How long a response takes; under `prefers-reduced-motion`, no time at all. */
const beat = (ms: number): number => (prefersReducedMotion() ? 1 : ms);

function element(name: string, attributes: Record<string, string> = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

const group = (attributes: Record<string, string> = {}): SVGGElement =>
  element("g", attributes) as SVGGElement;

/**
 * What a celebration is given to play with. Deliberately thin, and deliberately
 * the same idea as `ActivityHost`: a place to draw, a way to say that something
 * was played with, and somewhere to hang what has to be let go of.
 */
interface Party {
  readonly stage: CelebrationStage;
  /** Something answered a finger. Counted so a screenshot run can see it. */
  answer(at?: Point): void;
  /** How many things have answered, across re-mounts. */
  answered(): number;
  /** Are new things still arriving unasked? */
  arriving(): boolean;
  /** A repeating timer, cleared when the board goes. */
  every(ms: number, run: () => void): void;
  /** A one-shot timer, cleared when the board goes. */
  after(ms: number, run: () => void): void;
  /** Something else to let go of when the board goes. */
  onStop(run: () => void): void;
}

/**
 * A thing a finger can land on, answered in the tick it landed. `pointerdown`
 * rather than click, and nothing waits for an animation, for the same reason
 * the cause-and-effect levels do it this way.
 */
function touchable(what: string, onTouch: (at: Point) => void): SVGGElement {
  const thing = group({ class: "thing" });
  thing.dataset["touch"] = what;
  thing.style.cursor = "pointer";
  thing.addEventListener("pointerdown", (event: PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    unlockAudio();
    onTouch({ x: event.clientX, y: event.clientY });
  });
  return thing;
}

/**
 * A shape drawn `width` across, with its origin at the point it stands on, and
 * a transparent rectangle over the whole of it so that the gap between a
 * giraffe's legs is still the giraffe. The same reasoning as `fitGrabBox` in
 * `board.ts`, without the measuring: nothing here has to be picked up
 * precisely, so the authored box is target enough.
 */
function standing(shape: PieceShape, width: number): SVGGElement {
  const scale = width / shape.box.width;
  const holder = group();
  holder.style.transformOrigin = "0 0";
  const art = group({
    transform: `translate(${(-shape.anchor.x * scale).toFixed(1)} ${(-shape.anchor.y * scale).toFixed(1)}) scale(${scale})`,
  });
  art.innerHTML = `<rect x="0" y="0" width="${shape.box.width}" height="${shape.box.height}" fill="transparent" />${shape.artwork}`;
  holder.append(art);
  return holder;
}

/** The line a rainbow stands on and an animal walks along: the horizon. */
const horizonOf = (layout: Layout): number => layout.horizon;

/** The lines this layout stands its pieces on, lowest first. */
function groundLine(layout: Layout, index: number): number {
  const lines = layout.groundLines;
  if (lines.length === 0) return layout.horizon + (layout.canvas.height - layout.horizon) * 0.55;
  return lines[lines.length - 1 - (index % lines.length)] as number;
}

/**
 * A transparent sheet over the whole board, so that a tap anywhere is a tap.
 * It goes in the celebration layer, which is under the effects, so it can never
 * swallow the button onwards or the sparkles.
 */
function skyCatcher(party: Party, onTap: (at: Point) => void): SVGGElement {
  const { width, height } = party.stage.layout.canvas;
  const catcher = touchable("sky", onTap);
  catcher.append(
    element("rect", {
      x: "0",
      y: "0",
      width: `${width}`,
      height: `${height}`,
      fill: "transparent",
    }),
  );
  return catcher;
}

/**
 * Where a tap landed, in the layout's own units. The pointer event gives client
 * pixels, and a burst has to happen under the finger rather than at the corner
 * of the board.
 */
function inLayout(layer: SVGGElement, at: Point, layout: Layout): Point {
  const stage = layer.ownerSVGElement;
  if (!stage) return at;
  const box = stage.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return at;
  return {
    x: ((at.x - box.x) / box.width) * layout.canvas.width,
    y: ((at.y - box.y) / box.height) * layout.canvas.height,
  };
}

// --- balloons ---------------------------------------------------------------
// The anchor idea, and the first chapter's. A one-year-old has just spent five
// levels learning that a finger makes things happen; a balloon is that sentence
// said again with no level attached to it.

function balloons(party: Party, options: { at: number } = { at: TUNING.balloonsAtOnce }): void {
  const { layer, layout, random } = party.stage;
  const { width, height } = layout.canvas;
  const still = prefersReducedMotion();
  const afloat = new Set<Poppable>();
  let holding = 0;
  let minted = 0;

  function release(): void {
    const radius = width * TUNING.balloonRadius * (1 + (random() - 0.5) * 0.24);
    const margin = radius + width * 0.03;
    const x = margin + random() * Math.max(1, width - 2 * margin);
    const colour = POP_COLOURS[minted % POP_COLOURS.length] as string;
    // The opening handful is already in the air rather than queued below the
    // bottom edge, so a child who is quick has something to pop in the first
    // tick. Only the replacements come up from underneath.
    const opening = minted < options.at;
    const lane = (minted + 0.5) / options.at;
    minted++;
    const startY = still
      ? radius * 1.5 + random() * Math.max(1, height - radius * 3)
      : opening
        ? height * (0.45 + lane * 0.5)
        : height + radius * (0.05 + random() * 0.35);
    const ceiling = -radius * 2.4;
    const climb = (startY - ceiling) / TUNING.balloonSpeed;

    holding++;
    let handedOn = false;
    /**
     * Give up this balloon's place in the sky. Called when it bursts, when it
     * leaves the top, and - the point of the whole thing - part way up, so that
     * its replacement is already climbing while it is still there to be popped.
     * Without that, seven balloons released together all reach the top together
     * and leave a hole of a second or two behind them, which is precisely the
     * empty screen a celebration must never show.
     */
    function handOn(): void {
      if (handedOn) return;
      handedOn = true;
      holding--;
      topUp();
    }

    const balloon: Poppable = releasePoppable(layer, {
      at: { x, y: startY },
      radius,
      colour,
      shape: "balloon",
      touch: "balloon",
      ...(still
        ? {}
        : {
            drift: {
              to: { x, y: ceiling },
              ms: climb,
              sway: (random() - 0.5) * 2 * width * TUNING.balloonSway,
            },
          }),
      onPop: (at) => {
        afloat.delete(balloon);
        unlockAudio();
        playPop((width * TUNING.balloonRadius) / radius);
        party.answer(at);
        handOn();
      },
      onEscape: () => {
        afloat.delete(balloon);
        handOn();
      },
    });
    afloat.add(balloon);
    if (!still) party.after(climb * TUNING.handOnAt, handOn);
  }

  /**
   * However many have handed on their place, that many arrive - until the
   * half-minute is up, at which point the sky simply stops refilling. What is
   * still afloat goes on bursting for as long as the child wants it to.
   */
  function topUp(): void {
    if (!party.arriving()) return;
    while (holding < options.at) release();
  }

  topUp();
  // Covers a tab that was in the background while no animation was running, in
  // the same belt-and-braces way the bubbles level does it.
  party.every(1500, topUp);
  party.onStop(() => {
    for (const balloon of afloat) balloon.remove();
    afloat.clear();
  });
}

// --- petals -----------------------------------------------------------------
// Blossom coming down over the finished picture. Deliberately the balloons'
// sibling rather than a new mechanic: what the issue described - petals swirling
// away from a passing finger - needs a drag the rest of this game does not have,
// and a toddler's press-and-hold would fight it. Same verb, different weather.

function petals(party: Party, options: { at: number } = { at: TUNING.petalsAtOnce }): void {
  const { layer, layout, random } = party.stage;
  const { width, height } = layout.canvas;
  const still = prefersReducedMotion();
  const falling = new Set<Poppable>();
  let holding = 0;
  let minted = 0;

  function release(): void {
    const radius = width * TUNING.petalRadius * (1 + (random() - 0.5) * 0.22);
    const margin = radius + width * 0.02;
    const x = margin + random() * Math.max(1, width - 2 * margin);
    const colour = PETAL_COLOURS[minted % PETAL_COLOURS.length] as string;
    const opening = minted < options.at;
    const lane = (minted + 0.5) / options.at;
    minted++;
    const startY = still
      ? radius * 1.5 + random() * Math.max(1, height - radius * 3)
      : opening
        ? height * (0.62 - lane * 0.6)
        : -radius * (1.2 + random() * 0.8);
    const floorY = height + radius * 2.4;
    const fall = (floorY - startY) / TUNING.petalSpeed;

    holding++;
    let handedOn = false;
    /** As for a balloon: give up the place part way down, not at the bottom. */
    function handOn(): void {
      if (handedOn) return;
      handedOn = true;
      holding--;
      topUp();
    }

    const petal: Poppable = releasePoppable(layer, {
      at: { x, y: startY },
      radius,
      colour,
      shape: "petal",
      touch: "petal",
      ...(still
        ? {}
        : {
            drift: {
              to: { x, y: floorY },
              ms: fall,
              sway: (random() - 0.5) * 2 * width * TUNING.petalSway,
            },
          }),
      onPop: (at) => {
        falling.delete(petal);
        unlockAudio();
        // A petal scatters rather than bursts, so it answers with a note out of
        // the pentatonic scale instead of the bubble's pop.
        playPlink(party.answered());
        party.answer(at);
        handOn();
      },
      onEscape: () => {
        falling.delete(petal);
        handOn();
      },
    });
    falling.add(petal);
    if (!still) party.after(fall * TUNING.handOnAt, handOn);
  }

  function topUp(): void {
    if (!party.arriving()) return;
    while (holding < options.at) release();
  }

  topUp();
  party.every(1500, topUp);
  party.onStop(() => {
    for (const petal of falling) petal.remove();
    falling.clear();
  });
}

// --- a parade ---------------------------------------------------------------
// Animals walking across the board. Every one of them answers a touch with a hop
// and a note, so a parade is something to poke rather than something to sit
// through.
//
// They are dealt from the whole roster rather than from the pieces the child
// has just placed, and anything the finished board is holding is left out of
// the deal. A parade made of the board's own pieces was the same animals twice
// over - one set still in their holes, one set walking over them - which reads
// as one busy picture rather than as one thing happening. See
// [decision 20260801T160000](../docs/decisions/20260801T160000-a-celebration-is-not-made-of-the-board.md).

/** The animals to walk: dealt from the roster, minus whatever is on the board. */
function paradeCast(stage: CelebrationStage): readonly PieceShape[] {
  const onTheBoard = new Set(stage.pieces.map((piece) => piece.id));
  const spare = stage.cast.filter((shape) => !onTheBoard.has(shape.id));
  // The board's own pieces only when there is nothing else left to walk, which
  // no level of the thirty does - an empty parade would be worse than a busy one.
  const roster = spare.length > 0 ? spare : stage.cast;
  return shuffle(roster, stage.random).slice(0, TUNING.paradeAtOnce);
}

function parade(party: Party): void {
  const cast = paradeCast(party.stage);
  const { layer, layout } = party.stage;
  const { width } = layout.canvas;
  const still = prefersReducedMotion();
  const size = width * TUNING.paradeWidth;
  const span = width + size * 2;

  cast.forEach((shape, index) => {
    const lane = groundLine(layout, index % Math.max(1, layout.groundLines.length));
    const walker = group({ transform: `translate(0 ${lane.toFixed(1)})` });
    const stride = group();
    stride.style.transformOrigin = "0 0";
    const bob = group();
    bob.style.transformOrigin = "0 0";
    const body = standing(shape, size);
    bob.append(body);
    stride.append(bob);
    walker.append(stride);

    const thing = touchable("animal", () => {
      playPlink(index);
      // A hop rather than a wobble: the answer has to be visible from across a
      // room, and a hop is what an excited two-year-old does back.
      body.animate(
        [
          { transform: "translateY(0px) rotate(0deg)" },
          { transform: `translateY(${(-size * 0.3).toFixed(1)}px) rotate(-9deg)` },
          { transform: `translateY(${(-size * 0.12).toFixed(1)}px) rotate(7deg)` },
          { transform: "translateY(0px) rotate(0deg)" },
        ],
        { duration: beat(520), easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
      );
      party.answer();
    });
    thing.setAttribute("aria-label", shape.label);
    thing.dataset["piece"] = shape.id;
    thing.append(walker);
    layer.append(thing);

    if (still) {
      // Standing in a row instead of walking, spread across the board so every
      // one of them is in reach. The touch, the hop and the note are unchanged.
      const at = size + ((index + 0.5) / cast.length) * Math.max(1, width - size * 2);
      stride.style.transform = `translateX(${at.toFixed(1)}px)`;
      return;
    }

    const ms = span / TUNING.paradeSpeed;
    // A negative delay starts each animal partway along its own walk, which
    // spreads the line out from the first frame rather than after a lap.
    stride.animate(
      [
        { transform: `translateX(${(-size).toFixed(1)}px)` },
        { transform: `translateX(${(width + size).toFixed(1)}px)` },
      ],
      { duration: ms, iterations: Infinity, delay: -(index / cast.length) * ms, easing: "linear" },
    );
    bob.animate(
      [
        { transform: "translateY(0px)" },
        { transform: `translateY(${(-size * 0.07).toFixed(1)}px)` },
        { transform: "translateY(0px)" },
      ],
      { duration: beat(620), iterations: Infinity, easing: "ease-in-out" },
    );
  });
}

// --- a rainbow --------------------------------------------------------------
// The one celebration the child *makes*. A tap anywhere paints the next arc, and
// if nobody taps, an arc arrives by itself every second or two - so it draws
// itself for a child who is watching and is painted by a child who is not.

/** How many arcs are up, given how many things have answered. */
export function arcsPainted(answered: number): number {
  return Math.min(TUNING.arcs, Math.max(0, answered));
}

interface Arcs {
  /** Paint the next arc that is not up yet. False if all seven already are. */
  paint(index: number, animated: boolean): boolean;
  /** Answer a tap on a rainbow that is already whole. */
  shimmer(): void;
}

function rainbowArcs(party: Party, upTo: number): Arcs {
  const { layer, layout } = party.stage;
  const { width } = layout.canvas;
  const centre = { x: width / 2, y: horizonOf(layout) };
  // It stands on the horizon and is as big as the board will let it be, rather
  // than as big as the strip of sky above the horizon: a rainbow that fitted
  // politely into the band the scenery left it would be a decoration, and this
  // is meant to be the thing that has happened.
  const outer = Math.max(60, Math.min(width * 0.46, centre.y * 0.92));
  const thickness = outer * 0.055;

  const arcs = group({ class: "rainbow" });
  arcs.style.pointerEvents = "none";
  layer.append(arcs);

  function paint(index: number, animated: boolean): boolean {
    if (index >= TUNING.arcs) return false;
    const radius = outer - index * thickness;
    if (radius <= thickness) return false;
    const arc = element("path", {
      class: "rainbow-arc",
      d: `M${(centre.x - radius).toFixed(1)} ${centre.y.toFixed(1)} A${radius.toFixed(1)} ${radius.toFixed(1)} 0 0 1 ${(centre.x + radius).toFixed(1)} ${centre.y.toFixed(1)}`,
      fill: "none",
      stroke: RAINBOW[index] as string,
      "stroke-width": thickness.toFixed(1),
      "stroke-linecap": "round",
      "stroke-opacity": "0.8",
    });
    arcs.append(arc);
    if (!animated || prefersReducedMotion()) return true;
    // Half a circle, close enough for a dash: the arc wipes itself on from one
    // end rather than fading in, which is what "draws itself" means.
    const length = Math.PI * radius;
    arc.style.strokeDasharray = String(length);
    arc.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: 620,
      easing: "cubic-bezier(0.3, 0.7, 0.3, 1)",
      fill: "forwards",
    });
    return true;
  }

  // Whatever was already painted comes back without redrawing itself: the
  // tablet was turned, and an arc that had to be earned again would be progress
  // lost.
  for (let i = 0; i < upTo; i++) paint(i, false);

  return {
    paint,
    shimmer() {
      arcs.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
        duration: beat(520),
        easing: "ease-in-out",
      });
    },
  };
}

function rainbow(party: Party): void {
  const { layer, layout } = party.stage;
  const arcs = rainbowArcs(party, arcsPainted(party.answered()));

  function next(byHand: boolean): void {
    const painted = arcsPainted(party.answered());
    if (painted >= TUNING.arcs) {
      if (!byHand) return;
      // Finished, and still worth answering: the game never goes quiet on a
      // child who is enjoying itself.
      playPlink(party.answered());
      arcs.shimmer();
      party.answer();
      return;
    }
    arcs.paint(painted, true);
    playPlink(painted);
    party.answer();
  }

  layer.append(
    skyCatcher(party, (at) => {
      sparkleBurst(party.stage.fxLayer, inLayout(layer, at, layout));
      next(true);
    }),
  );

  party.every(TUNING.arcEvery, () => {
    if (!party.arriving()) return;
    next(false);
  });
}

// --- fireworks --------------------------------------------------------------
// Night falls over the finished board and the whole sky becomes the target: a
// tap anywhere sets one off there, at once, and more go up by themselves in
// between. The one celebration where a child who taps wildly is exactly right.

/**
 * A burst where it was asked for. `byHand` is what the child did, and is the
 * only thing counted - a sky that filled its own tally would make "how much has
 * been played with" a measure of how long the celebration had been up.
 */
function firework(party: Party, at: Point, note: number, byHand: boolean): void {
  const { layer, layout, random } = party.stage;
  const colours = shuffle(POP_COLOURS, random);
  const radius = layout.canvas.width * TUNING.fireworkRadius;
  // A bright core under the scatter. The pop palette is pastel, which is right
  // against a daytime sky and almost invisible against a night one, so a
  // firework brings its own light with it.
  const flash = element("circle", {
    r: (radius * 0.5).toFixed(1),
    cx: at.x.toFixed(1),
    cy: at.y.toFixed(1),
    fill: "#fff6cc",
  });
  flash.style.pointerEvents = "none";
  flash.style.transformOrigin = `${at.x.toFixed(1)}px ${at.y.toFixed(1)}px`;
  layer.append(flash);
  flash
    .animate(
      [
        { transform: "scale(0.4)", opacity: 0.95 },
        { transform: "scale(1.9)", opacity: 0 },
      ],
      {
        duration: beat(520),
        easing: "cubic-bezier(0.1, 0.7, 0.3, 1)",
      },
    )
    .addEventListener("finish", () => flash.remove());
  popBurst(layer, at, radius, colours[0] as string);
  popBurst(layer, at, radius * 0.62, colours[1 % colours.length] as string);
  sparkleBurst(party.stage.fxLayer, at);
  playFirework(note);
  if (byHand) party.answer(at);
}

/** Somewhere in the upper part of the board, where a firework belongs. */
function skyPoint(party: Party): Point {
  const { layout, random } = party.stage;
  const { width, height } = layout.canvas;
  return { x: width * (0.15 + random() * 0.7), y: height * (0.12 + random() * 0.4) };
}

/**
 * Fireworks that go up by themselves, climbing first. Only these climb: a tap
 * that waited half a second for a rocket would be a tap that did nothing, and
 * the answer to a finger has to arrive in the tick the finger did.
 */
function rockets(party: Party): void {
  const { layer, layout } = party.stage;
  const live = new Set<{ spark: SVGElement; climb: Animation }>();
  let note = 0;

  function launch(): void {
    const at = skyPoint(party);
    note++;
    if (prefersReducedMotion()) {
      firework(party, at, note, false);
      return;
    }
    const spark = element("circle", {
      r: String(Math.max(4, layout.canvas.width * 0.008)),
      fill: "#fff3b0",
      cx: at.x.toFixed(1),
      cy: layout.canvas.height.toFixed(1),
    });
    spark.style.pointerEvents = "none";
    layer.append(spark);
    const climb = spark.animate(
      [
        { transform: "translateY(0px)", opacity: 0.9 },
        { transform: `translateY(${(at.y - layout.canvas.height).toFixed(1)}px)`, opacity: 1 },
      ],
      { duration: 520, easing: "cubic-bezier(0.2, 0.6, 0.4, 1)", fill: "forwards" },
    );
    const held = { spark, climb };
    live.add(held);
    climb.addEventListener("finish", () => {
      live.delete(held);
      spark.remove();
      firework(party, at, note, false);
    });
  }

  if (party.arriving()) launch();
  party.every(TUNING.fireworkEvery, () => {
    if (!party.arriving()) return;
    launch();
  });
  party.onStop(() => {
    for (const { spark, climb } of live) {
      climb.cancel();
      spark.remove();
    }
    live.clear();
  });
}

function fireworks(party: Party): void {
  const { layer, layout } = party.stage;
  nightSky(party);
  layer.append(
    skyCatcher(party, (at) => {
      firework(party, inLayout(layer, at, layout), party.answered(), true);
    }),
  );
  rockets(party);
}

function nightSky(party: Party): void {
  const { layer, layout, random } = party.stage;
  const { width, height } = layout.canvas;
  const night = group({ class: "night" });
  night.style.pointerEvents = "none";
  night.append(
    element("rect", { x: "0", y: "0", width: `${width}`, height: `${height}`, fill: "#050d2b" }),
  );
  for (let i = 0; i < 26; i++) {
    night.append(
      element("circle", {
        cx: (random() * width).toFixed(1),
        cy: (random() * height * 0.62).toFixed(1),
        r: (2 + random() * 2.4).toFixed(1),
        fill: "#ffffff",
        "fill-opacity": (0.5 + random() * 0.5).toFixed(2),
      }),
    );
  }
  // Dark enough to make a burst glow, translucent enough that the picture the
  // child has just finished is still theirs to see underneath it.
  night.style.opacity = "0";
  layer.append(night);
  night.animate([{ opacity: 0 }, { opacity: 0.76 }], {
    duration: beat(900),
    easing: "ease-out",
    fill: "forwards",
  });
}

// --- the finale -------------------------------------------------------------
// Thirty levels finished. Every celebration at once, and it never winds down:
// the end of the game is a room to stay in rather than a wall to hit. The way
// out is the button the child has pressed at the end of all thirty levels, and
// it starts the whole thing again at the bubbles.

function finale(party: Party): void {
  const { layer, layout } = party.stage;
  // Order is what a finger hits: later siblings sit on top. So the rainbow is
  // laid down first as scenery, the sky that answers a stray tap next, and
  // everything with a shape of its own above both - a balloon under a finger
  // has to beat the sheet of sky behind it.
  rainbowArcs(party, TUNING.arcs);
  // A tap anywhere that misses a balloon, a petal and an animal still gets a
  // firework, so nowhere on the board is dead.
  layer.append(
    skyCatcher(party, (at) => {
      firework(party, inLayout(layer, at, layout), party.answered(), true);
    }),
  );
  rockets(party);
  balloons(party, { at: 4 });
  petals(party, { at: 4 });
  parade(party);
}

// --- the celebrations -------------------------------------------------------

const ACTS: Record<CelebrationId, (party: Party) => void> = {
  balloons: (party) => balloons(party),
  parade: (party) => parade(party),
  petals: (party) => petals(party),
  rainbow: (party) => rainbow(party),
  fireworks: (party) => fireworks(party),
  finale: (party) => finale(party),
};

/**
 * Raise a celebration. The object returned outlives the board it is drawn into,
 * which is the whole point: turning the tablet rebuilds the board and calls
 * `mount` again, and how much has been played with - the arcs of a rainbow
 * especially - is counted here rather than in the DOM that was thrown away.
 *
 * The half-minute is measured from the moment it is raised rather than from the
 * mount, so a rotation does not hand the child another half-minute of arrivals
 * every time the tablet is turned.
 */
export function createCelebration(id: CelebrationId): Celebration {
  const endless = id === FINALE;
  const until = Date.now() + CELEBRATION_SPAN_MS;
  let answered = 0;

  return {
    id,
    endless,
    mount(stage: CelebrationStage): () => void {
      const timers: number[] = [];
      const waits: number[] = [];
      const stops: (() => void)[] = [];

      stage.layer.dataset["celebration"] = id;
      stage.layer.dataset["played"] = String(answered);

      const party: Party = {
        stage,
        answer(at?: Point) {
          answered++;
          stage.layer.dataset["played"] = String(answered);
          if (at) stage.layer.dataset["playedAt"] = `${Math.round(at.x)},${Math.round(at.y)}`;
        },
        answered: () => answered,
        arriving: () => endless || Date.now() < until,
        every(ms: number, run: () => void) {
          timers.push(window.setInterval(run, ms));
        },
        after(ms: number, run: () => void) {
          waits.push(window.setTimeout(run, ms));
        },
        onStop(run: () => void) {
          stops.push(run);
        },
      };

      ACTS[id](party);

      return () => {
        for (const timer of timers) window.clearInterval(timer);
        for (const wait of waits) window.clearTimeout(wait);
        for (const stop of stops) stop();
        stage.layer.replaceChildren();
        delete stage.layer.dataset["celebration"];
        delete stage.layer.dataset["played"];
        delete stage.layer.dataset["playedAt"];
      };
    },
  };
}
