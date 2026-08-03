# Require no approving review on `main`

## Context

The `main` ruleset asked for one approving review. The reasoning written down
at the time was that a solo maintainer cannot approve their own pull request,
so the admin bypass covers hand-written fixes, while agent-authored pull
requests come from a different author and therefore still need a real approval.

The second half of that turned out to be false. Work done by Copilot locally is
committed and pushed by the maintainer, so the pull request is authored by the
maintainer like any other. The rule could not tell the two cases apart, and the
only person able to approve was the person who opened it. So every pull request
ended the same way: the maintainer clicking "merge without waiting for
requirements".

A rule that is overridden every single time is not a control. It teaches the one
person it applies to that the override button is part of the normal routine,
which is exactly the habit that makes a bypass dangerous on the day it matters.

## Decision

Set `required_approving_review_count` to 0 in `.github/rulesets/main.json`.

Everything else stays: changes still arrive through a pull request, `Verify`
still has to pass, Copilot still reviews every pull request including drafts and
again on each push, `main` still cannot be deleted or force-pushed, and an
approval that is given is still dismissed by a later push. The admin bypass
stays too, but goes back to being an exception rather than a daily step.

`.github/CODEOWNERS` also stays. It requests the maintainer's review
automatically, which is useful as a prompt; `require_code_owner_review` is off,
so it does not block.

## Consequences

Nothing human has to approve a change before it reaches `main`. For a repository
with one maintainer that is an honest description of what was already happening,
not a new hole: the approval never came from a second pair of eyes, because
there was not a second pair of eyes.

What guards the branch is now mechanical, and that is the part worth keeping
strict: `npm run verify` in CI, the Copilot review, and the screenshots the
author attaches ([Let the author attach the
screenshots](<Let the author attach the screenshots.md>)). If a second
maintainer ever joins, restore the count to 1 - at that point the rule would
mean what it says.

Editing this file does not change the repository. The ruleset has to be applied
with the command below, as `.github/rulesets/README.md` describes.

```
gh api --method PUT repos/jbj/toddler-puzzle/rulesets/<id> --input .github/rulesets/main.json
```
