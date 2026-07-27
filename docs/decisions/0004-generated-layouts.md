# 0004. Generate layouts at stage start

## Context

Every puzzle is dealt fresh from `ANIMAL_IDS`. The animal in a given place is not
known until a stage starts, and different animals stand at different heights
inside the 240 by 240 art box.

A fixed set of hole coordinates would either ignore foot level or need to know
the random cast before it exists. The scene also needs to reflow by orientation
rather than letterbox a landscape board onto a portrait phone.

## Decision

Layouts are generated when a puzzle starts. Arrangement tables describe row
counts, ground lines, tray rows, and piece sizes; the dealt animals fill those
places on demand.

## Consequence

A hole's height can depend on the foot level of the animal dealt into it. The
same stage can use landscape and portrait arrangements that keep pieces large.

Tests must cover the arrangements across rotated animal lists, not just one
lucky deal.
