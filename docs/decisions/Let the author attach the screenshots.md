# Let the author attach the screenshots

## Context

Reviewing a change to this puzzle means looking at the puzzle. A green check
says the drags still snap; it cannot say whether the result still looks like
something a two-year-old wants to touch. So a pull request needs pictures, and
the question is who produces them.

CI did it first. The verification job ran `npm run shot`, uploaded the
screenshots as an artifact, and a second job pushed them to an orphan branch and
posted them into the pull request as a comment. The appeal was that the images
were then produced by machine from the branch's own code, so nobody had to trust
the author to generate them honestly.

The cost was the second job. GitHub cannot render an artifact zip inline, so
publishing images to a comment means writing them somewhere with a raw URL,
which means a job holding `contents: write`. That job consumed an artifact built
by a job that had just run pull-request code — code from anyone who opens a pull
request. A review found the predictable consequence: `actions/download-artifact`
extracts without protecting against path traversal, so an entry named
`../../../../.gitconfig` landed in the runner's home directory, and the next
thing that job ran was `git`. A planted `url.insteadOf = ext::sh -c ...` turns
that into arbitrary execution holding a token that can write to the repository.

That hole was closed — REST API download, `unzip -j`, a filename allowlist, size
and count caps, magic-byte checks — and closing it took roughly two hundred
lines of workflow. Two hundred lines of security-critical shell, guarding a
convenience, in a toddler's puzzle game maintained by one person.

## Decision

Delete the publishing pipeline. CI verifies and stops there; it holds
`contents: read` and nothing else. The screenshots stay as an artifact, which
costs no extra privilege.

The author runs `npm run verify` and drags `.art/shots/contact-sheet.png` into
the pull request. `scripts/shot-sheet.mjs` packs the run's screenshots into
that one image, because attaching fifteen files is enough friction to make people
attach none.

## Consequences

Nothing verifies that the attached images came from the branch. An author can
attach a stale run, or a doctored one, and a reviewer will not notice. That is a
real loss and it is accepted deliberately: the risk it replaces was a
write-privileged job processing input from arbitrary contributors, and between
"a contributor lies about a screenshot" and "a contributor executes code with a
write token", the first is both less likely and far less severe.

The artifact keeps a check available. A reviewer who doubts an image can open
the run and compare against screenshots CI produced from the branch itself. Rare
enough that it should not be automated, available when it matters.

[`.github/instructions/code.instructions.md`](../../.github/instructions/code.instructions.md)
states the obligation plainly for agents, including the two ways of
getting it wrong that an agent would not otherwise think of: attaching images
from before the last commit, and committing the images to the repository to
avoid the upload.

Do not restore the pipeline without reading this first. It looks like an obvious
gap, it is not, and the fix for the obvious gap is the vulnerability.
