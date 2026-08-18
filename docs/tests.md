# Tests

## Writing them

- The deal is random. Never assume one fixed cast, one fixed order, or one
  animal in a particular hole.
- Assert the invariant, not a snapshot of one deal: holes stay on canvas, no
  piece reaches another's place, tray slots do not collide, wrong drops return
  to the tray.
- Layouts are composed, not tabulated, so test the promise, not the output.
  `PROMISES` in `tests/puzzle.test.ts` is a table - each takes a layout and
  returns what is wrong or `null` - checked against every layout in `COMPOSED`:
  every piece count, both orientations, several random casts each, over a spread
  of screen ratios. A new property goes in that table; a new piece count needs
  nothing.
- Deal two kinds of cast. `animalCast` is the real animals in random order,
  repeating the list past its length. `oddCast` is boxes of any proportions
  standing anywhere in the lower part of their box - because every animal is
  square and stands near its foot, so an animal cast cannot tell whether the
  composition reasons about each piece's own reach.
- When a check needs one specific shape, rotate the animal list so every animal
  appears in every place that matters, catching foot-level problems one seed
  hides.
- Use `?seed=` only to reproduce a deal in a browser run, not as a reason to
  depend on one cast.
- A suite that reaches for the kind registry must `await loadAllKinds()` at the
  top of the module first (four of the six kinds are a chunk each; `kindFor`
  stays synchronous and strict). `tests/levels.test.ts` and
  `tests/puzzle.test.ts` do this.

## A check that inspects nothing passes

Three shapes that go green while reading nothing:

- A rule over `querySelectorAll(...)` as `filter(...).length === 0`. Rename the
  class and the selector matches nothing, so the filter finds nothing to object
  to.
- A `for` loop over a glob with the assertions inside. If the glob matches
  nothing the body never runs, so no assertion is made.
- A required set parsed from a source file. **A parser that returns fewer
  results than it should is indistinguishable from a world with fewer things in
  it** - everything compared against it agrees.

So, when a check iterates a set it discovered rather than one it was given:

- Assert the set is not empty.
- Put what it read into the failure message - `(6 kinds, 6 chapters, 9
  celebrations)` distinguishes a real pass from a broken parse.
- Where one number can be cross-checked against another found a different way,
  do that. The shot run's coverage guard compares the levels it parsed against
  the levels the running game shows. See
  [Guard the sample against the table, rather than shoot all thirty](<decisions/Guard the sample against the table, rather than shoot all thirty.md>).
- Then make it fail on purpose once: break the thing it catches, run it, read
  the message, put it back.

Every animal is square and fills its box, so two cast helpers keep the layout
and geometry suites honest: grid-cut stand-ins for slices (a drawing in a corner
of a whole-animal box) keep the tray packing by ink not slot, and a plank and a
pole (not square, both directions) keep the engine clamping and snapping each
piece by its own box. Add such a case whenever a check would otherwise pass only
because a piece happens to be square.

## What `npm run test` covers

One row per suite; read the test itself for the assertions.

