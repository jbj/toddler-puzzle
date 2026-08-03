---
name: "Navigation and feel"
description: "How the game moves between levels, how a chapter and the game end, what the buttons and dots are for, and the feedback and toddler-proofing around a drag."
applyTo: "src/game.ts,src/celebrate.ts,src/celebration.ts,src/drag.ts,src/audio.ts,src/grownups.ts,src/hint.ts,src/rest.ts,src/main.ts,src/style.css,index.html"
---

# Navigation and feel

This is the shell around the puzzle: getting from one level to the next, what
happens when a piece lands, and everything that keeps a two-year-old from
falling out of the game by accident. The rules of a level live elsewhere - see
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).

## Forward only

A game is thirty levels long, in six chapters of five, and it starts on level 1
with a screenful of bubbles to pop - a level that asks for a finger and nothing
else, because dragging is beyond many one-year-olds and a first screen they
cannot work is a closed door. What each level holds is the table in
`src/levels.ts`, not anything here; see
[`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md). Finishing a
level clears the tray and puts one big button in it, which leads to the next
level - a level played by touching has no tray to clear, and the same button
appears in the same place. Finishing the fifth level of a chapter puts that
button on top of a celebration; see [The end of a chapter](#the-end-of-a-chapter)
below. The button after the last level starts the whole game
over
(`nextLevel` in `src/levels.ts` wraps). So the only way to go is forward and
there is never a menu to get lost in.

There is no menu, no difficulty picker, no settings, no failure state and no
score on the play surface, and putting one there is a change to an invariant,
not a feature. The reasoning is
[decision 20260727T072917](../../docs/decisions/20260727T072917-no-menu-or-difficulty-picker.md).
Everything a grown-up can change lives in the panel described below, which the
child cannot open.

A grown-up can shorten the ramp from that panel, by switching a kind of puzzle
off. That does not edit the table and does not add anything to the play surface:
the levels of a kind that is off are stepped over, and the game still runs
forward through what is left. `nextLevel`, `endsChapter`, `playableFrom` and
`isLastPlayable` in `src/levels.ts` all take the same optional `EnabledKinds`
and mean the same things about the game actually being played - so the button
onwards skips, a chapter still ends where it now ends, and the finale still
lands on the last level in play whatever number it carries. `src/game.ts` reads
the setting at the moment it needs it rather than keeping a copy, so a switch
moved mid-level is answered by the button at the end of that level. See
[decision 20260730T194900](../../docs/decisions/20260730T194900-a-grown-up-can-take-a-kind-out.md).

The six dots by the reset button (`buildChapterDots` in `src/board.ts`) are one
per chapter, filled up to the chapter being played, so a grown-up can see how far
along the set is without thirty dots of clutter. They are an indicator, not a
control: they carry `pointer-events: none` on purpose. Do not make them tappable.

`?level=` in the URL (`src/main.ts`) starts partway along the ramp. It exists for
the screenshot run and for whoever is working on the game - playing to level 30
to look at level 30 takes minutes - and is emphatically not a difficulty picker:
nothing in the game offers it, and the player cannot read a URL. Do not surface
it. It wins over the saved level, because a link should go where it says, and it
writes nothing: a level played from a deep link, and the loop back to level 1
after it, leave the child's own place exactly where it was.

The reset button re-deals the current level. It goes through the same path as
moving between levels (`startPuzzle` in `src/game.ts`), so a board is rebuilt
one way rather than two, and a toddler never sees the same line-up twice in a
row for long.

## The end of a chapter

Thirty levels that all end with the same four-note fanfare and the same 700ms
sparkle flatten completely, so the fifth level of every chapter ends with a
celebration instead: balloons, a rainbow, blossom, a parade, fireworks, and
after level 30 the finale. `src/celebration.ts` owns all six; `endsChapter` in
`src/levels.ts` says when one is due, read off the level table rather than
written down as a list of level numbers.

The rules a celebration has to keep:

- **It is never made of what the finished board is made of.** A celebration is
  drawn over the puzzle that has just been solved, and the puzzle stays there to
  be admired - so anything the two have in common arrives as a second copy of
  the board. This is why the parade of animals ends the chapter of coloured
  shapes rather than the chapter of animals, where an elephant walked over the
  elephant still sitting in its hole, and why it deals its walkers from the
  animals the board is *not* holding (`paradeCast`) rather than from the pieces
  just placed. Before hanging a celebration on a chapter, look at what that
  chapter's fifth level leaves on the screen. The reasoning is
  [decision 20260801T160000](../../docs/decisions/20260801T160000-a-celebration-is-not-made-of-the-board.md).

- **It is played, not watched.** Everything in one answers a finger in the tick
  the finger landed - a balloon pops, an animal hops, a tap paints the next arc
  or sets off a firework. A two-year-old will not sit through a cutscene; they
  will put a finger on it, and what a finger lands on has to do something good.
- **It is not a level and not a `PuzzleKind`.** It has no pieces, no targets, no
  difficulty and no row in the thirty-level table. What it copies from
  `PuzzleKind.play` is the shape: handed a layer, answers the finger itself,
  returns a teardown, keeps its progress outside the board so a rotation does not
  lose it.
- **It cannot be a trap at either end.** The big button onwards goes up while
  the celebration is still going, not after it, so a child who pops everything in
  four seconds already has the way on; and new things go on arriving unasked for
  `CELEBRATION_SPAN_MS`, so a child who touches nothing is not looking at an
  empty screen. When the span runs out only the *arriving* stops - whatever is on
  screen goes on answering for as long as the child stays. A floater hands its
  place on part way through its journey rather than at the edge
  (`TUNING.handOnAt`), so a handful released together cannot reach the edge
  together and leave a hole behind them.
- **The button arrives rather than sitting there - but only on a chapter end,
  and only the first time.** It holds back for `FINISH_BUTTON_BEAT_MS`
  (`src/celebration.ts` explains the number) and then fades up, because after
  twenty-five presses it is the most conditioned thing on the screen and would
  otherwise be pressed before the celebration is noticed. The celebration answers
  a finger throughout that beat, so nothing is withheld except the way out. Do
  not extend the beat to an ordinary level, where the button is the whole reward,
  and do not re-run it after a rotation: `showFinish` takes a `fresh` flag for
  exactly that.
- **Nothing here ever changes the level by itself.** A clock that advanced the
  game would take it away mid-tap. The finale does not wind down at all: the end
  of thirty levels is a room to stay in, and the way out is the same button.
- **It is drawn below the effects layer.** `board.celebrationLayer` sits between
  the pieces and `fx`, which is what makes it impossible for a balloon or a
  full-board tap catcher to cover the button onwards. Do not move it above.

The reasoning is
[decision 20260729T152400](../../docs/decisions/20260729T152400-a-celebration-is-played-not-finished.md).

## Coming back to it

Thirty levels is more than one sitting, so the level being played is remembered
in `localStorage` and the next visit resumes there. `src/progress.ts` owns the
record - current level, furthest reached, and the grown-up settings - and
`startPuzzle` in `src/game.ts` is the one place that tells it which level is
being played. Re-dealing the same level writes nothing, which is what keeps the
reset button from touching progress.

Three things about it are load-bearing:

- **Storage failing is not an error.** iPad Safari in private browsing throws on
  the mere mention of `localStorage`. Every failure - throwing, disabled, full,
  corrupt, a version this build does not know - falls back to an in-memory
  record and level 1, silently. Never surface it: the player cannot read, and
  the game is not diminished by forgetting. A storage that can be read but not
  written is still read, though, so a device out of quota resumes where the
  child was; `persists` is how the panel tells that apart, and once it is false
  it stays false.
- **A stored level is checked against the table.** A level number the thirty no
  longer has sends the child back to level 1, not to the last level.
- **Progress is cleared from the grown-up panel and nowhere else**, via
  `clearProgress()`. The button on the play surface deals a fresh puzzle for the
  level being played; that is all it has ever done.

The settings in the record - `sound`, `hints` and `kinds` - are set from the
grown-up panel below. `applySettings` in `src/grownups.ts` is the single place
`sound` and `hints` reach the game: `sound` calls `setSoundEnabled` in
`src/audio.ts`, which every tone goes through, so off means silent whatever is
played next, and `hints` calls `setHintTiming` in `src/hint.ts`, which owns both
the delays and the glow; see [the idle hint](#the-idle-hint) below. Both are
answered on the board in front of the grown-up rather than at the next level,
because the moment a switch is moved is usually the moment a child is stuck.
`kinds` is deliberately not in `applySettings` - there is nothing to switch on.
`src/game.ts` asks the record which kinds are in play at the moment it needs to
know, and `src/main.ts` resumes forward off a level whose kind has since been
switched off, so there is no copy of the setting anywhere to keep in step.
There is no `rotation` setting: rotation mode was dropped rather than built, so
the switch and the field went with it - see
[decision 20260730T203000](../../docs/decisions/20260730T203000-no-rotation-mode.md).
Dropping a field did not bump `STORAGE_VERSION`, because every field is read on
its own and an unknown one is passed over; a record written when the switch
existed still resumes on the right level. Adding `kinds` did not bump it either,
for the same reason in reverse: a record from before the per-kind switches has
no `kinds` and reads as the whole ramp. The reasoning for all of this is
[decision 20260728T212500](../../docs/decisions/20260728T212500-remember-where-the-child-stopped.md).

## The grown-up panel

The one part of the game that is not for the child (`src/grownups.ts`). It holds
a map of the thirty levels to jump about in, the switches, and the only reset in
the game. The reasoning is
[decision 20260729T000652](../../docs/decisions/20260729T000652-a-door-for-grown-ups.md);
what the code has to keep true is this.

- **The button is visible and says "Grown-ups".** It is not a secret gesture and
  must not become one: a parent who has never seen the game has to be able to
  find it, and a gesture obscure enough to defeat a toddler defeats them too.
- **Tapping it never opens anything.** A press starts a two-second hold
  (`HOLD_MS`) and shows "Hold to open"; a release starts the next hold from
  zero, so taps never add up. The rule is `createHoldGate`, a state machine with
  the clock passed in and no DOM in it, which is why two hundred taps can be
  checked in Vitest. The ring around the button is painted from the same gate on
  an animation frame, but the opening is armed on a timer as well: frames are
  for the ring, the clock is the rule.
- **The prompt outlives the press.** "Hold to open" stays up for `PROMPT_MS`
  after a tap, because the tap is the moment a grown-up needs telling and the
  answer has to still be there when they look.
- **The panel is not toddler-styled.** Small text, ordinary switches, ordinary
  spacing. Making it big and bright would invite exactly the person it is
  hiding from.
- **It never touches the board.** It is HTML mounted outside `#app` - which
  `buildBoard` replaces wholesale - so closing it puts the child back mid-puzzle
  without re-dealing anything. Only choosing a level, or switching off the kind
  of the level being played, changes the board.
- **Choosing a level is not reaching it.** The map's squares come from
  `furthest`, and a level chosen here goes through `jumpToLevel` rather than
  `reachLevel`, so reading the map never fills the map in. `createGame` returns
  the handle the panel drives (`chooseLevel`, `currentLevel`).
- **A kind can be switched out of the game, but never the last one.** Six
  switches, one per `PuzzleKindId`, walked off `PUZZLE_KINDS` in
  `src/levels.ts` so a seventh kind cannot arrive without one. `toggleKind` is
  the rule and is pure - no DOM, no record - for the same reason
  `createHoldGate` is: it refuses the press that would leave nothing to play,
  and `refresh` draws the lone survivor as held on rather than letting a
  grown-up press something that silently does nothing. Switching off the kind
  under the child moves them to the next level in play, because the moment a
  parent turns a kind off is almost always the moment their child is stuck on
  one of its levels. The map keeps all thirty squares and fades the skipped
  ones - it is how a grown-up sees what the switch did - and they stay
  pressable. See
  [decision 20260730T194900](../../docs/decisions/20260730T194900-a-grown-up-can-take-a-kind-out.md).
- **Reset asks twice**, and is the only place progress can be cleared.
- **Every option on it does something.** A switch for sound, a choice of idle
  hint timing, and a switch per kind of puzzle. The rotation switch that used to
  sit among them is gone with the feature - see
  [decision 20260730T203000](../../docs/decisions/20260730T203000-no-rotation-mode.md)
  - because a control a parent moves and nothing answers is worse than no
  control. `npm run shot` reads the option labels off the panel and checks the
  list, so one cannot creep back; it also reads the notes underneath and fails on
  any that admits to doing nothing yet, so the two cannot drift apart.

## Sound

Every sound in the game is synthesised in `src/audio.ts`. There are no audio
files; see the no-binary-assets invariant in
[`product.instructions.md`](product.instructions.md). Thirty levels, six kinds
and six celebrations need more than four tones, so the file is a small
vocabulary rather than a list of hand-tuned copies. The reasoning is
[decision 20260730T183000](../../docs/decisions/20260730T183000-sounds-are-data-and-the-machine-listens.md);
what the code has to keep true is this.

- **One ladder.** `note(degree)` reads a pitch off a C major pentatonic ladder,
  and *every* pitch in the game comes off it. That is what makes twenty sounds
  feel like one game, and why there is no wrong note whatever order a toddler
  triggers them in. Do not hard-code a frequency; if a sound needs a pitch the
  ladder does not have, the ladder is wrong.
- **Sounds are data.** A `Voice` is one oscillator and one envelope as a plain
  object; a `Phrase` is a list of them relative to its own start; gestures
  (`run`, `chord`, `together`, `delayed`) build phrases out of voices. Only
  `schedule` touches Web Audio, and only `play` gets to call it. Adding a sound
  means writing a phrase, not writing more audio code.
- **One gate.** `play` is the only way a phrase is heard, and it is where the
  sound toggle is checked. A new sound that does not go through it is a bug a
  grown-up meets on a train; `tests/audio.test.ts` enumerates the module's own
  exports and fails if one of them is not silent when sound is off.
- **A voice per kind, a phrase per celebration.** `playSnap(kind)` is keyed by
  `Record<PuzzleKindId, Phrase>` and `playChapterFanfare(id)` by
  `Record<CelebrationId, Phrase>`, so a new kind or celebration without a sound
  is a compile error rather than a silent fall-through to a default. A wooden
  animal seating into its hole, a slice rejoining the animal it was cut from, a
  polygon clicking onto its shadow, two jigsaw pieces meshing and a shard
  settling are five different physical events and sound like it.
- **Nothing harsh.** Sine and triangle only, a real attack on every voice, an
  exponential release, a per-voice gain ceiling (`MAX_VOICE_GAIN`) and a pitch
  ceiling (`MAX_PITCH_HZ`, C7). The ear is most sensitive between two and four
  kilohertz, so pitch is the one way a soft sine wave can still be piercing;
  `voice()` clamps both, because the degree that goes too far does not look any
  different from the ones that do not. The game is played close to a face at
  full volume. A refused drop plays
  `playReturn` - a soft, warm tone that falls slightly - and the piece drifts
  back to the tray: never a buzzer, and never left where it fell.
- **A run of pops is musical, not mechanical.** `playPop` and `playPlink` share
  one "never the same degree twice running" rule, so bursting a raft of bubbles
  walks up and down the ladder instead of repeating one note.
- **A burst degrades rather than crackles.** Live voices are counted
  (`MAX_LIVE_VOICES`); over the cap a voice is dropped rather than queued, and
  `onended` disconnects both its nodes. The whole bus runs through a `tanh` soft
  clip, so thirty balloons popped at once get gently *quieter* instead of
  clipping. Do not swap it for a `DynamicsCompressorNode`: Chrome attenuates by
  a fixed 6 dB there even far below threshold.
- **Nobody can hear a change to this file in review**, so two harnesses stand in
  for ears. `tests/audio.test.ts` checks the structure, and
  `npm run audio:check` renders every sound through a real `OfflineAudioContext`
  in Chromium and measures the samples - peak, onset and release continuity,
  duration, spectral centroid, and bit-silence when the toggle is off. It is in
  `npm run verify`. `npm run audio` draws the same renders as
  `.art/audio/sheet.png` - each sound labelled with what sets it off and the
  notes it plays - for a human to look at.
- **`VOCABULARY` is what gets measured**, so where a sound has variants it lists
  the *ends* of the range and not only the first. The fifth firework and the
  smallest bubble are the brightest things the game can play, and listing only
  `firework(0)` hid three phrases that climbed to 3.5 kHz.
- Audio needs a gesture to start, so `unlockAudio` runs off the first pointer
  down rather than at load.

## Feedback

- A piece that lands gets a sparkle burst; finishing a level gets a bigger one
  (`src/celebrate.ts`), and finishing a chapter gets a celebration on top of it
  (`src/celebration.ts`, above).
- On a level played by touching (`PuzzleKind.play`), the host does the same for
  a touch: the kind reports one through `host.touched(at)` and gets a sparkle
  there and a check for completion, so a bubble bursting and an animal landing
  are answered the same way. The same call with no point is the kind saying the
  puzzle moved on without a finger - an activity's ten seconds running out - and
  it gets the check without the sparkle, because nothing was touched. Everything
  else about the response - the sound, the spin, the bush going - belongs to the
  kind, and all of it happens in the tick the finger landed. See
  [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).
- `prefers-reduced-motion` is honoured throughout, and `prefersReducedMotion()`
  in `src/motion.ts` is the one place that is asked: the settle transition and
  the sparkles collapse to 1ms rather than being removed, so the same code path
  still ends with the element in the right place, and the finish button's pulse
  simply does not start. A floating thing in `src/pop.ts` is the one exception -
  it holds still instead, because collapsing its drift would carry it off screen
  at once; see
  [decision 20260729T072100](../../docs/decisions/20260729T072100-reduced-motion-holds-still.md).
  A celebration follows the same rule: the parade stands in a row rather than
  walking, a rainbow appears without wiping itself on, and a firework bursts
  without climbing - the moment still happens, more calmly.
- A stretch with nothing happening is answered too, by [the idle
  hint](#the-idle-hint) below.

## The idle hint

`src/hint.ts` owns all of it: the delays, the rule for which piece, and the glow
itself. After a stretch with no progress the board glows quietly where the next
piece wants to go - silent, and never punitive. It is the anti-frustration valve
at the young end, and it is what makes the later levels safe to be hard. The
reasoning is
[decision 20260730T213000](../../docs/decisions/20260730T213000-a-hint-points-at-both-ends.md);
what the code has to keep true is this.

- **It points at both ends.** The target the piece belongs in, brightly, and the
  piece still waiting in the tray, faintly. A lone glow on a hole says something
  goes here but not *which* thing, and the child this exists for may not yet have
  worked out that pieces move at all.
- **Both marks are the piece's own `outline`**, drawn from the same path the
  piece and its hole are drawn from - at `kind.target(...)` for the bright end
  and the piece's tray home for the quiet one. That is the one-path invariant
  reused, and it is why the hint needs no per-kind knowledge: a slice glows the
  whole animal it belongs to, a polygon glows the shadow it is aimed at *now*,
  swaps included.
- **A kind with a choice of place glows every one of them.** The bright end is
  `kind.openTargets(...)` where a kind offers it, falling back to `target` where
  it does not. A polygon piece is accepted into *any* free congruent shadow, so
  a hint that named one of four free petals would teach a rule the game does not
  have - and a child being hinted at is the least able to discover it was a lie.
  A kind that implements `settle` must implement `openTargets`: the same choice
  that has to be written down has to be pointed at. See
  [`puzzle-kinds.instructions.md`](puzzle-kinds.instructions.md).
- **Stroke only, never a fill.** A filled target in this game is an opaque
  animal in its hole; an empty hole is a thin rim. A warm unfilled double stroke
  is neither, so a hint can never be mistaken for a hole already filled.
  `npm run shot` counts the filled shapes in a hint and expects none.
- **Which piece, when nobody has touched anything.** `hintPiece` is one rule: the
  last-touched piece if it is still unplaced, otherwise the first unplaced piece,
  otherwise nothing. That covers the start of a level and the moment after a
  placement without a special case, and it means "nobody has touched anything"
  never means "no help". It is a pure function, so it is tested without a DOM.
- **No hint on a level played by touching.** A `PuzzleKind.play` level has no
  tray, no target and no wrong place, so the frustration this answers cannot
  arise; and the host pointing into a layer the kind owns and animates would
  point at something that has since moved.
- **`stop()` latches, and that is the whole race guard.** A timer armed against a
  board that is then replaced draws nothing, and a stray event on a torn-down
  board re-arms nothing. `src/game.ts` stops the hint in exactly two places: the
  `mount()` teardown, before `buildBoard` replaces the DOM, and `checkComplete`,
  the moment the level is finished and *before* any celebration is built. That is
  why a celebration is never interrupted by a glow.
- **Any interaction restarts the wait**, including one that achieves nothing. A
  `pointerdown` on the stage stirs the hint - registered *before* `enableDragging`
  so that pressing a piece stirs first and the pick-up pauses second, leaving a
  drag with nothing armed - and a drop stirs it again whether it was accepted or
  refused.
- **Reduced motion keeps the glow and drops the pulse.** A child who needs the
  hint still needs it; `prefersReducedMotion()` in `src/motion.ts` makes it hold
  at a steady opacity instead of breathing.
- **It is drawn into `board.hintLayer`**, directly over the backdrop and under
  everything else, so the glow sits on the hole and beneath the pieces.
- **A hint on a sleeping page holds rather than pausing mid-fade.** See
  [when nobody is playing](#when-nobody-is-playing) below.

## When nobody is playing

`src/rest.ts` owns it. Two minutes with nothing touched - or the instant the tab
is hidden - and the whole page freezes: every running animation paused, every
repeating timer stopped, the speakers put down. Anything that says somebody is
there undoes all of it: a touch, a key, a wheel, a mouse crossing the board, or
the tab being looked at again. The reasoning is
[decision 20260801T153000](../../docs/decisions/20260801T153000-the-game-sleeps-when-nobody-is-playing.md);
what the code has to keep true is this.

- **It is a freeze, never a state change.** No level moves, no celebration ends,
  nothing is put away, and nothing in the game is told it happened. Every
  animation resumes from where it stood. This is what lets a finale that "never
  winds down" sleep without winding down.
- **Sleeping is `document.getAnimations()`, on purpose.** A register of
  animations to keep in step would be missing the one somebody forgot to add.
  Only *running* animations are paused, so each resumes rather than restarting,
  and none can finish while the page is asleep. Do not replace the sweep with a
  list.
- **A timer asks for itself.** `repeatWhileAwake` in `src/rest.ts`, never
  `setInterval`, for anything that ticks on its own: the bubbles' refill and a
  celebration's `every`. They stop dead and start again rather than catching up,
  because both are belt-and-braces refills and a frozen screen has nothing to
  refill. `afterWhileAwake`, never `setTimeout`, for a one-shot that *makes*
  something - a celebration's `after`, which hands one balloon's place on to the
  next. That one holds its clock and serves the rest of the wait on waking,
  because a party whose timers went on firing would fill a frozen sky with new
  animations nobody is watching.
- **The hint holds bright.** `[data-asleep] .hint-mark` in `src/style.css` drops
  the pulse and holds the glow, exactly as reduced motion does, because pausing
  a fade could freeze the one thing a stuck child needs to see at its dimmest.
- **Waking happens in the capture phase, and the same touch still plays.** A
  finger landing on a bubble wakes the page and then pops the bubble. A child
  must never have to tap twice, and must never meet a tap that does nothing. A
  tab looked at again wakes it without being touched, because sleep is a way of
  costing nothing while nobody is there rather than a lock, and a board hanging
  motionless is a poor thing to come back to.
- **The speakers come back in time to be heard.** `restAudio` suspends the
  context and `stirAudio` resumes it; because `resume()` settles a tick or two
  later, `audio.ts` counts a resume in flight as playable, or the first sound
  after every sleep would be swallowed. Only a context that has never been
  unlocked is still refused.
- **Two minutes is a constant, and there is no control for it.** Not on the play
  surface and not in the grown-up panel: it changes nothing the child can see.
  `?rest=2` sleeps after two seconds instead - a tool for working on the game,
  like `?seed=` and `?level=`, and what `npm run shot` uses to watch a real
  board freeze, hold its hint, and wake to a popped bubble.

## Drag feel

`src/drag.ts` is the pointer-event drag engine; `src/game.ts` owns what a drag
means. Neither is started for a level played by touching. Between them:

- The piece is held slightly above the finger, so a small hand does not cover
  the thing it is moving.
- A piece is picked up anywhere inside the box around its artwork, not only
  where a finger lands on paint. Every piece carries an invisible rectangle over
  its drawing (`fitGrabBox` in `src/board.ts`), which is what makes the gap
  between a giraffe's legs part of the giraffe. It is measured from the artwork
  at mount and clamped to the piece's authored box - which is exactly the slot
  it was laid out in, and slots never overlap - so one piece's grab area can
  never reach into the next one's. Do not delete the rectangle as dead markup;
  the reasoning is
  [decision 20260728T120732](../../docs/decisions/20260728T120732-grab-anywhere-in-the-piece-box.md).
- Pieces are clamped to the canvas by their own bounds (`boxOf(layout, piece)`),
  so one can never be dragged out of reach whatever shape it is.
- A piece settles back with a short animation (`SETTLE_MS`), whether it was
  accepted or refused - the difference is where it settles, not how abruptly.
- Which tray slot each piece belongs to is remembered in the host and survives a
  re-layout, so rotating the device mid-puzzle does not lose progress.
- **A drag ends however the finger goes away, and a press is never refused.**
  The engine holds a drag but gates nothing on one: a press on a piece that can
  be picked up drops whatever was held and takes the new piece, so two hands
  cannot deadlock; the release is heard on the *window* in the capture phase
  rather than on the stage, so a lift on the safe-area strip still counts;
  `lostpointercapture` is a drop; and the page being hidden or unloaded lets go
  of the piece. Do not put the release back on the stage, and do not restore a
  press that returns early because something else is notionally still down -
  that is precisely how a toddler's several fingers used to leave the board
  dead until it was re-dealt. The rule half (`createDragging`) is pure and
  covered by `tests/drag.test.ts`; the reasoning is
  [decision 20260802T170000](../../docs/decisions/20260802T170000-a-drag-ends-however-the-finger-goes-away.md).
- `enableDragging` returns its teardown, and `game.ts` calls it when a board is
  replaced. Its listeners are on the window, so they do not go with the stage.
- A re-layout waits for an empty hand. The board is composed for the box it is
  drawn in, so *any* change of screen shape rebuilds it - a rotation, a resized
  window, a phone collapsing its address bar - and rebuilding replaces the
  element a finger is carrying. `game.ts` remembers the held piece from the drag
  callbacks and defers the rebuild until the piece is let go and its drop has
  been judged. See
  [decision 20260801T190000](../../docs/decisions/20260801T190000-the-board-is-composed-for-the-screen.md).

## Toddler-proofing

A toddler holds a tablet with both hands and touches it everywhere. These are
all deliberate, and each one is load-bearing:

- `touch-action: none` on the stage, so a drag never turns into a scroll;
- `user-select: none`, so a slow drag never selects text;
- `maximum-scale=1.0, user-scalable=no` in `index.html`, so pinch and double-tap
  cannot zoom the board away;
- `contextmenu` and `dragstart` are prevented in `src/drag.ts`, because a
  long-press menu or a native image drag both interrupt play;
- a `pointerdown` arriving while a piece is held is prevented whatever it landed
  on, so an extra finger cannot start a native gesture over a drag - which is
  one of the things that makes WebKit drop the first finger's release.

## Repeatable runs

`src/main.ts` reads `?seed=123` from the URL and hands `createGame` a seeded
random source instead of `Math.random`. Without it, every puzzle deals fresh
animals. The screenshot run uses a seed to compare like with like; see
[`tests.instructions.md`](tests.instructions.md).
