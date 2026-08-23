/**
 * Before changing this file, read docs/navigation.md.
 *
 * The one part of this game that is not for the child.
 *
 * The long ramp and its options need somebody to steer them, and that somebody
 * is a grown-up. Everything here is obvious to an adult and useless to a
 * two-year-old.
 *
 * **It is not hidden.** A button in the corner says "Grown-ups", because a
 * parent who has never seen the game before has to be able to find it, and a
 * secret gesture is only discoverable by being told. What keeps a toddler out
 * is not secrecy but patience: pressing the button does not open anything, it
 * says "Hold to open" and starts filling a ring, and only a press held for
 * `HOLD_MS` gets in. However many times the button is tapped, and however fast,
 * nothing opens - the rule and the wiring are `hold.ts`, shared with the button
 * in the corner of the board, which is held for the same two seconds.
 *
 * **It is deliberately not toddler-styled.** Small text, ordinary controls,
 * grown-up spacing. The rest of the game is enormous and brightly coloured; a
 * child who gets a look at this should find nothing here that invites a poke.
 *
 * **It never touches the board.** The panel is HTML over the top of the SVG
 * stage, mounted outside `#app` - `buildBoard` replaces everything in there -
 * so closing it puts the child back exactly where they were, mid-puzzle,
 * without re-dealing anything. The only things that do change the board are a
 * level chosen from the map, which is the point of the map, and a kind switched
 * off from under the level being played, which is the point of the switch.
 */
import { setSoundEnabled, unlockAudio } from "./audio";
import type { GameHandle } from "./game";
import { createHoldGate, watchHold, type HoldState } from "./hold";
import {
  CHAPTERS,
  LEVELS,
  LEVEL_COUNT,
  PUZZLE_KINDS,
  isPlayable,
  levelSpec,
  playableFrom,
  type ChapterId,
  type EnabledKinds,
  type PuzzleKindId,
} from "./levels";
import type { Progress, ProgressStore, Settings } from "./progress";

/** One square of the level map. */
export interface LevelMapEntry {
  readonly level: number;
  readonly chapter: ChapterId;
  /** Somewhere the child has played. Choosing a level never makes this true. */
  readonly reached: boolean;
  /** The level on the board right now. */
  readonly current: boolean;
  /**
   * A level the game will step over, because its kind is switched off. Shown
   * rather than removed: the map is how a grown-up sees what their switches did,
   * and thirty squares that quietly became twenty-two would say much less.
   */
  readonly skipped: boolean;
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
      skipped: !progress.settings.kinds[levelSpec(level).kind],
    };
  });
}

/** The chapters as a grown-up reads them, in play order. */
const CHAPTER_NAMES: Record<ChapterId, string> = {
  animals: "Animals",
  "sliced-animals": "Sliced animals",
  shapes: "Shapes",
  pictures: "Pictures",
  mastery: "Mastery",
};

/**
 * The kinds of puzzle as a grown-up reads them.
 *
 * A parent has never heard of a `PuzzleKindId`, so each row says what the child
 * will actually be asked to do. The note names the skill rather than the
 * mechanism, because the question being answered is "can mine do this yet?".
 * The levels each one covers are counted off the table rather than written
 * here, so retuning the ramp cannot leave the panel telling a grown-up
 * something that was true last month.
 */
const KIND_NAMES: Record<PuzzleKindId, { readonly label: string; readonly note: string }> = {
  "shape-match": {
    label: "Whole animals",
    note: "One animal carried to the hole it fits. The first dragging the game asks for.",
  },
  sliced: {
    label: "Sliced animals",
    note: "An animal cut into two to four pieces, put back together.",
  },
  polygon: {
    label: "Shape pictures",
    note: "A house or a boat built out of plain coloured shapes.",
  },
  jigsaw: {
    label: "Jigsaws",
    note: "A drawing cut into a grid of interlocking pieces, from four up to twelve.",
  },
  shatter: {
    label: "Shattered pictures",
    note: "A drawing broken into irregular shards, with no grid to go by.",
  },
};

/** How many of the thirty a kind accounts for, for the row that offers it. */
function levelsOfKind(kind: PuzzleKindId): readonly number[] {
  return LEVELS.filter((level) => level.kind === kind).map((level) => level.level);
}

/**
 * The kinds after this switch is moved, or null when moving it would leave the
 * game with nothing to play.
 *
 * The rule is here rather than in the click handler, with no DOM and no record
 * in it, for the same reason `createHoldGate` is: it is the one thing about
 * these switches that has to be true however they are pressed, and a pure
 * function is a thing a test can press two hundred times.
 *
 * Refusing rather than clamping is deliberate. A grown-up turning the fifth
 * kind off has said something coherent; one turning the sixth off has not, and
 * the honest answer is that the switch does not move - which is what the panel
 * then draws.
 */
export function toggleKind(kinds: EnabledKinds, kind: PuzzleKindId): EnabledKinds | null {
  const next: EnabledKinds = { ...kinds, [kind]: !kinds[kind] };
  return PUZZLE_KINDS.some((id) => next[id]) ? next : null;
}

/** Whether this is the only kind left in play, and so cannot be turned off. */
export function isLastKindOn(kinds: EnabledKinds, kind: PuzzleKindId): boolean {
  return kinds[kind] && toggleKind(kinds, kind) === null;
}