| Suite | Guards |
| --- | --- |
| `tests/puzzle.test.ts` | Coordinate mapping (letterbox both ways), the drop rule, clamping, box geometry (thickened so neither side is under half the other), the random deal, the shape-match kind, and the `COMPOSED` layouts held to `PROMISES` - on canvas, clear of the tray, on a ground line, never reaching another's place, tray slots never colliding, grabbable, filling any viewport 1:3 to 3:1 within 7% of the fixed canvases. Plus: same cast identical, a fuller board never bigger pieces, portrait more rows, a too-big cast refused not shrunk. |
| `tests/fit.test.ts` | The sizing search on its own, over plain sizes: packing and the floors, and where the tray goes - the top kept at a tie and at a small side win, the sides taken for a big one or for markedly more room at the same size, never for a smaller puzzle. Plus columns a side, determinism, and a bigger canvas never a smaller play area. |
| `tests/levels.test.ts` | Every level a buildable spec, dealt fresh at the right size. Uniqueness: level = kind + subject + size, no two rows all three ([A level names what it is made of](<decisions/A level names what it is made of.md>)). Narrowing: `PUZZLE_KINDS` names every kind, switched-off levels stepped over by `nextLevel`, resume forward, chapter still ends, finale to the last live level, every kind off still a game. A themed level draws only its theme and tops up a short one not throwing. Warm (`src/warm.ts`) names every kind in level order, wrapping. |
| `tests/slices.test.ts` | Cells tile the art box; every slice keeps its animal's box, anchor and outline, aims at its one hole, is accepted only on its own animal, and the hole (divided by the clip paths) shows until the last slice. |
| `tests/polygon.test.ts` | Catalogue geometry (parts inside, overlap absent or explicitly layered and small, grabbable, congruents identical, spares included) and the swap: a piece is accepted by any free shadow of its shape and no other, a filled shadow refuses dead centre, congruents sit far enough apart, a picture finishes however twins share out (incl. reversed), at most one level has no two parts alike. `openTargets` offers one accepted point per congruent place, dropping filled ones. |
| `tests/celebration.test.ts` | Every chapter names a celebration, no two the same, the finale in the last chapter only, `endsChapter` matches the numbering (6, 12, 18, 24, 30), a missing level ends nothing not throws. Interludes: one per level that ends no chapter, no two levels running alike, a level always alike, all four used, `WAY_OUT_MS` inside the celebration. |
| `tests/audio.test.ts` | Vocabulary against a fake `AudioContext` via `useAudioContext`. Hard rule: every exported `play` function is silent when the toggle is off. Plus: each kind and celebration resolves to a distinct phrase, no immediate pitch repeat, no voice over the gain ceiling, only sine or triangle, every pitch on the ladder, 200 pops in a tick within the voice budget and disconnected. One case works the `window` seam so a tab hidden before a resume holds the speakers down. |
| `tests/progress.test.ts` | Mostly unhappy paths (corrupt record, unknown version, missing level, a browser that throws or refuses writes - resuming via `persists`); a panel-map choice remembered without raising `furthest`; a dropped `rotation` field tolerated ([Rotation mode is not built, and the switch is gone](<decisions/Rotation mode is not built, and the switch is gone.md>)); no `kinds` reads as the whole ramp, all-off as all-on. All end playable; none throw. Storage is injected. |
| `tests/scenery.test.ts` | Every level and theme resolves to a backdrop (no quiet meadow fallback); each themed level's markup carries its own colours and none other's; every backdrop draws a tray to stand the pieces on; `src/scenery.ts` (comments stripped) fails if an animal's name appears. |
| `tests/pictures.test.ts` | Every scene loads and is safe to inline more than once, every table-named scene resolves, an unknown id throws saying which, and the box divides evenly by every grid the table cuts at. |
| `tests/jigsaw.test.ts` | Two neighbours hold the same curve point for point, one reversed, at every grid (not "within a tolerance"); tiling measured by summing flattened outlines; one tab per axis per piece (never none), shrinking with the cell, borders straight. |
| `tests/shatter.test.ts` | A sweep - every count 2 to 12, many seeds: shards convex to floating point (turn normalised by side lengths), tiling to nine decimals, every cut walked each way, four floors (area, fatness, spread, no two alike); one seed reproducible, two seeds differ. |
| `tests/picture-board.test.ts` | Tray-first board: the picture reaches an edge or the waiting scale sits on its two-thirds floor; sand spare under a third of the largest piece, tray within a fifth of the outer edge; a waiting piece exactly `waitingScale` of its landing ink and concentric; backdrop flat colour asking for `--board-blue`. |
| `tests/scene-cells.test.mjs` | The "every piece has something in it" measure. Plain ESM (imports `scripts/pictures.mjs`, outside the game tsconfig). A flat wash scores nothing, two shades of one green nothing (not a variance, on purpose), and the cut tiles the box exactly once. |
| `tests/hint.test.ts` | The hint without a DOM, callback held: a hint on a replaced board draws nothing (`stop()` latches, checked in the callback), a torn-down board does not re-arm, "Off" takes a showing hint down and "Sooner" re-arms on the shorter clock; `hintPiece` is the last-touched piece while unplaced, else the first unplaced, else nothing, ignoring a `lastTouched` from another board. |
| `tests/drag.test.ts` | The not-clean-drag sequences (release off stage, snatched capture, no release, second finger, hidden page, refused capture, board replaced mid-air), each ending: is the next press accepted? `createDragging` is pure; the wiring runs through a fake stage recording which listener sits on which target (the window, not the stage). A clean drag rides `FINGER_LIFT` above the finger and keeps its box on canvas. |
| `tests/rest.test.ts` | The wait as a state machine, timers passed in: sleep and wake counted, a hidden tab sleeps without waiting, a stir re-arms, `stop()` never sleeps again. A `repeatWhileAwake` timer ticks awake, stops dead asleep without catching up, does not start if registered asleep; an `afterWhileAwake` one-shot keeps its remaining ms and fires once. |
| `tests/hold.test.ts` | The press a toddler cannot make, guarding the "Grown-ups" button and the one that re-deals. The rule, clock passed in: 200 taps open nothing, near misses do not add up, a release empties the ring, the prompt outlives the press. The wiring, on a fake button: a finger off it gives the hold up at once however little of the ring it filled, one staying on keeps it, a move with no press behind it is unheard, the timers are armed off the gate's own lengths not the constants, a teardown takes them and the listeners. |
| `tests/grownups.test.ts` | The browser-free parts: the map (thirty squares in five chapters of six, filled to `furthest`, one current from the game not the record); `toggleKind` pure and `isLastKindOn` refusing to empty the game. |

## What `npm run shot` covers

An end-to-end run driving real drags and taps over the Chrome DevTools Protocol.
Run `npm run build` first; it serves `dist/` and honours `CHROME_BIN`. It plays a
sample, not all thirty. Screenshots land in `.art/shots/`, with a
`contact-sheet.png` for a pull request.

