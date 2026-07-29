/**
 * The one part of this game that is not for the child.
 *
 * Thirty levels and a difficulty option need somebody to be able to steer, and
 * that somebody is a grown-up. So there is a panel: a map of the thirty levels
 * to jump about in, the switches, and the only button in the game that clears
 * progress. Everything about it is built to be obvious to an adult and useless
 * to a two-year-old.
 *
 * **It is not hidden.** A button in the corner says "Grown-ups", because a
 * parent who has never seen the game before has to be able to find it, and a
 * secret gesture is only discoverable by being told. What keeps a toddler out
 * is not secrecy but patience: pressing the button does not open anything, it
 * says "Hold to open" and starts filling a ring, and only a press held for
 * {@link HOLD_MS} gets in. However many times the button is tapped, and however
 * fast, nothing opens - see `createHoldGate`, which is the whole of that rule
 * and is a plain state machine so it can be tested without a browser.
 *
 * **It is deliberately not toddler-styled.** Small text, ordinary controls,
 * grown-up spacing. The rest of the game is enormous and brightly coloured; a
 * child who gets a look at this should find nothing here that invites a poke.
 *
 * **It never touches the board.** The panel is HTML over the top of the SVG
 * stage, mounted outside `#app` - `buildBoard` replaces everything in there -
 * so closing it puts the child back exactly where they were, mid-puzzle,
 * without re-dealing anything. The only thing that does change the board is a
 * level chosen from the map, which is the point of the map.
 */
import { setSoundEnabled, unlockAudio } from "./audio";
import type { GameHandle } from "./game";
import { CHAPTERS, LEVEL_COUNT, levelSpec, type ChapterId } from "./levels";
import type { HintTiming, Progress, ProgressStore, Settings } from "./progress";

/**
 * How long the button has to be held before the panel opens. Two seconds is
 * long enough that no tap, and no drumming of fingers, ever adds up to it, and
 * short enough that an adult holding it while reading "Hold to open" is already
 * most of the way there.
 */
export const HOLD_MS = 2000;

/**
 * How long "Hold to open" stays up after the button is let go. A grown-up's
 * first press is nearly always a tap, and that tap is the moment they need to
 * be told what to do instead; the answer has to still be on screen when they
 * look.
 */
export const PROMPT_MS = 6000;

/** What the button looks like at a given moment. */
export interface HoldState {
  /** Whether "Hold to open" is showing. */
  readonly prompt: boolean;
  /** How full the ring is, 0 to 1. */
  readonly fill: number;
  /** Whether the hold has lasted long enough to open the panel. */
  readonly open: boolean;
}

/**
 * The rule that keeps a toddler out, with no timers and no DOM in it: press,
 * let go, and ask what it looks like now. Time is passed in rather than read,
 * so a test can hold the button for two seconds without waiting two seconds.
 */
export interface HoldGate {
  /** The button went down. Starts the hold, from zero, every time. */
  press(now: number): void;
  /** The button came up, or the finger slid off it. The hold is abandoned. */
  cancel(now: number): void;
  state(now: number): HoldState;
  /** Called once the panel is open, so the next press starts from empty. */
  reset(): void;
}

export interface HoldGateOptions {
  readonly holdMs?: number;
  readonly promptMs?: number;
}

export function createHoldGate(options: HoldGateOptions = {}): HoldGate {
  const holdMs = options.holdMs ?? HOLD_MS;
  const promptMs = options.promptMs ?? PROMPT_MS;

  let pressedAt: number | null = null;
  let promptUntil = 0;

  return {
    press(now) {
      pressedAt = now;
    },
    cancel(now) {
      // Only a press that actually happened leaves the prompt behind, so a
      // stray pointer-up cannot put the hint up on its own.
      if (pressedAt !== null) promptUntil = now + promptMs;
      pressedAt = null;
    },
    state(now) {
      const fill = pressedAt === null ? 0 : Math.min(1, (now - pressedAt) / holdMs);
      return {
        prompt: pressedAt !== null || now < promptUntil,
        fill,
        open: fill >= 1,
      };
    },
    reset() {
      pressedAt = null;
      promptUntil = 0;
    },
  };
}

