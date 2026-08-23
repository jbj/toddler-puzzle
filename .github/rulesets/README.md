# Repository rules

`main.json` is the reviewable source for branch protection that otherwise lives
only in the GitHub settings UI. Read the JSON for the current rules rather than
maintaining a prose copy here.

The policy keeps mechanical verification strict without pretending a solo
maintainer can supply independent human approval. See
[`Require no approving review on main`](<../../docs/decisions/Require no approving review on main.md>).

## Applying a change

1. Edit `main.json` and review the diff.
2. List the repository rulesets to find the live ruleset id.
3. Update that ruleset from the checked-in JSON.
4. Fetch the live ruleset and compare it with the intended change.

```sh
gh api repos/jbj/toddler-puzzle/rulesets
gh api --method PUT repos/jbj/toddler-puzzle/rulesets/<id> \
  --input .github/rulesets/main.json
gh api repos/jbj/toddler-puzzle/rulesets/<id>
```

To create the ruleset when none exists:

```sh
gh api --method POST repos/jbj/toddler-puzzle/rulesets \
  --input .github/rulesets/main.json
```

The required check context must match the workflow job name. A rename on either
side requires the other to change in the same pull request.
