# 20260729T004500. Check silhouettes for distinctness at a glance

## Context

A two-year-old matches the outline before the detail. The instruction to draw
each animal distinct from the others has been in the repository since the first
ten were drawn, and it was enforced the only way it could be: by a person
looking at `.art/contact-sheet.png` and comparing ten silhouettes.

That stops working now. The cast is grouped into themes and a level deals a
random subset of one, so nobody will notice that a newly drawn sheep and the
existing rabbit read as the same round blob - and the deal *will* eventually put
them on the same board. The failure is silent, intermittent, and lands on the
one user who cannot say what is wrong.

So the rule needs a machine behind it. The question is which measure, and what
number.

## Decision

`npm run art:check` renders every silhouette, shrinks each to a **48x48 square**
inside the shared 240x240 art box, and scores each within-theme pair by
**intersection over union** - the shared area divided by the area either one
covers. A pair over **0.70** fails, naming both animals and the score.

Three choices are worth spelling out.

**Compared in the art box, with no alignment step.** Both animals are authored
in the same 240x240 box, every piece of a level is drawn to one scale, and a
tray slot holds that box. So two animals overlap in this measure exactly as much
as they overlap in the tray. Aligning by bounding box or normalising each shape
to fill the frame would compare pairs the game never shows, and would call a
small animal and a large one identical when a child can see at once that they
are not.

**48 pixels, which is coarser than the game draws.** A tray piece on a six-piece
board is a few times that. The measure is deliberately below played size,
because a glance is below played size: at 48 pixels an ear tip, a notch and a
tail are already gone, and what survives is the gross shape a toddler actually
matches on. The `.art/check/*-glance.png` files are what the check compares, and
every animal is still recognisable in them - which is the sign the size is
coarse rather than destructive.

**0.70, from the cast rather than from taste.** The ten animals the game shipped
with had all been judged distinct by eye, so they are the calibration set. Their
scores run from 27% (crab and giraffe) to 68% (frog and penguin), with the
closest within-theme pair at 65% (fish and turtle). 70% is therefore the first
score no accepted pair reaches: a new animal fails only by being closer to
something than any pair the game already deals. Not a round number chosen for
comfort - run `ART_SIMILARITY_REPORT=1 npm run art:check` to print every pair,
most alike first, and see where the limit sits.

## Consequence

Six animals were drawn against this check the day it was written (cow, pig,
whale, octopus, monkey, parrot), and two of them were redrawn *because of* it:
the octopus first came out as an upright bell that scored 76% against the
penguin, and the cow 71% against the rabbit. Both were fixed by changing mass
rather than marks - the octopus splayed wide and low, the cow put on longer,
thinner legs. With sixteen animals the worst within-theme pair is 68%
(octopus and turtle), so the limit is doing real work with little room to spare;
the next animal into the sea will have to be shaped deliberately.

The check is scoped to a theme, not to the whole cast, because a theme is what a
level deals from. Two exceptions are worth knowing:

- **Levels 1, 3 and 5 name no theme** and deal from everything. They are the
  first-touches levels: one to three pieces, the largest in the game and the
  most forgiving. Two similar outlines cost least there, and demanding
  distinctness across every pair in the cast would tighten the constraint from
  a handful of pairs to hundreds and stop the cast growing at all.
- **A themed level short of animals tops up from the rest of the cast**
  (`dealPieces`), which mixes themes. That path exists so a half-drawn theme
  degrades instead of breaking, and `tests/levels.test.ts` asserts that no level
  of the thirty needs it. In a green build it is never taken.

The measure is crude on purpose, and it does not replace looking: it cannot tell
a good duck from a bad one, and it has no opinion on whether the eyes are on
straight. What it can do is refuse the one mistake that a human reviewer of a
growing cast reliably makes - shipping the second animal of a shape that was
already there.

When it fails, the answer is to redraw one of the two so its outline says
something the other's does not - a different posture, a different profile, a
different proportion - or to move one of them to another theme. Raising the
limit is not an answer: it is calibrated on art that was accepted, so moving it
means accepting art that is closer than any of that.
