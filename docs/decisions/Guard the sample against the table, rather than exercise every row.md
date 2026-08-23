# Guard the sample against the table, rather than exercise every row

An expensive browser run should sample representative gameplay rather than
repeat every row of a growing level table. A hand-written sample can silently
lose coverage, however, while the run remains green.

The sample is therefore checked against canonical sources:

- required kinds, progression boundaries, and celebrations are derived from
  their tables and registries;
- observed coverage comes from the live application exercised by the run;
- a missing category is reported with a table row that would cover it.

The guard also proves its own discovery is credible. It rejects an empty or
garbled parse and cross-checks parsed structure against the running game. A
sample built from a broken parse is not coverage.

This keeps the browser run deliberately small without allowing new gameplay to
arrive unobserved. See [`tests.md`](../tests.md) for the general rule against
vacuous checks.
