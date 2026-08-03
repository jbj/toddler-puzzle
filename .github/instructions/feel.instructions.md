---
name: "Feel"
description: "Sound, feedback, the idle hint, resting when nobody plays, drag feel, toddler-proofing, and repeatable runs."
applyTo: "src/drag.ts,src/audio.ts,src/hint.ts,src/rest.ts,src/pop.ts,src/style.css,index.html"
---

# Feel

Everything around a level that keeps a two-year-old in the game: how it sounds,
what a landing looks like, the glow that helps a stuck child, going quiet when
nobody plays, and the drag itself. Moving between levels is in
[`navigation.instructions.md`](navigation.instructions.md); a level's own rules
are in [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Sound

Every sound is synthesised in `src/audio.ts`. No audio files (see the
no-binary-assets invariant in
[`product.instructions.md`](product.instructions.md)). See
[Sounds are data, and the machine listens](<../../docs/decisions/Sounds are data, and the machine listens.md>).

- **One ladder.** `note(degree)` reads a pitch off a C major pentatonic ladder,
  and every pitch in the game comes off it. Do not hard-code a frequency; if a
  sound needs a pitch the ladder lacks, the ladder is wrong.
- **Sounds are data.** A `Voice` is one oscillator and one envelope as a plain
  object; a `Phrase` is a list of them relative to its own start; gestures
  (`run`, `chord`, `together`, `delayed`) build phrases from voices. Only
  `schedule` touches Web Audio, and only `play` calls it.
- **One gate.** `play` is the only way a phrase is heard and where the sound
  toggle is checked. `tests/audio.test.ts` enumerates the module's exports and
  fails if one is not silent when sound is off.
- **A voice per kind, a phrase per celebration.** `playSnap(kind)` is keyed by
  `Record<PuzzleKindId, Phrase>` and `playChapterFanfare(id)` by
  `Record<CelebrationId, Phrase>`, so a new kind or celebration without a sound is
  a compile error, not a silent default.
- **Nothing harsh.** Sine and triangle only, a real attack on every voice, an
  exponential release, a per-voice gain ceiling (`MAX_VOICE_GAIN`) and a pitch
  ceiling (`MAX_PITCH_HZ`, C7); `voice()` clamps both. The game plays close to a
  face at full volume. A refused drop plays `playReturn` - a soft, warm tone that
  falls slightly - and the piece drifts back to the tray: never a buzzer, never
  left where it fell.
- **A run of pops is musical.** `playPop` and `playPlink` share one "never the
  same degree twice running" rule.
- **A burst degrades rather than crackles.** Live voices are counted
  (`MAX_LIVE_VOICES`); over the cap a voice is dropped, not queued, and `onended`
  disconnects both its nodes. The whole bus runs through a `tanh` soft clip. Do
  not swap it for a `DynamicsCompressorNode`: Chrome attenuates by a fixed 6 dB
  even far below threshold.
- **Two harnesses stand in for ears.** `tests/audio.test.ts` checks structure;
  `npm run audio:check` renders every sound through a real `OfflineAudioContext`
  in Chromium and measures peak, onset and release continuity, duration, spectral
  centroid, and bit-silence when the toggle is off - it is in `npm run verify`.
  `npm run audio` draws the same renders as `.art/audio/sheet.png`.
- **`VOCABULARY` is what gets measured**, so where a sound has variants it lists
  the *ends* of the range, not only the first.
- **Audio needs a gesture to start**: `unlockAudio` runs off the first pointer
  down, not at load.

## Feedback

- A landed piece gets a sparkle burst; finishing a level gets a bigger one
  (`src/celebrate.ts`); finishing a chapter gets a celebration on top
  (`src/celebration.ts`).
- On a touch level (`PuzzleKind.play`) the kind reports a touch through
  `host.touched(at)` and gets a sparkle there plus a completion check, so a
  bubble bursting and an animal landing are answered alike. The same call with no
  point means the puzzle moved on without a finger (an activity's ten seconds
  running out) and gets the check without the sparkle. Everything else - the
  sound, the spin, the bush going - belongs to the kind and happens in the tick
  the finger landed.
- `prefers-reduced-motion` is honoured throughout; `prefersReducedMotion()` in
  `src/motion.ts` is the one place asked. The settle transition and the sparkles
  collapse to 1ms (same code path, element ends in place) and the finish button's
  pulse does not start. A floating thing in `src/pop.ts` is the exception - it
  holds still, because collapsing its drift would carry it off screen at once; see
  [Under reduced motion, a floater holds still](<../../docs/decisions/Under reduced motion, a floater holds still.md>).
  A celebration follows the same rule: the parade stands in a row, a rainbow
  appears without wiping on, a firework bursts without climbing.

## The idle hint

`src/hint.ts` owns the delays, the rule for which piece, and the glow. After a
stretch with no progress the board glows quietly where the next piece goes -
silent, never punitive. See
[A hint points at both ends](<../../docs/decisions/A hint points at both ends.md>).

- **It points at both ends.** The target the piece belongs in, brightly, and the
  piece still in the tray, faintly - a lone glow on a hole would not say *which*
  thing goes there.
- **Both marks are the piece's own `outline`**, drawn from the same path the piece
  and hole are drawn from - at `kind.target(...)` for the bright end and the
  piece's tray home for the quiet one. The one-path invariant reused; the hint
  needs no per-kind knowledge.
- **A kind with a choice of place glows every one.** The bright end is
  `kind.openTargets(...)` where a kind offers it, falling back to `target`. A kind
  that implements `settle` must implement `openTargets`.
- **Stroke only, never a fill.** A warm unfilled double stroke, so a hint is never
  mistaken for a filled hole. `npm run shot` counts the filled shapes in a hint
  and expects none.
- **Which piece:** `hintPiece` is one pure rule - the last-touched piece if still
  unplaced, otherwise the first unplaced piece, otherwise nothing.
- **No hint on a touch level.** A `PuzzleKind.play` level has no tray, target or
  wrong place, and the host would point into a layer the kind owns and moves.
- **`stop()` latches, and that is the whole race guard.** `src/game.ts` stops the
  hint in exactly two places: the `mount()` teardown before `buildBoard` replaces
  the DOM, and `checkComplete`, before any celebration is built - so a celebration
  is never interrupted by a glow.
- **Any interaction restarts the wait**, including one that achieves nothing. A
  `pointerdown` on the stage stirs the hint, registered *before* `enableDragging`
  so pressing a piece stirs first and the pick-up pauses second; a drop stirs it
  again, accepted or refused.
- **Reduced motion keeps the glow and drops the pulse**, via
  `prefersReducedMotion()` in `src/motion.ts`.
- **Drawn into `board.hintLayer`**, over the backdrop and under the pieces.
- **On a sleeping page the hint holds** rather than pausing mid-fade (see below).

## When nobody is playing

`src/rest.ts` owns it. Two minutes with nothing touched - or the instant the tab
is hidden - freezes the whole page: every running animation paused, every
repeating timer stopped, the speakers put down. A touch, key, wheel, mouse
crossing the board, or the tab being looked at again undoes all of it. See
[The game sleeps when nobody is playing](<../../docs/decisions/The game sleeps when nobody is playing.md>).

- **It is a freeze, never a state change.** No level moves, no celebration ends,
  nothing is put away, and every animation resumes from where it stood - which is
  how a finale that "never winds down" sleeps without winding down.
- **Sleeping is `document.getAnimations()`, on purpose.** Only *running*
  animations are paused, so each resumes rather than restarting. Do not replace
  the sweep with a register.
- **A timer asks for itself.** `repeatWhileAwake` in `src/rest.ts`, never
  `setInterval`, for anything that ticks on its own (the bubbles' refill, a
  celebration's `every`): these stop dead and start again. `afterWhileAwake`,
  never `setTimeout`, for a one-shot that *makes* something (a celebration's
  `after`): it holds its clock and serves the rest of the wait on waking, so a
  frozen sky is not filled with new animations nobody is watching.
- **The hint holds bright.** `[data-asleep] .hint-mark` in `src/style.css` drops
  the pulse and holds the glow, as reduced motion does.
- **Waking is in the capture phase, and the same touch still plays.** A finger on
  a bubble wakes the page and then pops the bubble - never two taps. Looking at
  the tab again wakes it without a touch.
- **The speakers come back in time.** `restAudio` suspends the context and
  `stirAudio` resumes it; because `resume()` settles a tick or two later,
  `audio.ts` counts a resume in flight as playable, or the first sound after every
  sleep would be swallowed. Only a context never unlocked is still refused.
- **Two minutes is a constant, with no control** - not on the play surface, not in
  the panel. `?rest=2` sleeps after two seconds instead, a dev tool like `?seed=`
  and `?level=`, and what `npm run shot` uses.

## Drag feel

`src/drag.ts` is the pointer-event drag engine; `src/game.ts` owns what a drag
means. Neither is started for a touch level.

- The piece is held slightly above the finger, so a small hand does not cover it.
- A piece is picked up anywhere inside the box around its artwork, not only on
  paint. Every piece carries an invisible rectangle over its drawing (`fitGrabBox`
  in `src/board.ts`), measured from the artwork at mount and clamped to the
  piece's authored box (slots never overlap), so one piece's grab area cannot
  reach into the next. Do not delete the rectangle. See
  [Grab a piece anywhere in the box around its artwork](<../../docs/decisions/Grab a piece anywhere in the box around its artwork.md>).
- Pieces are clamped to the canvas by their own bounds (`boxOf(layout, piece)`),
  so one can never be dragged out of reach.
- A piece settles back with a short animation (`SETTLE_MS`) whether accepted or
  refused - the difference is where it settles, not how abruptly.
- Which tray slot each piece belongs to is remembered in the host and survives a
  re-layout.
- **A drag ends however the finger goes away, and a press is never refused.** The
  engine holds a drag but gates nothing on one: a press on a pickupable piece
  drops whatever was held and takes the new one, so two hands cannot deadlock; the
  release is heard on the *window* in the capture phase, so a lift on the
  safe-area strip still counts; `lostpointercapture` is a drop; and the page being
  hidden or unloaded lets go. Do not put the release back on the stage, and do not
  restore a press that returns early because something is notionally still down.
  The rule half (`createDragging`) is pure and covered by `tests/drag.test.ts`.
  See
  [A drag ends however the finger goes away](<../../docs/decisions/A drag ends however the finger goes away.md>).
- `enableDragging` returns its teardown, which `game.ts` calls when a board is
  replaced; its listeners are on the window.
- **A re-layout waits for an empty hand.** The board is composed for the box it is
  drawn in, so any change of screen shape rebuilds it - a rotation, a resized
  window, a phone collapsing its address bar - and rebuilding replaces the element
  a finger is carrying. `game.ts` remembers the held piece and defers the rebuild
  until the piece is let go and its drop judged - but never from inside the drop
  itself, since the newest finger wins and a drop may be the first half of a
  press. The rebuild is queued a tick later; a hand that filled again defers it
  once more. See
  [The board is composed for the screen it is on](<../../docs/decisions/The board is composed for the screen it is on.md>).

## Toddler-proofing

Each of these is load-bearing:

- `touch-action: none` on the stage, so a drag never turns into a scroll;
- `user-select: none`, so a slow drag never selects text;
- `maximum-scale=1.0, user-scalable=no` in `index.html`, so pinch and double-tap
  cannot zoom the board away;
- `contextmenu` and `dragstart` prevented in `src/drag.ts`, so a long-press menu
  or native image drag cannot interrupt play;
- a `pointerdown` arriving while a piece is held is prevented whatever it landed
  on, so an extra finger cannot start a native gesture over a drag.

## Repeatable runs

`src/main.ts` reads `?seed=123` and hands `createGame` a seeded random source
instead of `Math.random`. Without it, every puzzle deals fresh animals. The
screenshot run uses a seed to compare like with like; see
[`tests.instructions.md`](tests.instructions.md).
