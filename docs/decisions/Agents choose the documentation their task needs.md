# Agents choose the documentation their task needs

Loading every project rule into every agent call spends context on unrelated
work. Relying on client-specific path metadata has the opposite problem: it can
silently fail to load a rule at the point it matters.

`.github/copilot-instructions.md` is the small always-loaded brief. It carries
the highest-risk guardrails and routes readers to focused topic guides. An agent
then uses judgment to read only the topics its task needs.

When a responsibility has a source chokepoint that would otherwise be easy to
miss, that source carries the canonical local directive described in
[`documentation.md`](../documentation.md). The documentation check validates
those routes and the root map.

This makes selection explicit and portable: the repository does not assume an
undocumented client loading mechanism, while task-specific context remains
available to agents and human contributors.