/** One square of the level map. */
export interface LevelMapEntry {
  readonly level: number;
  readonly chapter: ChapterId;
  /** Somewhere the child has played. Choosing a level never makes this true. */
  readonly reached: boolean;
  /** The level on the board right now. */
  readonly current: boolean;
}

/**
 * The thirty squares, in order.
 *
 * `reached` comes from `furthest`, which only playing moves, so the map keeps
 * saying where the child got to however much a grown-up reads it. `current` is
 * asked of the game rather than of the record, because a session opened by
 * `?level=` is playing a level the record has deliberately not been told about.
 */
export function levelMap(progress: Progress, current: number): readonly LevelMapEntry[] {
  return Array.from({ length: LEVEL_COUNT }, (_, index) => {
    const level = index + 1;
    return {
      level,
      chapter: levelSpec(level).chapter,
      reached: level <= progress.furthest,
      current: level === current,
    };
  });
}

/** The chapters as a grown-up reads them, in play order. */
const CHAPTER_NAMES: Record<ChapterId, string> = {
  "first-touches": "First touches",
  animals: "Animals",
  "sliced-animals": "Sliced animals",
  shapes: "Shapes",
  pictures: "Pictures",
  mastery: "Mastery",
};

/**
 * Everything a setting does beyond being written down.
 *
 * Called twice: once at boot in `main.ts`, and again whenever a switch moves.
 * One function rather than a handler per switch, so a setting cannot be applied
 * on the way in and forgotten on the way out.
 *
 * Only `sound` has anywhere to go yet; `hints` is read by the idle hint (#21),
 * which is stored and read back correctly today and needs a line here when its
 * consumer arrives.
 */
export function applySettings(settings: Settings): void {
  setSoundEnabled(settings.sound);
}

const HINT_CHOICES: readonly { readonly value: HintTiming; readonly label: string }[] = [
  { value: "off", label: "Off" },
  { value: "sooner", label: "Sooner" },
  { value: "later", label: "Later" },
];

export interface GrownUpPanelOptions {
  readonly progress: ProgressStore;
  readonly game: GameHandle;
  /** Where the button and the panel are mounted. Defaults to `document.body`. */
  readonly host?: HTMLElement;
  /** Injectable so the hold can be tested; `performance.now` in the game. */
  readonly now?: () => number;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** A labelled row with a control on the right, which is every option here. */
function optionRow(label: string, note: string, control: HTMLElement): HTMLElement {
  const row = el("div", "grownups-option");
  const text = el("div", "grownups-option-text");
  text.append(el("span", "grownups-option-label", label));
  if (note) text.append(el("span", "grownups-option-note", note));
  row.append(text, control);
  return row;
}

/**
 * Build the button and the panel behind it, and wire them to the record and to
 * the game. Called once, at boot.
 */
export function createGrownUpPanel(options: GrownUpPanelOptions): void {
  const { progress, game } = options;
  const host = options.host ?? document.body;
  const now = options.now ?? (() => performance.now());
  const gate = createHoldGate();

  const root = el("div", "grownups");

  // --- the button ---------------------------------------------------------

  const key = el("button", "grownups-key");
  key.type = "button";
  const face = el("span", "grownups-key-face");
  const keyLabel = el("span", "grownups-key-label", "Grown-ups");
  const keyHint = el("span", "grownups-key-hint", "Hold to open");
  face.append(keyLabel, keyHint);
  key.append(face);

  // --- the panel ----------------------------------------------------------

  const panel = el("div", "grownups-panel");
  panel.hidden = true;
  const sheet = el("div", "grownups-sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Grown-ups");

  const header = el("header", "grownups-header");
  header.append(el("h2", "grownups-title", "Grown-ups"));
  const done = el("button", "grownups-done", "Done");
  done.type = "button";
  header.append(done);

  const levelSection = el("section", "grownups-section");
  levelSection.append(el("h3", "grownups-heading", "Level"));
  const levelNote = el("p", "grownups-note", "");
  levelSection.append(levelNote);
  const levelGrid = el("div", "grownups-levels");
  levelSection.append(levelGrid);

  const levelButtons = new Map<number, HTMLButtonElement>();
  for (const chapter of CHAPTERS) {
    const chapterRow = el("div", "grownups-chapter-row");
    chapterRow.append(el("div", "grownups-chapter", CHAPTER_NAMES[chapter]));
    const row = el("div", "grownups-chapter-levels");
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      if (levelSpec(level).chapter !== chapter) continue;
      const button = el("button", "grownups-level", String(level));
      button.type = "button";
      button.dataset["level"] = String(level);
      button.setAttribute("aria-label", `Play level ${level}`);
      button.addEventListener("click", () => {
        game.chooseLevel(level);
        close();
      });
      levelButtons.set(level, button);
      row.append(button);
    }
    chapterRow.append(row);
    levelGrid.append(chapterRow);
  }

