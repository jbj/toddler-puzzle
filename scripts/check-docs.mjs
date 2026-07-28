/**
 * Documentation cross-reference check.
 *
 * The prose in this repository is deliberately split: a short index in
 * `.github/copilot-instructions.md` over topic files in `.github/instructions`,
 * with `docs/decisions` behind them. That only works while the references
 * between them resolve, and a stale one is invisible - nothing goes red when a
 * file is renamed out from under a link. So this checks them mechanically:
 *
 *   - every relative Markdown link points at a file or directory that exists;
 *   - every `#anchor` matches a heading in the file it points at;
 *   - every path ending in `.md` mentioned anywhere in the prose resolves,
 *     whether it is a link, in backticks, or bare. The bare case is the one
 *     that rots: "See AGENTS.md" is not a link, so a link checker walks past
 *     it;
 *   - every `docs/decisions/NNNN` or "decision NNNN" names a record that
 *     exists, so citing one by number survives a retitling;
 *   - the index lists every instructions file and no others;
 *   - every `applyTo` glob matches at least one path, so renaming a source file
 *     cannot quietly orphan the instructions that govern it.
 *
 *   npm run docs:check
 *
 * External links are checked for syntax and never fetched. A check that reaches
 * the network fails for reasons that have nothing to do with the change in
 * front of it, and this project makes no network requests by design.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[/\\]$/, "");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".art"]);

const INDEX = ".github/copilot-instructions.md";
const INSTRUCTIONS_DIR = ".github/instructions";
const DECISIONS_DIR = "docs/decisions";

let failures = 0;
const check = (label, problems) => {
  const ok = problems.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  for (const problem of problems) console.log(`        ${problem}`);
  if (!ok) failures += problems.length;
};

// --- the files we know about ----------------------------------------------

/** Every path in the repository worth resolving against, repo-relative. */
function walk(dir = root, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    found.push(relative(root, full).split(sep).join("/"));
    if (entry.isDirectory()) walk(full, found);
  }
  return found;
}

const paths = walk();
const known = new Set(paths);
const basenames = new Set(paths.map((path) => path.slice(path.lastIndexOf("/") + 1)));
const markdown = paths.filter((path) => path.endsWith(".md")).sort();

const exists = (path) => known.has(path);

/**
 * Resolve a repo-relative path, or null when it escapes the repository - a
 * `../` that climbs out is always a mistake, and reporting it as "not found"
 * would be confusing.
 */
function repoPath(from, target) {
  const absolute = resolve(root, dirname(from), target);
  const rel = relative(root, absolute).split(sep).join("/");
  return rel === "" || rel.startsWith("../") ? null : rel;
}

// --- reading a Markdown file ----------------------------------------------

/**
 * Fenced code blocks are examples, not references: a path inside one is being
 * shown rather than followed. Inline backticks stay, because `AGENTS.md` in
 * running prose is exactly the kind of reference that goes stale.
 */
const withoutFences = (text) => text.replace(/^```[\s\S]*?^```$/gm, "");