/**
 * Everything a setting does beyond being written down.
 *
 * Called twice: once at boot in `main.ts`, and again whenever a switch moves.
 * One function rather than a handler per switch, so a setting cannot be applied
 * on the way in and forgotten on the way out.
 *
 * Sound reaches the game through the one function that owns the thing it
 * changes, so a switch moved mid-play is answered on the board in front of the
 * grown-up who moved it. `kinds` is not here because it has nothing to switch
 * on: `game.ts` asks the record which kinds are in play at the moment it needs
 * to know, so there is no copy of it to keep in step.
 */
export function applySettings(settings: Settings): void {
  setSoundEnabled(settings.sound);
}

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

  /** Kept as a factory so another boolean setting reuses the same control. */
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

  optionSection.append(
    optionRow("Sound", "Tones when a piece is picked up, lands, or finishes.", soundSwitch),
  );

  const kindSection = el("section", "grownups-section");
  kindSection.append(el("h3", "grownups-heading", "Kinds of puzzle"));
  kindSection.append(
    el(
      "p",
      "grownups-note",
      "Turn off anything the child is not ready for and the game steps over those levels, in the order it always plays them. One kind always stays on, so there is something to play.",
    ),
  );

  const kindSwitches = new Map<PuzzleKindId, HTMLButtonElement>();
  for (const kind of PUZZLE_KINDS) {
    const control = el("button", "grownups-switch");
    control.type = "button";
    control.setAttribute("role", "switch");
    control.dataset["kind"] = kind;
    control.append(el("span", "grownups-switch-knob"));
    control.addEventListener("click", () => switchKind(kind));
    kindSwitches.set(kind, control);
    const { label, note } = KIND_NAMES[kind];
    const covers = levelsOfKind(kind).length;
    kindSection.append(optionRow(label, `${note} ${covers} of the thirty levels.`, control));
  }

  const progressSection = el("section", "grownups-section");
  progressSection.append(el("h3", "grownups-heading", "Progress"));
  const reset = el("button", "grownups-reset", "Reset progress");
  reset.type = "button";
  const progressNote = el("p", "grownups-note", "");
  progressSection.append(
    optionRow("Start again", "Back to level 1, keeping these options.", reset),
    progressNote,
  );

  sheet.append(header, levelSection, optionSection, kindSection, progressSection);
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

  /**
   * Take a kind of puzzle out of the game, or put it back.
   *
   * Two things happen beyond writing it down.
   *
   * **The last one on cannot be turned off.** That is `toggleKind`'s rule, and
   * a refusal is drawn rather than swallowed: `refresh` marks the lone survivor
   * unavailable, so a grown-up finds out by looking rather than by pressing
   * something that silently does nothing.
   *
   * **A child sitting on a level that has just been switched off is moved.** The
   * moment a parent turns a kind off is almost always the moment their child is
   * stuck on one of its levels; leaving them there until they finish it would
   * answer the wrong half of the request. The move goes through `chooseLevel`,
   * so it counts as somewhere the grown-up put them rather than somewhere they
   * reached, and the panel stays open - this is a setting being made, not a
   * level being picked.
   */
  function switchKind(kind: PuzzleKindId): void {
    const kinds = toggleKind(progress.settings().kinds, kind);
    if (!kinds) return;
    applySettings(progress.updateSetting("kinds", kinds));
    const playing = game.currentLevel();
    if (!isPlayable(playing, kinds)) game.chooseLevel(playableFrom(playing, kinds));
    refresh();
  }

  /** Redraw everything the panel shows from the record, as it stands now. */
  function refresh(): void {
    const record = progress.read();
    const entries = levelMap(record, game.currentLevel());
    let skipped = 0;
    for (const entry of entries) {
      if (entry.skipped) skipped++;
      const button = levelButtons.get(entry.level);
      if (!button) continue;
      button.classList.toggle("is-reached", entry.reached);
      button.classList.toggle("is-current", entry.current);
      button.classList.toggle("is-skipped", entry.skipped);
      button.setAttribute("aria-current", entry.current ? "true" : "false");
    }
    levelNote.textContent =
      `Playing level ${game.currentLevel()} of ${LEVEL_COUNT}. Filled squares are levels the child has played` +
      (skipped > 0 ? `; faded ones are the ${skipped} being skipped.` : ".");

    const settings = record.settings;
    for (const [key, control] of [["sound", soundSwitch]] as const) {
      const on = settings[key];
      control.setAttribute("aria-checked", String(on));
      control.classList.toggle("is-on", on);
    }
    for (const [kind, control] of kindSwitches) {
      const on = settings.kinds[kind];
      control.setAttribute("aria-checked", String(on));
      control.classList.toggle("is-on", on);
      // The last kind left in play is held on rather than left to be pressed
      // for nothing.
      control.disabled = isLastKindOn(settings.kinds, kind);
      control.setAttribute("aria-label", KIND_NAMES[kind].label);
    }

    progressNote.textContent = progress.persists
      ? "The level is remembered on this device."
      : "This browser will not remember anything, so the game starts at level 1 each visit.";
  }

  // --- opening and closing -------------------------------------------------

  function open(): void {
    // Empty the ring and drop the prompt: the next press starts from nothing.
    gate.reset();
    paint(gate.state(now()));
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

  // The rule and the wiring are `hold.ts`, shared with the button in the corner
  // of the board, so "held" means the same two seconds on both.
  const paint = (state: HoldState): void => {
    key.style.setProperty("--fill", String(state.fill));
    key.classList.toggle("is-prompting", state.prompt);
  };

  watchHold(key, { gate, now, held: open, paint });

  refresh();
}
