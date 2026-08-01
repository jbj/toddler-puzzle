/**
 * Cause and effect: touch a thing, a thing happens.
 *
 * The first chapter's other levels ask for a drag, and dragging is genuinely
 * beyond many one-year-olds. These are the levels that are not: nothing waits in
 * a tray, nothing has to be aimed anywhere, and the level ends when enough
 * things have been touched - or, whatever has been touched, when the level's ten
 * seconds are up (`ACTIVITY_PATIENCE_MS`). Three of them, chosen by the level
 * table's `options.activity`:
 *
 *  - **bubbles** rise from the bottom of the screen and burst under a finger;
 *  - **peekaboo** hides an animal behind a bush, and a touch uncovers it;
 *  - **alive** is a scene where everything answers - the sun spins, a cloud
 *    drifts on, an animal waggles and says hello.
 *
 * Three rules run through all three, and they are the whole point rather than
 * polish:
 *
 * **There is no way to be wrong.** Nothing here can be dropped in the wrong
 * place, because nothing is picked up. A touch that lands on nothing does
 * nothing at all - never a buzz, never a wobble, never a scold.
 *
 * **There is no way to get stuck.** Whatever is still to be touched is on
 * screen, and stays on screen: a bubble that drifts away untouched is replaced
 * at once, and there are always more things to touch than the level asks for.
 * A child who touches none of it is not stuck either: after ten seconds the way
 * onwards is up anyway, and the level goes on answering a finger regardless.
 *
 * **The answer is immediate.** `pointerdown`, not click, and nothing waits for
 * an animation before it answers. An animation may run *after* the answer - the
 * bush shrinking away, the sun spinning - but the sound, the sparkle and the
 * progress all happen in the tick the finger landed.
 *
 * The burst itself is not here. It is `pop.ts`, because a chapter celebration
 * bursts balloons the same way (issue #9) and the feel of a pop should be one
 * piece of code rather than two that drift apart.
 */
import { playPlink, playPop, playSnap, unlockAudio } from "../audio";
import { boxCenter, type Point } from "../geometry";
import { boxOf, holeOf, type Layout } from "../layout";
import { dealPieces, type ActivityId } from "../levels";
import { prefersReducedMotion } from "../motion";
import type { PieceId, PieceShape } from "../piece";
import { POP_COLOURS, releasePoppable, type Poppable } from "../pop";
import type { ActivityHost, Deal, Puzzle, PuzzleKind } from "../puzzle";
import { renderScenery } from "../scenery";

const SVG_NS = "http://www.w3.org/2000/svg";
const ID = "play" as const;

/**
 * Everything tunable about the three activities, as fractions of the canvas
 * where it is a size, so a portrait board and a landscape one are the same game
 * rather than two. The sizes are the numbers to argue with: every one of them
 * is a target a one-year-old has to hit, and all of them are well over a tenth
 * of the canvas wide for that reason.
 */
const TUNING = {
  /** A bubble's radius, as a fraction of the canvas width. */
  bubbleRadius: 0.085,
  /** How much bigger or smaller than that any one bubble may be. */
  bubbleVariation: 0.18,
  /** How many bubbles are on their way up at once, all of them in reach. */
  bubblesAtOnce: 7,
  /** How fast one rises, in logical units per millisecond. */
  bubbleSpeed: 0.085,
  /** How far a bubble wanders sideways on the way up, as a fraction of width. */
  bubbleSway: 0.05,
  /** How far below the bottom edge a replacement bubble comes in from. */
  bubbleEntry: 0.06,
  /**
   * How many bubbles to burst to finish the level. Half a screenful rather
   * than the whole one: the way onwards is the reward, and a child who has to
   * clear the sky to earn it has been set a chore. See `ACTIVITY_PATIENCE_MS`.
   */
  bubbleGoal: 3,
  /** How many things to touch to finish an `alive` scene, for the same reason. */
  aliveGoal: 2,
  /** The sun's radius, as a fraction of the canvas width. */
  sunRadius: 0.075,
  /** A cloud's width, as a fraction of the canvas width. */
  cloudWidth: 0.2,
  /** How far a touched cloud slides, as a fraction of the canvas width. */
  cloudStep: 0.12,
  /** How far a bush reaches past the box of the animal it hides. */
  bushGrowth: 1.05,
} as const;

