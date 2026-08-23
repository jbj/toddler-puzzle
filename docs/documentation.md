# Documentation

Documentation preserves knowledge that code does not make obvious. It is not a
second copy of the repository.

## Layers

| Level | Holds |
| --- | --- |
| `README.md` | A stable introduction, run entry point, and route to the working agreement |
| `.github/copilot-instructions.md` | The brief every agent receives and the map to task-specific detail |
| `docs/*.md` | Deliberately selected principles, contracts, and complete task workflows |
| `docs/decisions/` | On-demand rationale for current choices that look safe to undo but are not |

`AGENTS.md` is the portable entry pointer to the working agreement.
`.github/rulesets/README.md` has one narrow responsibility: describe repository
settings that live outside the codebase.

## What earns a place

- **One home per rule.** Put a rule in the most specific topic that owns it and
  link from anywhere else that needs to route a reader there.
- **Write the current principle in present tense.** Do not keep project history,
  issue narrative, migration stories, before-and-after descriptions, superseded
  behavior, benchmark diaries, or explanations of how the current state was
  reached. Git and issue history already preserve that.
- **Do not write what one code lookup says better.** Do not copy level numbers,
  catalogue contents, current counts, configuration values, source maps, type
  signatures, exported symbols, test inventories, or a function's steps. Point
  to the canonical table, constant, module, command, or check instead.
- **Keep code-owned values in code.** State the qualitative requirement and name
  its source of truth. A value appearing in both prose and code is two values
  waiting to disagree.
- **Keep complete task procedures when sequence is the knowledge.** An authoring
  or release checklist may name every file, generated output, visual judgment,
  and validating command needed to finish safely. Remove explanation that merely
  narrates the implementation traversed by those steps.
- **Keep rationale only when it protects a surprising current constraint.** A
  brief reason may sit beside a rule. Longer rationale belongs in one decision
  record and should be read only when that decision is in question.
- **Prefer deletion to archival prose.** A record with no current claim is
  removed. If two records now explain one decision, merge the useful rationale
  into one and remove the other.

## Routing agents to detail

Nothing under `docs/` is loaded automatically. The root brief names universal
routes and maps the remaining topics.

When a source file is the chokepoint for a responsibility that would otherwise
be easy to miss, use this exact sentence in its native comment syntax:

```text
Before changing this file, read docs/layout.md.
```

Route from the file a change must pass through, not every file it may touch.
Do not repeat routes already supplied by the root brief. `npm run docs:check`
validates the local directives.

## Decision records

- The filename and `#` heading are the same short sentence stating the current
  decision. Use spaces; do not add dates or sequence numbers.
- A record explains one decision. It is not a changelog, incident report,
  implementation guide, or inventory.
- Keep enough rationale to stop a reasonable maintainer from undoing the
  decision as an apparent cleanup. Remove everything else.
- Rename a record when its current claim changes, updating its citations. Delete
  it when no current claim remains.
- There is no maintained index. The directory listing is the index.

## Context budgets

`npm run docs:check` applies a byte ceiling to each documentation level: the
always-loaded brief, selected topic guides, and on-demand decision records. The
ceilings reflect how much unrelated context each level may consume.

When a file reaches its ceiling:

1. Delete code-owned detail and repeated rules.
2. Remove history and implementation narration.
3. Move extended rationale into a decision record.
4. Split genuinely independent responsibilities into focused topics.

Raise a ceiling only when the document level has gained a real responsibility,
not to avoid editing.

## House style

- Prefer bullets, tables, and short headings to long prose.
- Bold the rule, not its explanation.
- Hand-wrap Markdown at about 80 columns.
- Use `-` for a dash in prose.
- Put link targets containing spaces in angle brackets.

## Before opening a pull request

Run `npm run docs:check` after changing links, filenames, routes, or structure.
`npm run verify` remains the definition of done.
