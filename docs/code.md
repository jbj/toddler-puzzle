# Code maintenance

## Definition of done

- Run `npm run verify` before claiming a change is ready. It is the complete
  local pre-PR contract and the source of truth for what CI checks.
- Never weaken, skip, or delete a check to make a change pass. If a check is
  wrong, change it deliberately and explain why.
- Use the smallest relevant existing check while iterating, then run the full
  definition of done.
- Let the repository's format command handle code style. Markdown is
  hand-wrapped as described in [`documentation.md`](documentation.md).
- Treat bundle limits as constraints, not targets to move quietly. The budget
  checker owns current values and reports the evidence needed to change them.
- A check that parallelizes must honor the resource budget supplied by the
  verify runner rather than discovering and consuming the whole machine.

The available commands and their current composition live in `package.json` and
the scripts themselves. Use a command's help or source instead of maintaining a
second catalogue here.

## Change the owning abstraction

- Search for the canonical type, table, helper, or check before adding another
  path that says the same thing.
- Preserve product invariants at the shared boundary. A puzzle kind should name
  valid targets, for example, while shared layout code owns placement geometry.
- Prefer properties over enumerated output. Layouts, deals, and cut pieces vary;
  their promises should not.
- Keep generated data generated. Run the owning command and commit its output;
  do not hand-edit measured tables to satisfy a check.
- Surface errors at the boundary that can explain them. Do not let a known
  environment or input problem emerge later as an unrelated failure.
- Keep deferred loading strict and explicit. A missing implementation or failed
  chunk is an error, not a reason to substitute unrelated gameplay silently.

## Evidence

- A claim about behavior needs the check or observation that creates the
  conditions described.
- A passing static check is not visual review. Artwork, scenes, layout, motion,
  and sound still require the human judgment named by their topic guide.
- Evidence describes the current branch after the final change. Re-run any
  derived output that may have been made stale.
- A green local run is not the same evidence as green CI. After pushing, wait
  for `gh pr checks` against the current commit.
- Trust fetched repository and CI state over conclusions inferred from local
  commit ancestry or an old run.

## Pull requests

- Prefer one issue-sized change per pull request.
- State the command run and its result.
- Explain any changed invariant or changed check in its own right.
- Attach current screenshots for player-visible changes. See the procedure
  below.
- Let dependency automation own routine action-version updates.

Repository rules that live in GitHub rather than code are documented narrowly
in [`.github/rulesets/README.md`](../.github/rulesets/README.md).

Once a verified commit reaches `main`, the deployment workflow publishes that
commit. Read `.github/workflows/pages.yml` for the current mechanism.

### Stacked pull requests

A stack is reviewed and merged from its base upward.

1. Wait for CI on each layer.
2. When a pull request's base is not `main`, explicitly request Copilot review;
   it does not start automatically:

   ```sh
   gh api -X POST repos/<owner>/<repo>/pulls/<number>/requested_reviewers \
     -f "reviewers[]=copilot-pull-request-reviewer[bot]"
   ```

3. Do not push new commits to a branch another open pull request uses as its
   base. Merge the moved base into the child branch instead of rewriting the
   child out from under GitHub's checks.

## Attaching screenshots

1. Run the repository check that produces the screenshots from the branch as it
   stands.
2. Review the contact sheet and any individual image needed to judge the change.
3. Attach the current contact sheet to the pull request, with a closer image
   when one detail deserves it.
4. If the upload surface is unavailable, say so and link the screenshot artifact
   from the current CI run instead:

   ```sh
   gh run list --branch <branch> --workflow CI --limit 1
   gh run view <run-id>
   ```

Never commit generated review images or substitute an older or hand-edited
image. The current command, output location, and CI artifact name are owned by
the screenshot scripts and pull-request template.