  const optionSection = el("section", "grownups-section");
  optionSection.append(el("h3", "grownups-heading", "Options"));

  /**
   * A two-state switch for one boolean setting. There is one of them today -
   * rotation mode was dropped rather than built, see
   * [decision 20260730T203000](../docs/decisions/20260730T203000-no-rotation-mode.md)
   * - and it stays a factory because the next boolean setting should not have
   * to invent this again.
   */
  function makeSwitch(setting: "sound"): HTMLButtonElement {
    const control = el("button", "grownups-switch");
    control.type = "button";
    control.setAttribute("role", "switch");
    control.dataset["setting"] = setting;
    control.append(el("span", "grownups-switch-knob"));
    control.addEventListener("click", () => {
      applySettings(progress.updateSetting(setting, !progress.settings()[setting]));
      refresh();
    });
    return control;
  }

  const soundSwitch = makeSwitch("sound");

  const hintChoices = el("div", "grownups-choices");
  hintChoices.setAttribute("role", "radiogroup");
  hintChoices.setAttribute("aria-label", "Idle hints");
  const hintButtons = new Map<HintTiming, HTMLButtonElement>();
  for (const choice of HINT_CHOICES) {
    const button = el("button", "grownups-choice", choice.label);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.dataset["setting"] = "hints";
    button.dataset["value"] = choice.value;
    button.addEventListener("click", () => {
      applySettings(progress.updateSetting("hints", choice.value));
      refresh();
    });
    hintButtons.set(choice.value, button);
    hintChoices.append(button);
  }

  optionSection.append(
    optionRow("Sound", "Tones when a piece is picked up, lands, or finishes.", soundSwitch),
    optionRow(
      "Idle hints",
      "A nudge when nothing has been touched for a while. Not in play yet.",
      hintChoices,
    ),
  );

  const progressSection = el("section", "grownups-section");
  progressSection.append(el("h3", "grownups-heading", "Progress"));
  const reset = el("button", "grownups-reset", "Reset progress");
  reset.type = "button";
  const progressNote = el("p", "grownups-note", "");
  progressSection.append(
    optionRow("Start again", "Back to level 1, keeping these options.", reset),
    progressNote,
  );

  sheet.append(header, levelSection, optionSection, progressSection);
  panel.append(sheet);
  root.append(key, panel);
  host.append(root);

  // --- state --------------------------------------------------------------

  /** Whether "Reset progress" has been pressed once and is asking. */
  let confirmingReset = false;
  let confirmTimer = 0;

  function setResetLabel(): void {
    reset.textContent = confirmingReset ? "Really reset?" : "Reset progress";
    reset.classList.toggle("is-confirming", confirmingReset);
  }

  function stopConfirming(): void {
    window.clearTimeout(confirmTimer);
    confirmingReset = false;
    setResetLabel();
  }

  reset.addEventListener("click", () => {
    // Two presses, because a grown-up who meant to press "Done" and hit this
    // instead would lose weeks of a child's playing to one stray finger.
    if (!confirmingReset) {
      confirmingReset = true;
      setResetLabel();
      confirmTimer = window.setTimeout(stopConfirming, 5000);
      return;
    }
    stopConfirming();
    progress.clearProgress();
    game.chooseLevel(1);
    refresh();
  });

