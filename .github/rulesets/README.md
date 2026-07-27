# Repository rules

`main.json` is the branch ruleset for `main`, kept here so the repository's
rules are reviewable in a pull request rather than living only in the settings
UI where a change leaves no trace.

What it says:

- changes reach `main` through a pull request with one approving review;
- an approval is dismissed when new commits are pushed, so an agent cannot add
  code after the fact to an approved branch;
- the `Verify` check must pass - that is `npm run verify` running in CI;
- `main` cannot be deleted or force-pushed.

The repository admin can bypass. That is deliberate: a solo maintainer cannot
approve their own pull request, so without a bypass the first hand-written fix
would be unmergeable. Agent-authored pull requests are a different author, so
they still need a real approval.

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

Automatic Copilot review on new pull requests is a repository setting rather
than part of this ruleset. Turn it on under Settings, so the first pass over an
agent's diff is not the maintainer's.
