# Decision records

A record here explains a choice that is easy to mistake for an oversight and
"fix". Keep it lightweight: context, decision, consequence, in a few paragraphs
and with no ceremony.

These are the **secondary** layer of this project's documentation. The primary
layer is the instruction files indexed by
[`.github/copilot-instructions.md`](../../.github/copilot-instructions.md):
those say what the rule is, in the place you will be working. A record says why,
at more length than a rule can carry. Read one when you are about to argue with
a rule, or when you are writing a rule that needs an argument behind it.

## Naming

**The filename is a short sentence saying what was decided**, with spaces, in
the same words as the record's `#` heading - "A hint points at both ends",
"Keep the game moving forward". Long is fine. No dates, no numbers, no slugs.

Link one from Markdown with the destination in angle brackets, because the name
has spaces in it:

    [A hint points at both ends](<../../docs/decisions/A hint points at both ends.md>)

From a source comment or a workflow, write the path as plain text:
`See docs/decisions/A hint points at both ends.md.`

## There is deliberately no index

The directory listing is the index, which is why the names have to carry their
own summary. A table here would be a file every pull request has to edit, and
therefore the one place two of them reliably collide.

## They are living documents

Revise a record in place when the reasoning moves on, and rename the file when
the decision itself changes - the filename is the claim, so a record that no
longer says what its name says is worse than no record. What matters is that the
argument in front of a reader is the one the project is actually running on.
