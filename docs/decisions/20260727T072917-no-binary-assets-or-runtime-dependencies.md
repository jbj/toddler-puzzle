# 20260727T072917. Keep assets and runtime simple

## Context

Animal Puzzle should be a small toy that starts quickly and has little that can
fail. Downloaded assets, network requests, and runtime packages all add ways for
a simple page to break.

The current animals are hand-authored SVG, and the sounds are synthesised with
the Web Audio API. That gives the project enough expression without shipping
binary art or audio files.

## Decision

Do not add binary assets, runtime dependencies, or network requests. Keep art as
SVG in the repository and sound generated in the browser.

## Consequence

There is nothing extra to download and nothing external to fail to load. The
bundle stays small, around 24 kB, and the full game remains easy to inspect.
