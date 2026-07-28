# 0008. Deploy to GitHub Pages from a verified commit

## Context

The game is a static bundle of about 24 kB with no runtime dependencies, no
network requests and no server side, so hosting it is a matter of putting three
files somewhere. GitHub Pages is where they already are.

Two details decide how it is done.

The first is the path. Pages serves this repository as a project site at
`https://jbj.github.io/toddler-puzzle/`, so the site lives under a prefix. Vite's
default `base` of `/` would emit `/assets/index-....js`, which is a 404 under
that prefix. But the same `dist/` is served at the *root* by
`scripts/shot.mjs`, which is what `npm run shot` drives real drags through, and
by `npm run preview`. Pinning `base` to `/toddler-puzzle/` would publish
correctly and break the check that proves the published thing works.

The second is when to publish. `main` is protected: a change arrives by pull
request with the `Verify` check green, so what lands has passed `npm run verify`.
A workflow that built and deployed on `push` would nonetheless race the CI run
of that same push, and would publish regardless of how it turned out.

## Decision

Set `base: "./"` in `vite.config.ts`. Relative URLs are correct at the root and
under any prefix, so there is one build artifact, it is the one that ships, and
the screenshot run exercises exactly it. A custom domain later changes nothing.

Trigger the deploy from the CI run rather than from the push:
`.github/workflows/pages.yml` listens for a `workflow_run` completion of the CI
workflow on `main`, runs only when that run came from a push and concluded
`success`, and checks out `github.event.workflow_run.head_sha` — the commit CI
actually verified, not whatever `main` points at by the time the deploy starts.

Publish as an artifact: `actions/upload-pages-artifact` uploads `dist/` and
`actions/deploy-pages` hands it to the Pages service. The workflow holds
`contents: read`, plus the `pages: write` and `id-token: write` that the Pages
deployment itself needs. It commits nothing, to any branch, ever.

## Consequences

No `gh-pages` branch and no build output in the repository. Git history after a
hundred deploys looks like git history after one. What accumulates is a list of
deployments under the `github-pages` environment and the workflow run history,
both outside git and both on GitHub's own retention.

The deploy job builds again rather than reusing CI's output. Downloading an
artifact produced by another workflow run and publishing it is the shape of
problem [decision 0006](0006-screenshots-come-from-the-author.md) is about; a
second `npm ci && npm run build` costs a minute and needs no privilege. It does
not re-run `npm run verify`: the art check and the shot run need Chrome and
system packages, and CI has already run all of it on this commit.

The repository's Pages source must be "GitHub Actions". The `enablement` input
of `actions/configure-pages` would set that from the workflow, but only with a
token carrying administration rights, which this workflow does not have and
should not be given for a one-off. It is set once, by hand or by
`gh api -X POST repos/jbj/toddler-puzzle/pages -f build_type=workflow`.

A `workflow_run` trigger is inert until the workflow file is on the default
branch, so the first deploy comes from the `workflow_dispatch` button or from
the next push to `main`.

The gate means a red CI run leaves the previous site up. That is the intended
direction of failure: for a two-year-old mid-puzzle, stale is better than blank.
