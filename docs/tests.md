# Tests

## Test promises, not deals

- **The deal is random.** Never assume one cast, one order, or one animal in a
  particular place.
- **Assert the invariant, not a snapshot.** A layout test asks whether pieces
  stay grabbable, targets stay reachable, and tray cells stay separate; it does
  not preserve coordinates from one deal.
- **Exercise varied geometry.** Real animals alone can hide assumptions because
  their boxes share useful proportions. Reuse the repository's odd-shape,
  clipped-piece, and rotated-cast helpers when a property depends on bounds,
  anchors, or ordering.
- **Rotate representative pieces through meaningful positions.** One seed can
  hide a shape-specific failure.
- **Use a seed to reproduce a failure, not to redefine the promise around that
  seed.**
- **Load deferred kinds through the existing test helper** before asking the
  strict synchronous registry for them.

The current property tables and cast generators live beside the layout tests.
Add a new promise there rather than copying their inventory into this guide.

## A check that inspects nothing passes

Any check that discovers the set it iterates must prove discovery succeeded.

- Assert that the discovered set is not empty.
- Include what was discovered in a failure message.
- Cross-check the size or identity through a second source when practical.
- Make the check fail deliberately once and read the failure before trusting it.

This applies to DOM queries, globs, parsed source tables, generated catalogues,
and sampled browser coverage. A broken parser that returns a smaller world can
otherwise agree perfectly with every assertion made against it.

## Sample coverage

Expensive visual and browser checks should exercise a deliberate sample, not
repeat every table row. Guard that sample against the canonical tables so a new
kind, progression boundary, or celebration cannot arrive uncovered. See
[Guard the sample against the table, rather than exercise every row](<decisions/Guard the sample against the table, rather than exercise every row.md>).

The coverage guard must also prove that its source parser saw a credible set.
Sampling everything from a broken parse is still no coverage.

## Choose the right evidence

- Pure rules and state machines belong in unit tests with clocks, storage, DOM,
  audio, and randomness injected where needed.
- Rendering, pointer wiring, browser lifecycle, loading failure, and responsive
  behavior need the existing browser harness.
- Artwork legality belongs to the art check; visual quality still needs a
  person looking at the render.
- Audio structure and signal bounds belong to the audio checks; whether a sound
  suits the moment still needs a person listening.
- A claim about a device or network condition needs a harness that actually
  creates that condition.

Read the relevant test or script for its current assertions and invocation.
Per-suite and per-shot catalogues are intentionally not duplicated here.

## Before calling a test change complete

1. Run the narrow existing check that covers the changed behavior.
2. Demonstrate that a meaningful fault makes the check fail.
3. Run `npm run verify`.
