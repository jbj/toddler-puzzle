# Repository rules

`main.json` is the branch ruleset for `main`, kept here so the repository's
rules are reviewable in a pull request rather than living only in the settings
UI where a change leaves no trace.

What it says:

- changes reach `main` through a pull request, never a direct push;
- no approving review is required, because there is nobody who can give one;
  see `docs/decisions/20260727T151749-no-required-approving-review.md`;
- an approval, if one is given, is dismissed when new commits are pushed, so an
  agent cannot add code after the fact to an approved branch;
- the `Verify` check must pass - that is `npm run verify` running in CI;
- Copilot reviews every pull request, drafts included, and again on each push;
- `main` cannot be deleted or force-pushed.

The repository admin can bypass, which covers the case where a rule itself is
what needs fixing. With no approval to wait for, ordinary pull requests should
not need it: the pull request, the `Verify` check and the Copilot review still
apply, and merging without them is still a deliberate, logged override.

## Applying it

```
gh api --method POST repos/jbj/toddler-puzzle/rulesets --input .github/rulesets/main.json
```

To update an existing ruleset, list them first and PUT to the one you want:

```
gh api repos/jbj/toddler-puzzle/rulesets
gh api --method PUT repos/jbj/toddler-puzzle/rulesets/<id> --input .github/rulesets/main.json
```

The `Verify` context has to match the job name in `.github/workflows/ci.yml`.
If that job is renamed, this file has to change with it, or the rule will wait
for a check that never reports.

## Copilot code review

`copilot_code_review` is part of this ruleset rather than a settings toggle, so
it is reviewable like everything else here.

`review_draft_pull_requests` is on, which is the setting that matters for this
repository: the cloud agent opens its pull requests as drafts and works in them,
so a rule that skipped drafts would only ever look at the finished article -
after the agent had stopped reading feedback. `review_on_push` keeps the review
attached to the current code rather than the first commit.

Both make Copilot noisier on a long-running branch. Turn `review_on_push` off
first if that becomes tiresome; leave draft review alone.
