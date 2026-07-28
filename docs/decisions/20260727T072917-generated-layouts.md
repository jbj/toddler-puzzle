# 20260727T072917. Generate layouts at stage start

## Context

Every puzzle is dealt fresh from `ANIMAL_IDS`. The animal in a given place is not
known until a stage starts, and different animals stand at different heights
inside the 240 by 240 art box.

A fixed set of hole coordinates would either ignore foot level or need to know
the random cast before it exists. The scene also needs to reflow by orientation
rather than letterbox a landscape board onto a portrait phone.

## Decision

Layouts are generated when a puzzle starts, from the cast that was dealt rather
than from a fixed set of coordinates. (Arrangement tables described the row
counts, ground lines, tray rows and piece sizes to generate them into;
[20260728T115938](20260728T115938-composed-layouts.md) replaced the tables with a composition that
works for any piece count, and the rest of this record still holds.)

## Consequence

A hole's height can depend on the foot level of the animal dealt into it. The
same stage can be composed for landscape and for portrait in ways that keep the
pieces large.

Tests must cover the layouts across many casts, not just one lucky deal.