/**
 * How long a cause-and-effect level waits before it opens the way onwards
 * whatever has been touched.
 *
 * The goals above are what the level *asks* for; this is what it settles for.
 * A one-year-old does not read a level as a task with a completion condition:
 * they poke the thing that answers, and then they poke it again, and the idea
 * that some number of pokes buys the next screen is not one they have. A child
 * who is doing exactly what the level is for - patting the same cow eleven
 * times - would otherwise never see the button, and neither would a child who
 * put the tablet down for a moment on the wrong side of the goal.
 *
 * So the clock is a second way out and never a way on: it raises the same
 * button the goal raises, and nothing is taken away when it does. Whatever is
 * on screen goes on answering a finger, the level is still there to play, and
 * the child still presses the button themselves - the same reason a celebration
 * has a span but never changes the level (`celebration.ts`).
 *
 * Ten seconds is long enough that a child getting on with it finishes by
 * touching, which is what the level is teaching, and short enough that a child
 * who is not getting anywhere is never stuck watching. See
 * [decision 20260801T163000](../../docs/decisions/20260801T163000-a-touch-level-lets-a-child-out.md).
 */
export const ACTIVITY_PATIENCE_MS = 10_000;

/** How long a response takes; under `prefers-reduced-motion`, no time at all. */
const beat = (ms: number): number => (prefersReducedMotion() ? 1 : ms);

/**
 * A dealt activity. The cast is dealt like any other level's - peekaboo hides
 * it and `alive` stands it in the scene - and `bubbles` is the one that does not
 * use it: the layout is composed around a cast whatever the kind does with it,
 * and the level table's `pieces` is what the ramp reads.
 */
interface ActivityPuzzle extends Puzzle {
  readonly activity: ActivityId;
  /** How many distinct things end the level. */
  readonly goal: number;
  /** What has been touched so far. Nothing here is ever untouched again. */
  readonly touched: Set<string>;
  /**
   * When the level opens the way onwards regardless: a moment, not a countdown.
   * It is stamped when the level is *dealt* rather than when it is drawn, so
   * turning the tablet re-mounts the activity without handing out another ten
   * seconds - the same reason a celebration's span is a deadline.
   */
  readonly finishesBy: number;
  /**
   * The level's own random source, kept so that things minted later - a bubble
   * that arrives a minute in - come out of the same stream as the deal and
   * `?seed=` still means something.
   */
  readonly random: () => number;
}

function asActivity(puzzle: Puzzle): ActivityPuzzle {
  const activity = puzzle as ActivityPuzzle;
  if (!activity.touched) {
    throw new Error(`The puzzle for level ${puzzle.level.level} was not dealt as an activity.`);
  }
  return activity;
}

/** Where the `alive` scene hangs its clouds, as fractions of the canvas width. */
const CLOUD_LANES = [0.22, 0.56] as const;

/** What an `alive` scene adds to its cast: a sun, and the clouds. */
const SKY_THINGS = 1 + CLOUD_LANES.length;

/**
 * How many things this activity puts on screen for a cast of this size. The
 * goal is measured against it, so that no level can ever ask for more touches
 * than it gave the child things to touch.
 */
export function thingsFor(activity: ActivityId, cast: number): number {
  if (activity === "bubbles") return TUNING.bubblesAtOnce;
  if (activity === "peekaboo") return cast;
  return cast + SKY_THINGS;
}

/**
 * How many things this level wants touched. Never more than there are, and for
 * everything but peekaboo fewer: uncovering every animal *is* peekaboo, while a
 * child who never touches one particular cloud should still finish the scene.
 */
export function goalFor(activity: ActivityId, cast: number): number {
  const things = thingsFor(activity, cast);
  if (activity === "peekaboo") return things;
  const most = activity === "bubbles" ? TUNING.bubbleGoal : TUNING.aliveGoal;
  return Math.max(1, Math.min(most, things - 1));
}

const element = (name: string, attributes: Record<string, string> = {}): SVGGElement => {
  const node = document.createElementNS(SVG_NS, name) as SVGGElement;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};

/** A touchable thing: a group that answers `pointerdown` the moment it lands. */
function touchable(what: string, onTouch: () => void): SVGGElement {
  const thing = element("g", { class: "thing" });
  thing.dataset["touch"] = what;
  thing.style.cursor = "pointer";
  thing.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    event.preventDefault();
    unlockAudio();
    onTouch();
  });
  return thing;
}

