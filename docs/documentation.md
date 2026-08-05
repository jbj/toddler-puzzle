# Documentation

Four layers, each with one job. Put a thing in the layer that owns it, and link
rather than repeat.

| Layer | File | Holds |
| --- | --- | --- |
| Introduction | `README.md` | What the game is, how to run it, where the documentation is. Minimal and stable. |
| Brief and map | `.github/copilot-instructions.md` | The small safety brief every agent receives, and routes to detail selected for the task. |
| Primary | `docs/*.md` | Topic rules. An agent uses its judgement to read the files its task needs; none arrives automatically. |
| Secondary | `docs/decisions/` | Why a rule is the way it is, at more length than the rule can carry. |

`.github/rulesets/README.md` is a fifth, narrow thing: what the branch
protection on `main` is set to, because that lives in the GitHub UI and nowhere
in the repository.

## Where a thing goes

- **One home per rule.** If two topic files would both be a reasonable home, put
  it in the more specific one and link from the other.
- **A topic file states the policy.** The argument for it goes in a decision
  record. Keep a clause of "why" only where the rule reads as a bug without one.
- **The root brief is not a compressed copy of every topic.** Keep only the
  minimum safety rails an agent needs before it has chosen what detail to read.
- **Do not write what the code says better.** No catalogues of what individual
  assertions check, no restatements of a type signature, no narration of a
  function's steps.
- **Do not put mechanism in `README.md`.** If a paragraph explains how something
  works, it belongs in a topic file or a decision record.
- **Where the reasoning being cut is long, worth keeping, and has no record,
  write the record** rather than losing it.

## Routing agents to detail

Nothing under `docs/` is loaded automatically. The always-loaded root brief
names the universal routes: code, Markdown, tests, art and player-visible
behaviour. It also gives a table for choosing the remaining topics.

When a source file has a specific responsibility that would be easy to miss,
put this exact sentence in its native comment syntax:

```text
Before changing this file, read docs/layout.md.
```

Prefer the file a change has to pass through over the file it starts in. A new
kind of puzzle has no file yet, so no directive can be waiting in it - but it
cannot be played without being registered in `src/kinds/registry.ts`, which does
carry one. Routing the chokepoint covers the files that do not exist yet, which
is why a handful of directives is enough.

A file can carry more than one such sentence. Do not repeat universal routes in
every file: `docs/code.md`, `docs/documentation.md`, `docs/tests.md` and
`docs/art.md` stay in the root brief, which also covers formats such as JSON
that cannot contain comments. `npm run docs:check` validates the local
directives that do exist and requires every locally routed topic to be used.

## Size

`npm run docs:check` fails if a topic file, or the root brief, is over its byte
ceiling. Bytes stand in for tokens: the root is spent on every model call, and a
topic should stay focused enough to read deliberately without crowding out the
work.

Ways under the ceiling, in order of preference:

1. Move the argument into a decision record and link it.
2. Delete what the code already says.
3. Turn a list of prose paragraphs into a table.
4. Split a topic when it has gained two independent responsibilities, and add
   both files to the root map.

Raising a ceiling is allowed when a file has genuinely grown a new
responsibility. Raising it quietly, to avoid the four steps above, is not.

## Decision records

- **The filename is a short sentence saying what was decided**, ending in `.md`.
  Spaces are fine and a long name is fine. No dates, no numbers, no `:` or `/`.

  ```text
  docs/decisions/A chapter is warmed before it is needed, not fetched when it is.md
  ```

- The `#` heading repeats that sentence.
- **There is no index.** The directory listing is the index. A table every pull
  request has to edit is a merge conflict on every pull request that adds a
  record, which is what the old one was.
- **They are living documents.** Revise a record in place when the reasoning
  changes or improves; rename the file when the decision itself changes. There
  is no superseding-record ceremony.
- Cite one by path from anywhere: from Markdown as a link, from a source comment
  or a workflow as a bare path. `npm run docs:check` fails on a citation that no
  longer resolves, so a rename is safe as long as the check is run.

## House style

- **Bullets, tables and short headings over prose.** A paragraph is for the one
  case where the rule needs a sentence of argument.
- **Bold the rule, not the explanation**, when a bullet carries both.
- Markdown is in `.prettierignore`. **Hand-wrap at about 80 columns.**
- A link target containing a space needs angle brackets. The target cannot be
  wrapped across lines; the link text can.

  ```markdown
  [Every cut is made once](<decisions/Every cut is made once.md>)
  ```

- Topic files start with their `#` heading, not special front matter. The root
  map and checked source comments provide routing without implying that a tool
  loads anything automatically.
- Use `-` for a dash in prose, not an em dash.

## Before opening a pull request

`npm run docs:check` runs inside `npm run verify`, but it is fast on its own and
worth running as soon as a link, directive or filename changes.
