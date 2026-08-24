# Feel

This guide owns sound, landing feedback, rest, drag behavior, and the
browser protections that keep a young child in the game. Progression belongs in
[`navigation.md`](navigation.md); kind-specific rules belong in
[`puzzle-kinds.md`](puzzle-kinds.md).

## Sound

Every sound is synthesized from declarative data in `src/audio.ts`.

- **One musical vocabulary.** Pitches come from the shared ladder; do not
  hard-code frequencies in an effect.
- **Sounds are data.** Voices and phrases are plain descriptions assembled by
  shared helpers. One scheduler touches Web Audio.
- **One gate.** Every audible path passes through the function that applies the
  sound setting.
- **No missing voice.** Canonical kind and celebration ids map exhaustively to
  their sounds.
- **Nothing harsh.** Shared voice construction owns waveform, attack, release,
  gain, and pitch limits. A refused drop sounds warm and returns gently.
- **Bursts degrade safely.** When too many voices would overlap, drop excess
  voices rather than queueing or clipping them.
- **Audio needs a gesture before it starts.**

The audio tests and render command own current vocabulary and signal bounds.
Automated checks prove structure and softness; a person still listens to judge
whether the sound suits the moment. See
[Sounds are data, and the machine listens](<decisions/Sounds are data, and the machine listens.md>).

## Feedback and reduced motion

- A landed piece receives an immediate visual and musical response.
- Completing a puzzle receives a larger response and its celebration.
- Ask `src/motion.ts` for the motion preference; do not query it ad hoc.
- Reduced motion preserves meaning and final state. Ordinary transitions
  collapse; content whose existence is its movement becomes still and reachable
  instead of disappearing. See
  [Under reduced motion, a floater holds still](<decisions/Under reduced motion, a floater holds still.md>).

## When nobody is playing

`src/rest.ts` freezes an unattended or hidden page and wakes it on renewed
presence.

- **Rest is a freeze, never a state change.** Levels, celebrations, timers, and
  animation progress resume from where they stopped.
- **Pause running platform animations rather than maintaining a manual list.**
- **Use the rest-aware timer helpers** for repeating and delayed work so sleeping
  time cannot create or skip content.
- **The waking interaction still plays.** Wake in the capture phase before the
  event reaches its intended target.
- **Audio resumes with the first waking interaction.**
- **Rest has no player control.** Development overrides stay development tools.

See
[The game sleeps when nobody is playing](<decisions/The game sleeps when nobody is playing.md>).

## Drag

`src/drag.ts` owns pointer mechanics; `src/game.ts` owns what a drop means.

- Hold the piece where a small hand does not cover it.
- Make the whole measured box around the artwork grabbable, including visual
  gaps. See
  [Grab a piece anywhere in the box around its artwork](<decisions/Grab a piece anywhere in the box around its artwork.md>).
- Clamp by the piece's own measured box so it cannot leave the reachable canvas.
- Settle accepted and refused drops with the same gentle motion; only the
  destination and sound differ.
- Preserve each piece's tray home across re-layout.
- **End a drag however the pointer disappears.** Listen at the window boundary
  and handle lost capture, replacement, hidden pages, and another finger taking
  over. See
  [A drag ends however the finger goes away](<decisions/A drag ends however the finger goes away.md>).
- **Wait for an empty hand before re-layout.** A viewport change must not replace
  the element being carried.

## Toddler-proofing

The play surface must prevent browser gestures from stealing play:

- disable touch scrolling and text selection on the stage;
- prevent viewport zoom that can move the board away;
- prevent context menus and native image dragging;
- prevent an extra finger from starting a native gesture over an active drag.

These protections are load-bearing even when desktop testing makes them look
redundant.
