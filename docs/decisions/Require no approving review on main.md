# Require no approving review on `main`

The checked-in ruleset does not require human approval.

In a single-maintainer repository, the only possible approver is also the
author. An approval requirement therefore either blocks every pull request or
is bypassed as routine. A control overridden every time teaches the maintainer
that bypassing controls is normal, which makes the bypass less meaningful when
it is genuinely needed.

Mechanical enforcement remains the gate. Pull requests must satisfy the
checked-in ruleset and verification workflow; only the impossible claim of
independent human approval is absent. If a second maintainer can provide a real
second pair of eyes, requiring approval becomes meaningful.

`.github/rulesets/main.json` is the source of truth for current settings.
Apply changes through the procedure in
[`.github/rulesets/README.md`](../../.github/rulesets/README.md) rather than
copying the rules into this record.