  /** Redraw everything the panel shows from the record, as it stands now. */
  function refresh(): void {
    const record = progress.read();
    const entries = levelMap(record, game.currentLevel());
    for (const entry of entries) {
      const button = levelButtons.get(entry.level);
      if (!button) continue;
      button.classList.toggle("is-reached", entry.reached);
      button.classList.toggle("is-current", entry.current);
      button.setAttribute("aria-current", entry.current ? "true" : "false");
    }
    levelNote.textContent = `Playing level ${game.currentLevel()} of ${LEVEL_COUNT}. Filled squares are levels the child has played.`;

    const settings = record.settings;
    for (const [key, control] of [["sound", soundSwitch]] as const) {
      const on = settings[key];
      control.setAttribute("aria-checked", String(on));
      control.classList.toggle("is-on", on);
    }
    for (const [value, button] of hintButtons) {
      const on = settings.hints === value;
      button.setAttribute("aria-checked", String(on));
      button.classList.toggle("is-on", on);
    }

    progressNote.textContent = progress.persists
      ? "The level is remembered on this device."
      : "This browser will not remember anything, so the game starts at level 1 each visit.";
  }

  // --- opening and closing -------------------------------------------------

  function open(): void {
    gate.reset();
    forgetPrompt();
    paint();
    stopConfirming();
    refresh();
    panel.hidden = false;
    root.classList.add("is-open");
    // The panel is a gesture like any other, and the one that most wants audio
    // already unlocked: the next thing a grown-up does here may be to turn the
    // sound on.
    unlockAudio();
    done.focus();
  }

  function close(): void {
    panel.hidden = true;
    root.classList.remove("is-open");
    stopConfirming();
  }

  done.addEventListener("click", close);
  panel.addEventListener("click", (event) => {
    // The sheet is a child of the backdrop, so only a press that both started
    // and ended on the backdrop itself counts as "outside".
    if (event.target === panel) close();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close();
  });

  // --- the hold ------------------------------------------------------------

  let frame = 0;
  let openTimer = 0;
  let promptTimer = 0;

  /** Show the gate's current state: the ring, and the "Hold to open" line. */
  function paint(): void {
    const state = gate.state(now());
    key.style.setProperty("--fill", String(state.fill));
    key.classList.toggle("is-prompting", state.prompt);
  }

  /** Drop any pending "the prompt has expired" repaint. */
  function forgetPrompt(): void {
    window.clearTimeout(promptTimer);
    promptTimer = 0;
  }

  function stopWatching(): void {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(openTimer);
    frame = 0;
    openTimer = 0;
  }

  /** Open if the hold has lasted, and stop watching either way. */
  function openIfHeld(): boolean {
    if (!gate.state(now()).open) return false;
    stopWatching();
    open();
    return true;
  }

  function watch(): void {
    stopWatching();
    const step = (): void => {
      if (openIfHeld()) return;
      paint();
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    // The frames are for the ring; the rule is the clock. A tab that is not
    // being painted still has to open on a long press, so the opening is armed
    // on a timer as well and does not depend on a frame arriving.
    openTimer = window.setTimeout(openIfHeld, HOLD_MS + 20);
  }

  key.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    // Capture, so the release that follows a successful hold lands on the
    // button rather than on the panel that has just opened underneath it.
    try {
      key.setPointerCapture(event.pointerId);
    } catch {
      // A browser that will not capture still holds and still opens; it just
      // has to rely on the drift check below to notice a finger leaving.
    }
    gate.press(now());
    paint();
    watch();
  });

  const letGo = (): void => {
    gate.cancel(now());
    stopWatching();
    paint();
    // The prompt outlives the press, so it has to be taken down on a timer
    // rather than by the next pointer event. A toddler will tap this button
    // over and over, so each release replaces the pending timer instead of
    // adding to it: one press, one timer, however fast the tapping.
    forgetPrompt();
    promptTimer = window.setTimeout(() => {
      promptTimer = 0;
      paint();
    }, PROMPT_MS + 50);
  };

  key.addEventListener("pointerup", letGo);
  key.addEventListener("pointercancel", letGo);
  key.addEventListener("pointermove", (event) => {
    // A finger that slides off the button gives up the hold. With the pointer
    // captured, `pointerleave` never fires, so the drift is measured instead.
    const box = key.getBoundingClientRect();
    const outside =
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom;
    if (outside && gate.state(now()).fill > 0) letGo();
  });

  paint();
  refresh();
}
