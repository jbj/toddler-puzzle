# Let the author attach the screenshots

## Context

Reviewing a change to this puzzle means looking at the puzzle: a passing check
says the drags still snap, not that the result still looks like something a
two-year-old wants to touch. So a pull request needs pictures, and CI could in
principle produce and publish them automatically, so nobody has to trust the
author to generate them honestly.

Publishing an image into a pull request comment needs a job with
`contents: write`, and that job would have to process a screenshot artifact
built by an earlier job that ran the pull request's own code - code from
anyone who opens a pull request. Extracting an artifact is not safe against a
maliciously named entry inside it (path traversal writing outside the
intended directory), and a write-privileged job that runs any further command
against a checkout altered that way can be turned into arbitrary code
execution holding a token able to write to the repository. Closing that hole
reliably takes substantial security-critical shell, for what is ultimately a
convenience in a project maintained by one person.

## Decision

CI verifies and stops there, holding `contents: read` and nothing else. The
screenshot run's output stays an artifact, which costs no extra privilege.

The author runs `npm run verify` and attaches the run's contact sheet,
`.art/shots/contact-sheet.png`, to the pull request by hand.
`scripts/shot-sheet.mjs` packs every screenshot into that one image, because
attaching many separate files is enough friction that people attach none.

## Consequences

Nothing verifies that an attached image came from the branch. An author can
attach a stale or doctored run, and a reviewer will not notice from the image
alone. That loss is accepted deliberately: it is a smaller risk than a
write-privileged job processing input from arbitrary contributors, and
between "a contributor lies about a screenshot" and "a contributor executes
code with a write token", the first is both less likely and far less severe.

The artifact keeps a check available. A reviewer who doubts an image can open
the CI run and compare against the screenshots it produced from the branch
itself. Rare enough that it should not be automated, available when it
matters.

[`docs/code.md`](../code.md) states the obligation plainly for agents,
including the two ways of getting it wrong that an agent would not otherwise
think of: attaching images from before the last commit, and committing the
images to the repository to avoid the upload.

Do not restore a publishing pipeline without reading this first. It looks
like an obvious gap, it is not, and the fix for the obvious gap is the
vulnerability.
