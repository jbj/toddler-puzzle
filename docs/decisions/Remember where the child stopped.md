# Remember where the child stopped

The game remembers which level a child is on, because a two-year-old plays
in short sessions and cannot be expected to press back through everything
already played to reach it.

**Persistence must never prevent play.** Reaching for storage, reading a
record, parsing it, or writing to it can all fail - a private browsing
mode, a full disk, a record left by a different version of the game - and
none of those failures is shown to anyone or treated as an error. Any of
them simply leaves the game running from memory, exactly as if nothing had
ever been stored. There is no message, because the person holding the
device cannot read one, and the game is not diminished by forgetting.

**A read and a write fail independently.** Storage that can be read but no
longer written still hands back what was there, so a device that has
stopped saving does not also stop remembering what it already saved; only
a write that is refused marks the record as one that will not be kept, and
once marked it stays that way - a device cannot be trusted to keep the next
record just because it kept a past one.

**Invalid progress returns to the start of the ramp, never to a guess.** A
stored record the game no longer recognises, or a level outside what the
game currently offers, is treated as no record at all rather than clamped
to the nearest thing that might work: starting over is a bad day, but
landing on a board that cannot be built, or on the hardest level in the
game, is a broken toy.

**Development navigation does not overwrite a child's progress.** Loading
the game directly at a chosen level, for testing or review, plays that
level without recording it as where the child stopped; only ordinary play
that arrives at a level moves the remembered place.

**Clearing progress is an adult decision, not a play-surface one.** The
control that resets a child's remembered level lives behind the grown-up
panel, never beside the board, and never touches the settings a grown-up
has chosen.
