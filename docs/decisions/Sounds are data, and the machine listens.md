# Sounds are data, and the machine listens

## Context

`src/audio.ts` had four sounds: a pick-up, a snap, a return and a fanfare. Each
was a hand-written call to one `tone()` helper with its own numbers - a
frequency, a duration, a gain, a curve - tuned by ear once and then left alone.
For four sounds that is the right amount of structure.

The game then grew to thirty levels, six kinds of puzzle and six celebrations,
and the same snap came to serve five different physical events: a wooden animal
seating into its hole, a slice rejoining the animal it was cut from, a flat
polygon clicking onto its shadow, two jigsaw pieces meshing, and a shard
settling. A game a child plays every day cannot answer five different things
with one noise. Neither can thirty levels end on one fanfare, which is the same
argument the celebrations already won.

So the file had to go from four sounds to about two dozen. Written the way it
was, that is two dozen copies of the same six lines with different constants:
unreadable, and guaranteed to drift, because the only thing holding twenty-four
sounds together as one voice would be whoever typed the numbers remembering
what the other twenty-three did.

There is a second problem, and it is the harder one. **Nobody can hear a pull
request.** Not the agent writing it, which has no ears at all, and not the
person reviewing it in the morning, who will read a diff of numbers. Every other
kind of change in this project can be checked: the tests run the logic, the
screenshot run drives real pointers, and `npm run art` renders the animals so a
person can look at them. Sound had nothing. A change to `src/audio.ts` was
reviewed by trusting the author's ears, and the author had none.

## Decision

**Sounds are data, and there is one vocabulary underneath them.**

Every pitch in the game comes off one C major pentatonic ladder, read with
`note(degree)`. That is not decoration: it is why twenty-four sounds feel like
one game, and why there is no wrong note whatever order a toddler triggers them
in. The ladder generalises an instinct that was already in the code - the
bursting sounds had picked a pentatonic set for exactly this reason.

On top of the ladder there are three layers, all of them plain objects. A
**voice** is one oscillator and one envelope. A **phrase** is a list of voices
relative to its own start. **Gestures** - `run`, `chord`, `together`, `delayed` -
build phrases out of voices. Adding a sound now means writing a phrase; it does
not mean writing any audio code. One function, `schedule`, touches Web Audio,
and one function, `play`, is allowed to call it. That single gate is where the
sound toggle is checked, which is what makes "the toggle silences everything" a
property of the design rather than a promise renewed at every call site.

A kind's sound is keyed by `Record<PuzzleKindId, Phrase>` and a celebration's by
`Record<CelebrationId, Phrase>`, so a kind or a celebration with no sound is a
compile error. Nothing falls through to a default and then goes unnoticed for a
year.

**And the machine listens, because nobody else can.**

`npm run audio:check` bundles the module, serves it to headless Chromium - which
`npm run verify` already needed for the screenshot run - and plays every sound
through an `OfflineAudioContext`, using the game's own scheduling function
rather than a re-implementation of it. Then it measures the samples that come
back: peak amplitude inside a ceiling and above an audible floor; zero at the
first sample and the last, and no sample-to-sample step larger than the highest
scheduled frequency at that amplitude could produce, which is what a click *is*;
duration in range; spectral centroid low enough to count as soft. It plays
everything at once to see that a burst is limited rather than clipped, and then
plays everything again with the toggle off, which has to come back bit-silent.

What is measured is whatever `VOCABULARY` lists, and where a sound comes in
variants it lists the ends of the range rather than the first of them. That is
not tidiness. Written the other way, three phrases that climbed to three and a
half kilohertz - the fifth firework, the smallest balloon, the fireworks fanfare
- passed every check in this file, because the only variant anything rendered
was the lowest one. Now the ceiling is enforced in the voice factory
(`MAX_PITCH_HZ`, C7, the highest note the game has ever played) and the
brightest variant of everything is on the sheet.

`npm run audio` draws the same renders as a sheet of labelled waveforms in
`.art/audio/sheet.png`, the way `npm run art` draws the animals. Each is
labelled with what sets it off and the notes it plays, because the person
opening that PNG wants to answer "does this sound like the same game" and a wall
of unlabelled envelopes will not tell them. It is built out of the render that
had to exist anyway and the rasteriser the art review already needs, so it adds
no dependency; if that rasteriser is missing it says which package to install
and leaves the SVG, rather than half-succeeding, because this sheet is the whole
review surface.

## Consequence

Twenty-four sounds fit in a file smaller than four sounds and a helper would
have been, and the twenty-fifth is three lines of data. The character cannot
drift by accident, because there are no loose constants left to drift: the
pitches are degrees on one ladder and the envelopes come from one factory that
clamps the gain and refuses an attack short enough to click.

"Nothing harsh" is now a check. It used to be a hope with a paragraph of prose
behind it. The bounds are deliberately wide - they exist to catch a sound that
is wrong by an order of magnitude, not to freeze the current numbers - and a
failure prints the measured value next to the bound it broke, so the first
response to a red check is information rather than a bisect.

Two costs, taken knowingly. `npm run verify` now launches Chromium twice, which
is another minute and another thing that can behave differently on a CI machine
than on a laptop. And the module carries one seam it would not otherwise have -
`useAudioContext`, which lets a test or the offline render supply the context.
The game never calls it. It is the price of being able to render the real
scheduler rather than a copy of it, and rendering a copy would have checked the
copy.

What none of this can say is whether a sound is the *right* sound for the
moment it answers. A machine can hear that the parade fanfare is soft, brief,
distinct from the other five and free of clicks. It cannot hear that it sounds
like a parade. That judgement still needs a person and a speaker, and a pull
request that changes a sound should say plainly which of its sounds have had one
and which have not.