/**
 * An animal standing where the layout put its hole, drawn from the very artwork
 * a piece of it would be drawn from. The outer group sits at the animal's feet
 * so that anything animated inside it - a waggle, a hop - turns about the point
 * it is standing on rather than about the corner of its box.
 */
function standing(shape: PieceShape, layout: Layout): { root: SVGGElement; body: SVGGElement } {
  const { scale } = boxOf(layout, shape.id);
  const origin = holeOf(layout, shape.id);
  const root = element("g", {
    transform: `translate(${origin.x + shape.anchor.x * scale} ${origin.y + shape.anchor.y * scale})`,
  });
  const body = element("g");
  body.style.transformOrigin = "0 0";
  const art = element("g", {
    transform: `translate(${-shape.anchor.x * scale} ${-shape.anchor.y * scale}) scale(${scale})`,
  });
  art.innerHTML = shape.artwork;
  body.append(art);
  root.append(body);
  return { root, body };
}

/** The middle of the box an animal's hole was cut in: where a sparkle belongs. */
const middleOf = (shape: PieceShape, layout: Layout): Point =>
  boxCenter(holeOf(layout, shape.id), boxOf(layout, shape.id).size);

/** The band of sky a level's own sun and clouds can be hung in. */
function sky(layout: Layout): { top: number; bottom: number } {
  return { top: 0, bottom: layout.horizon };
}

// --- bubbles ---------------------------------------------------------------

function playBubbles(
  puzzle: ActivityPuzzle,
  layout: Layout,
  host: ActivityHost,
  record: (thing: string, at: Point) => void,
): () => void {
  const { width, height } = layout.canvas;
  const random = puzzle.random;
  const still = prefersReducedMotion();
  const afloat = new Set<Poppable>();
  let minted = 0;

  function release(): void {
    const radius =
      width * TUNING.bubbleRadius * (1 + (random() - 0.5) * 2 * TUNING.bubbleVariation);
    const margin = radius + width * 0.02;
    const x = margin + random() * Math.max(1, width - 2 * margin);
    // Nothing waits in the tray on an activity level and the backdrop paints
    // that band as sky, so a bubble has the whole canvas to rise through.
    const ceiling = radius;
    const colour = POP_COLOURS[minted % POP_COLOURS.length] as string;
    const id = `bubble-${minted}`;

    // The opening screenful is spread over the sky rather than queued up below
    // it, so every bubble the level starts with is one a finger can reach. Only
    // the replacements come in from below the bottom edge, and they arrive one
    // at a time as the first ones go, which is stagger enough.
    const opening = minted < TUNING.bubblesAtOnce;
    const lane = opening ? (minted + 0.5) / TUNING.bubblesAtOnce : 0;
    minted++;
    // `still` is `prefers-reduced-motion`: the bubbles are scattered over the
    // sky and simply wait, because a rise collapsed to a millisecond is a level
    // with nothing left in it to touch. See the decision cited in `pop.ts`.
    const startY = still
      ? ceiling + random() * Math.max(1, height - 2 * ceiling)
      : opening
        ? ceiling + lane * Math.max(1, height - 2 * ceiling)
        : height + radius * (1 + random() * TUNING.bubbleEntry);

    const bubble: Poppable = releasePoppable(host.layer, {
      at: { x, y: startY },
      radius,
      colour,
      shape: "bubble",
      touch: "bubble",
      ...(still
        ? {}
        : {
            drift: {
              to: { x, y: ceiling - radius * 2 },
              ms: (startY - (ceiling - radius * 2)) / TUNING.bubbleSpeed,
              sway: (random() - 0.5) * 2 * width * TUNING.bubbleSway,
            },
          }),
      onPop: (at) => {
        afloat.delete(bubble);
        // A small bubble pops higher than a big one, so a screenful of them
        // does not burst on one note.
        playPop((width * TUNING.bubbleRadius) / radius);
        record(id, at);
        topUp();
      },
      onEscape: () => {
        afloat.delete(bubble);
        topUp();
      },
    });
    afloat.add(bubble);
  }

  /** However many have gone, that many arrive: there is always one to touch. */
  function topUp(): void {
    while (afloat.size < TUNING.bubblesAtOnce) release();
  }

  topUp();
  // A belt-and-braces refill. `topUp` already runs on every pop and every
  // escape; this is what covers a tab that was in the background while the
  // animations were not running.
  const timer = window.setInterval(topUp, 1500);

  return () => {
    window.clearInterval(timer);
    for (const bubble of afloat) bubble.remove();
    afloat.clear();
  };
}

