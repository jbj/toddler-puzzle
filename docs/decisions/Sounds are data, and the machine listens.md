# Sounds are data, and the machine listens

Every sound the game makes is data, not code. A **voice** is one oscillator
and one envelope. A **phrase** is a list of voices relative to its own
start. **Gestures** - `run`, `chord`, `together`, `delayed` - build phrases
out of voices. Adding a sound means writing a phrase; it does not mean
writing audio code. One function, `schedule`, touches Web Audio, and one
function, `play`, is allowed to call it. That single gate is where the
sound toggle is checked, which is what makes "the toggle silences
everything" a property of the design rather than a promise renewed at every
call site.

The game answers many different physical events - a piece seating into its
hole, a slice rejoining the animal it came from, a shape clicking onto its
shadow, two pieces meshing, a shard settling, a level's own celebration -
and cannot answer them with hand-tuned numbers pasted at each call site:
unreadable, and guaranteed to drift, because the only thing holding many
sounds together as one voice would be whoever wrote the numbers
remembering what every other sound did.

Every pitch in the game comes off one C major pentatonic ladder, read with
`note(degree)`. That is not decoration: it is why every sound feels like
one game, and why there is no wrong note whatever order a toddler triggers
them in.

A kind's sound is keyed by `Record<PuzzleKindId, Phrase>` and a
celebration's by `Record<CelebrationId, Phrase>`, so a kind or a
celebration with no sound is a compile error. Nothing falls through to a
default and then goes unnoticed.

## Nobody can hear a pull request

Every other kind of change in this project can be checked: the tests run
the logic, the screenshot run drives real pointers, and `npm run art`
renders the animals so a person can look at them. Sound has none of that by
default - a change to `src/audio.ts` reviewed only by the author's ears is
reviewed by nobody, because the code writing the sound has no ears at all.

`npm run audio:check` bundles the module, serves it to headless Chromium -
which `npm run verify` already needs for the screenshot run - and plays
every sound through an `OfflineAudioContext`, using the game's own
scheduling function rather than a re-implementation of it. It then
measures the samples that come back: peak amplitude inside a ceiling and
above an audible floor; zero at the first sample and the last, and no
sample-to-sample step larger than the highest scheduled frequency at that
amplitude could produce, which is what a click *is*; duration in range;
spectral centroid low enough to count as soft. It plays everything at once
to see that a burst is limited rather than clipped, and then plays
everything again with the toggle off, which has to come back bit-silent.

What is measured is whatever `VOCABULARY` lists, and where a sound comes in
variants it lists the ends of the range rather than just the first,
because a check that only ever renders the mildest variant of a sound
cannot catch a brighter one running past the ceiling. The ceiling itself is
enforced in the voice factory (`MAX_PITCH_HZ`), not left to be reasoned
about per sound.

`npm run audio` draws the same renders as a sheet of labelled waveforms in
`.art/audio/sheet.png`, the way `npm run art` draws the animals. Each is
labelled with what sets it off and the notes it plays, because the person
opening that PNG wants to answer "does this sound like the same game" and a
wall of unlabelled envelopes will not tell them. If the rasteriser it needs
is missing, the script says which package to install and leaves the SVG,
rather than half-succeeding, because this sheet is the whole review
surface.

## Consequence

The character cannot drift by accident, because there are no loose
constants left to drift: the pitches are degrees on one ladder and the
envelopes come from one factory that clamps the gain and refuses an attack
short enough to click.

"Nothing harsh" is a check rather than a hope. The bounds are deliberately
wide - they exist to catch a sound that is wrong by an order of magnitude,
not to freeze the current numbers - and a failure prints the measured value
next to the bound it broke, so the first response to a red check is
information rather than a bisect.

Two costs, taken knowingly. `npm run verify` launches Chromium twice for
it, which is real time and another thing that can behave differently on a
CI machine than on a laptop. And the module carries one seam it would not
otherwise have - `useAudioContext`, which lets a test or the offline render
supply the context. The game never calls it. It is the price of being able
to render the real scheduler rather than a copy of it, and rendering a
copy would have checked the copy.

What none of this can say is whether a sound is the *right* sound for the
moment it answers. A machine can hear that a celebration's fanfare is soft,
brief, distinct from the other sounds and free of clicks. It cannot hear
that it sounds like a celebration. That judgement still needs a person and
a speaker, and a pull request that changes a sound should say plainly
which of its sounds have had one and which have not.
