/**
 * The output contract shared by repository checks.
 *
 * A successful check is useful as an exit code and expensive as prose: every
 * line printed near the start of an agent session is carried through the rest
 * of that session. Failures are different. They need to name the file and the
 * fault without making somebody rerun the check through a filter to find it.
 *
 * `--verbose` restores the running account used while maintaining a check. The
 * checks still do exactly the same work in either mode; this module only
 * decides which observations are worth printing.
 */

export const verbose = process.argv.includes("--verbose");

const asProblems = (problems) =>
  Array.isArray(problems) ? problems.filter(Boolean) : problems ? [problems] : [];

export function createReport(title, options = {}) {
  const show = options.verbose ?? verbose;
  const failures = [];

  return {
    section(label) {
      if (show) console.log(label);
    },

    detail(line = "") {
      if (show) console.log(line);
    },

    check(file, label, problems = []) {
      const found = asProblems(problems);
      if (show) {
        console.log(`${found.length === 0 ? "PASS" : "FAIL"}  ${label}`);
        for (const problem of found) console.log(`        ${problem}`);
      }
      for (const problem of found.length === 0 ? [] : found) {
        const named =
          label === file ? "" : label.startsWith(`${file} `) ? label.slice(file.length) : label;
        failures.push({
          file,
          message: problem === label ? label : named ? `${named.trim()} - ${problem}` : problem,
        });
      }
    },

    finish(successMessage) {
      if (failures.length === 0) {
        if (show && successMessage) console.log(successMessage);
        return true;
      }

      console.error(`FAIL  ${title}`);
      for (const { file, message } of failures) console.error(`  ${file}: ${message}`);
      process.exitCode = 1;
      return false;
    },
  };
}