// --- peekaboo --------------------------------------------------------------

/** A leafy blob big enough to hide an animal behind. */
function bush(size: { width: number; height: number }): SVGGElement {
  const w = size.width * TUNING.bushGrowth;
  const h = size.height * TUNING.bushGrowth;
  const leaf = element("g");
  leaf.innerHTML = `
    <ellipse cx="0" cy="${(h * 0.2).toFixed(1)}" rx="${(w * 0.5).toFixed(1)}" ry="${(h * 0.32).toFixed(1)}" fill="#3f8f45" />
    <circle cx="${(-w * 0.24).toFixed(1)}" cy="${(h * 0.02).toFixed(1)}" r="${(w * 0.28).toFixed(1)}" fill="#57a038" />
    <circle cx="${(w * 0.24).toFixed(1)}" cy="${(h * 0.04).toFixed(1)}" r="${(w * 0.27).toFixed(1)}" fill="#4e9a3a" />
    <circle cx="${(-w * 0.04).toFixed(1)}" cy="${(-h * 0.18).toFixed(1)}" r="${(w * 0.3).toFixed(1)}" fill="#68b84a" />
    <circle cx="${(-w * 0.18).toFixed(1)}" cy="${(-h * 0.02).toFixed(1)}" r="${(w * 0.06).toFixed(1)}" fill="#ff8fa3" />
    <circle cx="${(w * 0.14).toFixed(1)}" cy="${(-h * 0.16).toFixed(1)}" r="${(w * 0.055).toFixed(1)}" fill="#fff3b0" />
    <circle cx="${(w * 0.06).toFixed(1)}" cy="${(h * 0.16).toFixed(1)}" r="${(w * 0.05).toFixed(1)}" fill="#c9a7f5" />
  `;
  return leaf;
}

function playPeekaboo(
  puzzle: ActivityPuzzle,
  layout: Layout,
  host: ActivityHost,
  record: (thing: string, at: Point) => void,
): () => void {
  puzzle.pieces.forEach((shape, index) => {
    const { size } = boxOf(layout, shape.id);
    const middle = middleOf(shape, layout);
    const { root: animal, body } = standing(shape, layout);
    const uncovered = puzzle.touched.has(shape.id);

    const leaves = element("g", { transform: `translate(${middle.x} ${middle.y})` });
    leaves.append(bush(size));

    const thing = touchable("bush", () => reveal());
    thing.dataset["piece"] = shape.id;
    thing.setAttribute("aria-label", shape.label);
    thing.append(animal, leaves);

    function reveal(): void {
      if (thing.dataset["open"] === "true") {
        // Already out. Touching it again is still worth an answer - the game
        // never goes quiet on a child who is enjoying itself - but the level
        // has already counted it.
        playPlink(index + 2);
        hop();
        return;
      }
      thing.dataset["open"] = "true";
      body.style.opacity = "1";
      playSnap("play");
      playPlink(index);
      leaves
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: beat(260),
          fill: "forwards",
        })
        .addEventListener("finish", () => leaves.remove());
      body.animate(
        [
          { transform: "scale(0.55)", opacity: 0 },
          { transform: "scale(1.08)", opacity: 1, offset: 0.7 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: beat(320), easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "forwards" },
      );
      record(shape.id, middle);
    }

    function hop(): void {
      body.animate(
        [
          { transform: "translateY(0px)" },
          { transform: `translateY(${(-size.height * 0.12).toFixed(1)}px)` },
          { transform: "translateY(0px)" },
        ],
        { duration: beat(340), easing: "ease-out" },
      );
    }

    if (uncovered) {
      // Turning the tablet rebuilds the board; what was uncovered stays
      // uncovered, because the puzzle it is drawn from is the same one.
      thing.dataset["open"] = "true";
      leaves.remove();
    } else {
      body.style.opacity = "0";
    }

    host.layer.append(thing);
  });

  return () => {};
}

// --- a scene that answers ---------------------------------------------------

