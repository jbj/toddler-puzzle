---
name: "Documentation"
description: "The four layers of documentation, what belongs in each, how a decision record is named, and the house style."
applyTo: "**/*.md"
---

# Documentation

Four layers, each with one job. Put a thing in the layer that owns it, and link
rather than repeat.

| Layer | File | Holds |
| --- | --- | --- |
| Introduction | `README.md` | What the game is, how to run it, where the documentation is. Minimal and stable. |
| Index | `.github/copilot-instructions.md` | One screen: the three things true of every change, and a row per instructions file. |
| Primary | `.github/instructions/` | The rules, attached by `applyTo` to the files they govern. |
| Secondary | `docs/decisions/` | Why a rule is the way it is, at more length than a rule can carry. |

`.github/rulesets/README.md` is a fifth, narrow thing: what the branch
protection on `main` is set to, because that lives in the GitHub UI and nowhere
in the repository.

## Where a thing goes

- **One home per rule.** If two instructions files would both be a reasonable
  home, put it in the more specific one and link from the other.
- **An instructions file states the policy.** The argument for it goes in a
  decision record. Keep a clause of "why" only where the rule reads as a bug
  without one.
- **Do not write what the code says better.** No catalogues of what individual
  assertions check, no restatements of a type signature, no narration of a
  function's steps.
- **Do not put mechanism in `README.md`.** If a paragraph explains how something
  works, it belongs in an instructions file or a decision record.
- **Where the reasoning being cut is long, worth keeping, and has no record, write
  the record** rather than losing it.

## Size

`npm run docs:check` fails if an instructions file, or the index, is over its
byte ceiling. Bytes stand in for tokens: every one of them is spent from a
coding agent's context window before the work starts.

Ways under the ceiling, in order of preference:

1. Move the argument into a decision record and link it.
2. Delete what the code already says.
3. Turn a list of prose paragraphs into a table.
4. Split the file along its `applyTo`, into two files that govern disjoint sets
   of source files. Add a row to the index for the new one.

Raising a ceiling is allowed when a file has genuinely grown a new
responsibility. Raising it quietly, to avoid the four steps above, is not.

## Decision records

- **The filename is a short sentence saying what was decided**, ending in `.md`.
  Spaces are fine and a long name is fine. No dates, no numbers, no `:` or `/`.

  ```text
  docs/decisions/Ask a touch level for a handful, and let the child out anyway.md
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
  [Every cut is made once](<../../docs/decisions/Every cut is made once.md>)
  ```

- An instructions file starts with front matter carrying `name`, `description`
  and, unless it applies everywhere, `applyTo`. Every glob in an `applyTo` must
  match a path that exists - `docs:check` fails on one that matches nothing, so a
  file renamed out from under an `applyTo` is caught.
- Use `-` for a dash in prose, not an em dash.

## Before opening a pull request

`npm run docs:check` runs inside `npm run verify`, but it is fast on its own and
worth running as soon as a link or a filename changes.
