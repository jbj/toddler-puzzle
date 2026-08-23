# Keep assets and runtime simple

## Context

Animal Puzzle should be a small toy that starts quickly and has little that
can fail. Downloaded assets, network requests, and runtime dependencies all
add ways for a simple page to break.

## Decision

Do not add binary assets, runtime dependencies, or network requests. Art stays
hand-authored SVG in the repository, and sound is synthesised in the browser
with the Web Audio API. That gives the project enough expression without
shipping binary art or audio files.

## Consequence

There is nothing extra to download and nothing external to fail to load. The
bundle stays small, and the whole game remains easy to inspect.