function playAlive(
  puzzle: ActivityPuzzle,
  layout: Layout,
  host: ActivityHost,
  record: (thing: string, at: Point) => void,
): () => void {
  const { width } = layout.canvas;
  const band = sky(layout);

  // The animals, standing where the layout stood them.
  puzzle.pieces.forEach((shape, index) => {
    const { root, body } = standing(shape, layout);
    const middle = middleOf(shape, layout);
    const thing = touchable("animal", () => {
      playPlink(index);
      body.animate(
        [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-7deg)" },
          { transform: "rotate(6deg)" },
          { transform: "rotate(0deg)" },
        ],
        { duration: beat(460), easing: "ease-in-out" },
      );
      record(shape.id, middle);
    });
    thing.dataset["piece"] = shape.id;
    thing.setAttribute("aria-label", shape.label);
    thing.append(root);
    host.layer.append(thing);
  });

  // The sun, big enough to hit and hung clear of the top of the scene.
  const sunRadius = width * TUNING.sunRadius;
  const sunAt = {
    x: width - sunRadius - width * 0.05,
    y: Math.max(band.top + sunRadius + 8, band.bottom * 0.34),
  };
  const sunSpin = element("g");
  sunSpin.style.transformOrigin = "0 0";
  sunSpin.innerHTML = `
    <g stroke="#f6b820" stroke-width="${(sunRadius * 0.16).toFixed(1)}" stroke-linecap="round">
      ${Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const from = sunRadius * 1.14;
        const to = sunRadius * 1.42;
        return `<path d="M${(Math.cos(angle) * from).toFixed(1)} ${(Math.sin(angle) * from).toFixed(1)}
          L${(Math.cos(angle) * to).toFixed(1)} ${(Math.sin(angle) * to).toFixed(1)}" />`;
      }).join("")}
    </g>
    <circle r="${sunRadius}" fill="#ffd23f" stroke="#f6b820" stroke-width="${(sunRadius * 0.1).toFixed(1)}" />
    <circle cx="${(-sunRadius * 0.32).toFixed(1)}" cy="${(-sunRadius * 0.16).toFixed(1)}" r="${(sunRadius * 0.09).toFixed(1)}" fill="#7a5200" />
    <circle cx="${(sunRadius * 0.32).toFixed(1)}" cy="${(-sunRadius * 0.16).toFixed(1)}" r="${(sunRadius * 0.09).toFixed(1)}" fill="#7a5200" />
    <path d="M${(-sunRadius * 0.34).toFixed(1)} ${(sunRadius * 0.22).toFixed(1)}
             q${(sunRadius * 0.34).toFixed(1)} ${(sunRadius * 0.42).toFixed(1)} ${(sunRadius * 0.68).toFixed(1)} 0"
          fill="none" stroke="#7a5200" stroke-width="${(sunRadius * 0.09).toFixed(1)}" stroke-linecap="round" />
  `;
  let turns = 0;
  const sun = touchable("sun", () => {
    playPlink(3);
    turns += 1;
    sunSpin.animate(
      [
        { transform: `rotate(${(turns - 1) * 360}deg)` },
        { transform: `rotate(${turns * 360}deg)` },
      ],
      {
        duration: beat(900),
        easing: "cubic-bezier(0.4, 0, 0.3, 1)",
        fill: "forwards",
      },
    );
    record("sun", sunAt);
  });
  sun.setAttribute("transform", `translate(${sunAt.x} ${sunAt.y})`);
  sun.setAttribute("aria-label", "The sun");
  sun.append(sunSpin);
  host.layer.append(sun);

  // The clouds, which slide along when they are touched.
  const cloudWidth = width * TUNING.cloudWidth;
  CLOUD_LANES.forEach((share, index) => {
    const at = {
      x: width * share,
      y: Math.max(band.top + cloudWidth * 0.28, band.bottom * (index === 0 ? 0.24 : 0.5)),
    };
    const puff = element("g");
    puff.style.transformOrigin = "0 0";
    const r = cloudWidth * 0.3;
    puff.innerHTML = `
      <g fill="#ffffff">
        <circle cx="0" cy="0" r="${r.toFixed(1)}" />
        <circle cx="${(r * 1.1).toFixed(1)}" cy="${(r * 0.28).toFixed(1)}" r="${(r * 0.78).toFixed(1)}" />
        <circle cx="${(-r * 1.05).toFixed(1)}" cy="${(r * 0.32).toFixed(1)}" r="${(r * 0.72).toFixed(1)}" />
        <rect x="${(-r * 1.05).toFixed(1)}" y="0" width="${(r * 2.15).toFixed(1)}" height="${(r * 0.95).toFixed(1)}" rx="${(r * 0.47).toFixed(1)}" />
      </g>
    `;
    let slid = 0;
    const cloud = touchable("cloud", () => {
      playPlink(index + 1);
      const before = slid;
      // It wanders on and comes back rather than sailing off the edge: a thing
      // a child touched must still be there to touch again.
      slid = before + width * TUNING.cloudStep * (index === 0 ? 1 : -1);
      if (at.x + slid > width - cloudWidth * 0.5 || at.x + slid < cloudWidth * 0.5) {
        slid = before - width * TUNING.cloudStep * (index === 0 ? 1 : -1);
      }
      puff.animate(
        [
          { transform: `translateX(${before.toFixed(1)}px)` },
          { transform: `translateX(${slid.toFixed(1)}px)` },
        ],
        { duration: beat(700), easing: "ease-in-out", fill: "forwards" },
      );
      record(`cloud-${index}`, { x: at.x + slid, y: at.y });
    });
    cloud.setAttribute("transform", `translate(${at.x} ${at.y})`);
    cloud.setAttribute("aria-label", "A cloud");
    cloud.append(puff);
    host.layer.append(cloud);
  });

  return () => {};
}

// --- the kind ---------------------------------------------------------------

export const play: PuzzleKind = {
  id: ID,

  deal({ level, shapes }: Deal, random: () => number): Puzzle {
    const pieces = dealPieces(level, shapes, random);
    const activity = level.options?.activity ?? "bubbles";
    const puzzle: ActivityPuzzle = {
      kind: ID,
      level,
      pieces,
      targets: pieces,
      placed: new Set<PieceId>(),
      activity,
      goal: goalFor(activity, pieces.length),
      touched: new Set<string>(),
      finishesBy: Date.now() + ACTIVITY_PATIENCE_MS,
      random,
    };
    return puzzle;
  },

  /**
   * The landscape, with no holes cut in it and no tray band: nothing waits in
   * the tray on a level nothing is dragged on. An `alive` scene also draws its
   * own sun and clouds, so the scenery leaves those to it.
   */
  backdrop(puzzle: Puzzle, layout: Layout): string {
    const alive = asActivity(puzzle).activity === "alive";
    return renderScenery(layout, { tray: false, sky: !alive });
  },

  /**
   * Nothing is ever dragged here, so nothing is ever settled. The hole the
   * layout cut is still where the answer is, which keeps this honest rather
   * than throwing from a method the host may one day call.
   */
  target(_puzzle: Puzzle, layout: Layout, piece: PieceId): Point {
    return holeOf(layout, piece);
  },

  /**
   * No drop is accepted, because there is nothing to pick up: the host builds
   * no pieces and starts no drag engine for a kind that implements `play`.
   */
  accepts(): boolean {
    return false;
  },

  /**
   * Enough things touched, or long enough waited. The clock is the second of
   * those and never undoes the first: a level that is over stays over, because
   * both the touches and the deadline live on the puzzle, which outlives the
   * board. See `ACTIVITY_PATIENCE_MS`.
   */
  isComplete(puzzle: Puzzle): boolean {
    const activity = asActivity(puzzle);
    return activity.touched.size >= activity.goal || Date.now() >= activity.finishesBy;
  },

  play(puzzle: Puzzle, layout: Layout, host: ActivityHost): () => void {
    const activity = asActivity(puzzle);
    host.layer.dataset["activity"] = activity.activity;
    host.layer.dataset["goal"] = String(activity.goal);

    const record = (thing: string, at: Point): void => {
      activity.touched.add(thing);
      host.layer.dataset["touched"] = String(activity.touched.size);
      host.touched(at);
    };
    host.layer.dataset["touched"] = String(activity.touched.size);

    // Nothing was touched, so nothing sparkles and nothing is counted: this
    // only asks the host to look again, and `isComplete` answers from the
    // clock. A board mounted after the deadline has already passed asks at
    // once, which is what a rotation ten seconds in wants.
    const clock = window.setTimeout(
      () => host.touched(),
      Math.max(0, activity.finishesBy - Date.now()),
    );

    const stop =
      activity.activity === "bubbles"
        ? playBubbles(activity, layout, host, record)
        : activity.activity === "peekaboo"
          ? playPeekaboo(activity, layout, host, record)
          : playAlive(activity, layout, host, record);

    return () => {
      window.clearTimeout(clock);
      stop();
    };
  },
};
