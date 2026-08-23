# Deploy to GitHub Pages from a verified commit

## Context

The game is a small static bundle with no runtime dependencies, no network
requests and no server side, so hosting it is a matter of publishing a build
folder to GitHub Pages. Two details decide how that publishing works.

The first is the path: a project site is served under a repository-name
prefix, not at the root, while the same build output is also served at the
root by local scripts that drive real drags through it and by the preview
command. A build configured only for the prefixed path would publish
correctly and break those local checks, or vice versa.

The second is when to publish. The default branch is protected so that
whatever lands has passed full verification by pull request, but a workflow
that builds and deploys on every push to that branch would race the CI run
of that same push rather than depending on its result, and would publish
regardless of how CI concluded.

## Decision

Build with relative asset URLs, so the same build artifact is correct
whether served from the root or from a path prefix, and the same artifact
that is checked locally is the one that ships.

Trigger the deploy from CI's completion rather than from the push itself:
the deploy workflow watches for the CI workflow to finish on the default
branch, runs only when that run was triggered by a push and concluded
successfully, and checks out the exact commit CI verified rather than
whatever the default branch points to by the time the deploy starts.

Publish by uploading the build output as a workflow artifact and handing it
to the Pages deployment action, rather than committing built output to a
branch. The deploy workflow commits nothing, to any branch, ever.

## Consequences

There is no committed build branch and no build output in version control;
what accumulates is deployment and workflow-run history, kept outside git on
GitHub's own retention.

The deploy job builds again rather than reusing CI's build output, since
downloading an artifact from another run and republishing it is the kind of
indirection [Let the author attach the
screenshots](<Let the author attach the screenshots.md>) argues against; a
second clean build is cheap and needs no elevated privilege. It does not
repeat the full verification CI already ran on that commit.

The repository's Pages source must be configured for deployment via
workflow, which is a one-time repository setting rather than something this
workflow can safely set for itself, since doing so needs privileges the
deploy workflow should not be given.

The gate means a failed CI run simply leaves the previously published site
up rather than replacing it with something broken. That is the intended
direction of failure: for a two-year-old mid-puzzle, stale is better than
blank.