/** Heading anchors, in GitHub's slug form, including its `-1` for repeats. */
function anchors(text) {
  const seen = new Map();
  const slugs = new Set();
  for (const [, heading] of withoutFences(text).matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*$/gm)) {
    const base = heading
      .replace(/`/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .replace(/[ _]/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

const sources = new Map(markdown.map((path) => [path, readFileSync(join(root, path), "utf8")]));
const anchorsOf = new Map([...sources].map(([path, text]) => [path, anchors(text)]));

/** Every link in a file: inline `[a](b)` and reference definitions `[a]: b`. */
function links(text) {
  const body = withoutFences(text);
  const inline = [...body.matchAll(/\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g)];
  const references = [...body.matchAll(/^\[[^\]]+\]:\s*<?(\S+?)>?\s*$/gm)];
  return [...inline, ...references].map((match) => match[1]);
}

// --- the checks -----------------------------------------------------------

const decisionNumbers = new Set(
  paths.flatMap((path) => {
    const m = new RegExp(`^${DECISIONS_DIR}/(\\d{8}T\\d{6})(-[\\w-]+)?\\.md$`).exec(path);
    if (!m) return [];
    // Accept both the bare timestamp (for short citations) and the full basename
    // (timestamp + slug), so precise citations are validated unambiguously.
    const timestamp = m[1];
    const slug = m[2] ?? "";
    return slug ? [timestamp, timestamp + slug] : [timestamp];
  }),
);

function checkLinks(file, text, problems) {
  for (const target of links(text)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      if (!URL.canParse(target)) problems.push(`link "${target}" is not a valid URL`);
      continue;
    }
    if (target.startsWith("#")) {
      if (!anchorsOf.get(file).has(target.slice(1))) {
        problems.push(`link "${target}" has no matching heading in this file`);
      }
      continue;
    }

    const [path, anchor] = target.split("#");
    const resolved = repoPath(file, decodeURIComponent(path));
    if (resolved === null) {
      problems.push(`link "${target}" points outside the repository`);
      continue;
    }
    if (!exists(resolved)) {
      problems.push(`link "${target}" points at ${resolved}, which does not exist`);
      continue;
    }
    if (anchor && anchorsOf.has(resolved) && !anchorsOf.get(resolved).has(anchor)) {
      problems.push(`link "${target}" has no matching heading in ${resolved}`);
    }
  }
}

function checkMentions(file, text, problems, alreadyChecked) {
  const mentions = withoutFences(text).matchAll(/[\w./-]*[\w-]\.md\b/g);
  for (const [mention] of mentions) {
    // Link targets have already been resolved, and more strictly.
    if (alreadyChecked.has(mention)) continue;
    if (resolvesSomehow(file, mention)) continue;
    problems.push(`"${mention}" does not name a file that exists`);
  }
}

/**
 * A mention is prose, not a link, so it is allowed to be loose about where it
 * starts from: relative to the file it is written in, relative to the repo, or
 * - when it is a bare file name, which is how link text usually reads - any
 * file with that name. It only has to name something real.
 */
function resolvesSomehow(file, mention) {
  const fromHere = repoPath(file, mention);
  if (fromHere !== null && exists(fromHere)) return true;
  if (!/^\.{1,2}\//.test(mention) && exists(mention)) return true;
  return !mention.includes("/") && basenames.has(mention);
}

function checkDecisionNumbers(file, text, problems) {
  const body = withoutFences(text);
  const DECISION_ID = `\\d{8}T\\d{6}(?:-[\\w-]+)?`;
  const cited = [
    ...body.matchAll(new RegExp(`${DECISIONS_DIR}/(${DECISION_ID})`, "g")),
    ...body.matchAll(new RegExp(`\\bdecisions?\\s+(${DECISION_ID})\\b`, "gi")),
  ];
  for (const [, number] of cited) {
    if (!decisionNumbers.has(number)) {
      problems.push(`decision ${number} is cited but no such record exists`);
    }
  }
}

for (const file of markdown) {
  const text = sources.get(file);
  const problems = [];
  const targets = new Set(links(text).map((target) => target.split("#")[0]));
  checkLinks(file, text, problems);
  checkMentions(file, text, problems, targets);
  checkDecisionNumbers(file, text, problems);
  check(file, [...new Set(problems)]);
}

// --- the index and the instructions it indexes -----------------------------

const instructionFiles = paths
  .filter((path) => path.startsWith(`${INSTRUCTIONS_DIR}/`) && path.endsWith(".instructions.md"))
  .sort();

{
  const problems = [];
  if (!exists(INDEX)) {
    problems.push(`${INDEX} is missing`);
  } else if (instructionFiles.length === 0) {
    problems.push(`${INSTRUCTIONS_DIR} holds no instructions files`);
  } else {
    const index = sources.get(INDEX);
    for (const file of instructionFiles) {
      if (!index.includes(file.slice(INSTRUCTIONS_DIR.length + 1))) {
        problems.push(`${file} exists but the index does not mention it`);
      }
    }
  }
  check(`${INDEX} lists every instructions file`, problems);
}

// --- applyTo globs ---------------------------------------------------------

/** Only the glob syntax `applyTo` uses: `**`, `*`, and `?`. */
function globToRegExp(glob) {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        pattern += ".*";
        i++;
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) return {};
  const fields = {};
  for (const [, key, value] of match[1].matchAll(/^([A-Za-z]+):\s*(.*)$/gm)) {
    fields[key] = value.trim().replace(/^["'](.*)["']$/, "$1");
  }
  return fields;
}

for (const file of instructionFiles) {
  const problems = [];
  const { applyTo } = frontMatter(sources.get(file));
  if (applyTo === undefined) {
    // Deliberate for an index-only file: no applyTo means never attached
    // automatically, only pulled in on purpose.
    check(`${file} (no applyTo; index-only)`, problems);
    continue;
  }
  for (const glob of applyTo.split(",").map((part) => part.trim())) {
    if (glob === "") continue;
    const matcher = globToRegExp(glob);
    if (!paths.some((path) => matcher.test(path))) {
      problems.push(`applyTo glob "${glob}" matches nothing in the repository`);
    }
  }
  check(`${file} applyTo`, problems);
}

// --- result ----------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} broken reference${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log(`\nAll references resolve across ${markdown.length} Markdown files.`);