| Area | Guards |
| --- | --- |
| Playthrough | The opening levels, then `?level=` to the busiest animal board, a shapes picture and the last level: pieces snap, a bad drop does not stick, each level hands over, the dots track the chapter, portrait preserves progress, reopening resumes on the stopped level while `?level=` is left alone, the last level loops, and seeds deal differently while one seed repeats. |
| Picture swap | Two identical shapes, one dragged onto the other's shadow: it settles where aimed, the shadows still name one shape each, the picture finishes; shot in portrait too. |
| Grown-up panel | Ten taps open nothing and raise "Hold to open"; a two-second hold opens; the map shows thirty with the levels played filled, each chapter one row of squares; a chosen level deals and is remembered without claiming it reached; a switch off survives a full reload; reset asks once; labels are listed and notes read for any admitting to do nothing. |
| Reset button | Six taps leave the same board standing and the ring empty; a hold fills it past a third by halfway and deals a fresh board on the same level. |
| Idle hint | Driven to "Sooner": a glow arrives with two marks none filled, naming a waiting piece, bright end on the hole and quiet end under the piece within a few per cent, printing measured pixels; a tap removes it, going quiet brings it back, placing removes it for good; a celebration never glows; hints go back off after. |
| Polygon choice | Only the browser proves the host asks `openTargets` not `target`: a tapped shape's hint glows every free shadow that would take it, the count worked from the page (shadows vs piece drawn), both its own and its twin's shadow offered. |
| Celebrations | All five shot, and all four interludes: two levels running differing, one answering a finger without moving the game on, the last two needing levels 3 and 4. Staged: reduced motion, and the chunk blocked while a level finishes. Balloons hardest, on level 1: each over a tenth of the board, the screen to itself the first beat while answering a finger, the way onwards arriving and staying, balloons bursting and counted, the sky refilling, the level unchanged, a rotation keeping both. The finale adds several at once and answers a tap on bare sky. |
| Coverage guard | Reads every kind and chapter from `src/levels.ts` and every celebration from `src/celebration.ts`, records what the game showed, and fails - naming the first covering level - when the table names one no shot reached; it proves the parse saw the whole table first. See [Guard the sample against the table, rather than shoot all thirty](<decisions/Guard the sample against the table, rather than shoot all thirty.md>). |
| Cut edges | On level 19 every tray piece draws its cut line; on finished slices, jigsaw and shatter every placed edge has faded. The clip (a CSS switch on a custom property) is read: a half-built jigsaw cut where it was, each finished board on the wider closing clip, a settle keeping its clip, reduced motion home already (move a class, do not race the animation). Pieces are counted too. See [A placed piece has no edge](<decisions/A placed piece has no edge.md>). |
| Grab boxes | Measured from rendered artwork: every piece has one covering the drawing without ballooning past it, and a piece grabbed where its artwork is not still comes along and snaps in. |

## What `npm run audio:check` covers

Sounds are rendered, not described: the script bundles `src/audio.ts`, serves it
to headless Chromium, plays every `VOCABULARY` entry through an
`OfflineAudioContext` - the game's real scheduling function - and measures:

- Peak amplitude inside a ceiling and above an audible floor.
- No discontinuity at onset or release: first and last samples zero, no
  sample-to-sample step over what the highest scheduled frequency at that
  amplitude could produce.
- Duration in range, spectral centroid low enough to count as soft.
- Everything at once, to see a burst limited rather than clipped.
- Every sound again with the toggle off, which must come back bit-silent.

A failure prints the measured number beside the bound. Adding a sound to
`VOCABULARY` is what measures it; an unlisted sound is not. `npm run audio` runs
the same render and draws `.art/audio/sheet.png`, a waveform per sound - the only
human review of a sound change, so put it in the pull request.

## What the tests cannot see

A green run is not evidence of these:

- **The artwork.** `npm run art:check` covers it; see
  [`art.md`](art.md).
- **Whether a sound is the right sound.** The checks prove soft, brief and
  distinct; only a person with a speaker can say more.
- **Any claim about behaviour under conditions nobody created.** Such a claim
  inherits the credibility of the measurements around it. All four of these were
  believed, written down, and wrong:
  - A failed chunk load could be retried. A browser will not re-fetch a failed
    dynamic import; found by cutting the network.
  - The game worked offline between sittings. The HTTP cache decides that, and
    it behaved identically before and after.
  - The safe-area rules did something. Headless Chrome reports every inset as
    `0px`, so a misspelt property would ship green.
  - A manifest was served correctly because its contents were right. It was
    served as `application/octet-stream`, which a browser rejects.

  The habit that catches all four: when you write a sentence about behaviour,
  create the conditions it describes and report what happened. `scripts/shot.mjs`
  is the only place the network is taken away, the viewport is not a desktop, and
  the insets are not zero.
