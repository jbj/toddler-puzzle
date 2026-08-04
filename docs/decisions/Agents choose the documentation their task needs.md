# Agents choose the documentation their task needs

## Context

The repository put topic rules in `.github/instructions/` and used `applyTo`
front matter to say which source paths each file governed. The root brief said
those files would attach themselves when an agent touched a matching path.

That was not how the Copilot desktop app and CLI behaved. Across 20 recent
sessions and all 104 system-prompt builds in them, exactly two custom instruction
blocks appeared every time. One was the root brief. The other was the product
topic, whose lack of `applyTo` caused its entire 13.9 kB to be included. None of
the nine files with `applyTo` was injected, including in work squarely covered
by its glob.

The mismatch had two costs. Agents could wrongly assume that relevant rules were
already in context, while the full product file consumed about 15 million input
tokens over 4,293 calls whether a task needed it or not. Moving every detail into
the root brief would keep that cost and lose the useful topic boundaries.

## Decision

`.github/copilot-instructions.md` is the one always-loaded brief. It contains
the toddler-first tie-breaker, a compact set of the product rules most dangerous
to violate without context, and a map to topic documents in `docs/`.

An agent uses its judgement to read the topic documents its task needs. Nothing
under `docs/` claims to load itself. Universal routes - code, Markdown, tests,
art and player-visible behaviour - stay in the root brief. Specific source
files carry a checked native-language comment such as:

```text
Before changing this file, read docs/layout.md.
```

The comments cover the puzzle-kind, cutting, layout, navigation and feel
boundaries where a local reminder earns its space. Universal comments are not
repeated through whole directories, and formats such as JSON are not forced to
carry metadata they cannot express. `npm run docs:check` validates every local
directive and requires each locally routed topic to be represented.

## Consequences

The full product invariants are no longer guaranteed context on every call.
That is a real loss of protection. The root brief keeps the highest-risk subset
and explicitly directs every player-visible change to `docs/product.md`; the
rest of the product detail is paid for only when it can affect the work.

The repository no longer depends on a loading mechanism the client does not
implement. A source rename carries its nearby route with it, a topic rename
breaks the documentation check, and the topic boundaries remain available to
humans as well as agents.
