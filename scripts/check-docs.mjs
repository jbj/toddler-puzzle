/**
 * Documentation cross-reference check.
 *
 * The prose in this repository is deliberately split: an always-loaded brief
 * in `.github/copilot-instructions.md`, deliberately selected topic files in
 * `docs`, and decision records behind them. That only works while the references
 * and routing comments resolve, so this checks them mechanically:
 *
 *   - every relative Markdown link points at a file or directory that exists;
 *   - every `#anchor` matches a heading in the file it points at;
 *   - every path ending in `.md` mentioned anywhere in the prose resolves,
 *     whether it is a link, in backticks, or bare. The bare case is the one
 *     that rots: "See AGENTS.md" is not a link, so a link checker walks past
 *     it. A decision record is named as a sentence and cited by that name, so
 *     the mention scanner has to cope with spaces;
 *   - the brief lists every topic file;
 *   - every source directive has the canonical form and names an indexed topic,
 *     and every locally routed topic is used by at least one source file;
 *   - every documentation level stays within its per-file context budget.
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

import { createReport } from "./report.mjs";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[/\\]$/, "");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".art"]);

const INDEX = ".github/copilot-instructions.md";
const TOPICS_DIR = "docs";
const DECISIONS_DIR = "docs/decisions";
const report = createReport("documentation check");

const check = (file, label, problems) => report.check(file, label, problems);

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
  // A link target is allowed to contain spaces when it is wrapped in angle
  // brackets, which is how a decision record's sentence of a filename is cited.
  const bracketed = [...body.matchAll(/\[[^\]]*\]\(\s*<([^>\n]+)>(?:\s+"[^"]*")?\s*\)/g)];
  const inline = [...body.matchAll(/\[[^\]]*\]\(\s*([^)<>\s]+)(?:\s+"[^"]*")?\s*\)/g)];
  const references = [
    ...body.matchAll(/^\[[^\]]+\]:\s*<([^>\n]+)>\s*$|^\[[^\]]+\]:\s*(\S+)\s*$/gm),
  ];
  return [...bracketed, ...inline, ...references].map((match) => match[1] ?? match[2]);
}

// --- the checks -----------------------------------------------------------

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

/**
 * A decision record is named as a sentence, so a citation of one contains
 * spaces, and the bare-mention scanner - which stops at the first character no
 * path may contain - would see only its last word. So the destination of every
 * link is taken out of the text before that scan, having already been resolved
 * more strictly, and a bare citation of a record is matched from its directory
 * forwards instead.
 */
const LINK_DESTINATION = /\]\(\s*(?:<[^>\n]+>|[^)<>\s]+)(?:\s+"[^"]*")?\s*\)/g;
const SPACED_DECISION = new RegExp(`${DECISIONS_DIR}/[^\n)>\`"]+?\\.md`, "g");

function checkMentions(file, text, problems, alreadyChecked) {
  const body = withoutFences(text);
  for (const [mention] of body.matchAll(SPACED_DECISION)) {
    if (!exists(mention)) problems.push(`"${mention}" does not name a record that exists`);
  }
  const prose = body.replace(LINK_DESTINATION, "]()").replace(SPACED_DECISION, "");
  for (const [mention] of prose.matchAll(/[\w./-]*[\w-]\.md\b/g)) {
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

for (const file of markdown) {
  const text = sources.get(file);
  const problems = [];
  const targets = new Set(links(text).map((target) => target.split("#")[0]));
  checkLinks(file, text, problems);
  checkMentions(file, text, problems, targets);
  check(file, file, [...new Set(problems)]);
}

// --- the brief and the topic files it indexes -------------------------------

const topicFiles = paths
  .filter(
    (path) =>
      path.startsWith(`${TOPICS_DIR}/`) &&
      !path.slice(TOPICS_DIR.length + 1).includes("/") &&
      path.endsWith(".md"),
  )
  .sort();

{
  const problems = [];
  if (!exists(INDEX)) {
    problems.push(`${INDEX} is missing`);
  } else if (topicFiles.length === 0) {
    problems.push(`${TOPICS_DIR} holds no topic files`);
  } else {
    const index = sources.get(INDEX);
    for (const file of topicFiles) {
      if (!index.includes(file)) problems.push(`${file} exists but the brief does not mention it`);
    }
  }
  check(INDEX, `${INDEX} lists every topic file`, problems);
}

// --- source comments that route to specific topics --------------------------

const SOURCE_ROUTED_TOPICS = new Set([
  "docs/cutting.md",
  "docs/feel.md",
  "docs/layout.md",
  "docs/navigation.md",
  "docs/puzzle-kinds.md",
]);
const COMMENTABLE = /\.(?:[cm]?[jt]s|css|html|svg)$/;
const DIRECTIVE_TARGET = String.raw`(docs/[a-z0-9-]+\.md)`;
const CODE_DIRECTIVE = new RegExp(
  String.raw`^\s*(?://|/\*+|\*)\s*Before changing this file, read ${DIRECTIVE_TARGET}\.\s*(?:\*/)?\s*$`,
);
const MARKUP_DIRECTIVE = new RegExp(
  String.raw`^\s*<!--\s*Before changing this file, read ${DIRECTIVE_TARGET}\.\s*-->\s*$`,
);
const usedRoutes = new Set();
const directiveProblems = [];
const index = sources.get(INDEX) ?? "";

for (const file of paths.filter((path) => COMMENTABLE.test(path))) {
  const text = readFileSync(join(root, file), "utf8");
  const markup = /\.(?:html|svg)$/.test(file);
  const commentStart = markup ? /^\s*<!--/ : /^\s*(?:(?:\/\/|\/\*+|\*)\s*)/;
  const matcher = markup ? MARKUP_DIRECTIVE : CODE_DIRECTIVE;
  for (const [lineNumber, line] of text.split(/\r?\n/).entries()) {
    if (!commentStart.test(line) || !line.includes("Before changing this file")) continue;
    const match = matcher.exec(line);
    if (!match) {
      directiveProblems.push(`${file}:${lineNumber + 1} is not a canonical source directive`);
      continue;
    }
    const target = match[1];
    if (!SOURCE_ROUTED_TOPICS.has(target)) {
      directiveProblems.push(
        `${file}:${lineNumber + 1} names ${target}, which is routed from the brief`,
      );
      continue;
    }
    if (!topicFiles.includes(target)) {
      directiveProblems.push(`${file}:${lineNumber + 1} names missing topic ${target}`);
      continue;
    }
    if (!index.includes(target)) {
      directiveProblems.push(`${file}:${lineNumber + 1} names unindexed topic ${target}`);
      continue;
    }
    usedRoutes.add(target);
  }
}

for (const topic of SOURCE_ROUTED_TOPICS) {
  if (!usedRoutes.has(topic)) directiveProblems.push(`${topic} has no source directive`);
}
check("docs", "source directives route to indexed topics", directiveProblems);

/**
 * A citation is worth no more than the file it names, and a record is renamed
 * whenever the decision it holds changes. Markdown links are resolved above;
 * this is the same promise kept for the places prose cannot link from - a source
 * comment or a workflow, which name a file by bare path. Without it a rename
 * stays green while every citation of the old name sends the next reader
 * nowhere.
 */
const CITABLE = /\.(?:[cm]?[jt]s|css|html|svg|ya?ml)$/;
// A record is named as a sentence, so a citation carries spaces and commas. It
// carries none of the punctuation a regular expression is built from, which is
// what keeps this from matching the pattern that recognises a directive.
const SOURCE_CITATION = new RegExp(`${TOPICS_DIR}/(?:decisions/)?[A-Za-z0-9 ,.'-]+?\\.md`, "g");
{
  const problems = [];
  for (const file of paths.filter((path) => CITABLE.test(path))) {
    const text = readFileSync(join(root, file), "utf8");
    for (const [lineNumber, line] of text.split(/\r?\n/).entries()) {
      for (const [mention] of line.matchAll(SOURCE_CITATION)) {
        if (!exists(mention)) problems.push(`${file}:${lineNumber + 1} cites missing ${mention}`);
      }
    }
  }
  check("docs", "citations outside Markdown name files that exist", problems);
}

// --- how much context the documentation costs -------------------------------

/**
 * Bytes stand in for tokens. Each level has a different reading cost: the brief
 * is always loaded, topic guides are deliberately selected, and decision records
 * are opened only when their particular rationale is in question.
 */
const decisionFiles = paths
  .filter((path) => path.startsWith(`${DECISIONS_DIR}/`) && path.endsWith(".md"))
  .sort();
const DOCUMENT_LEVELS = [
  { name: "brief", files: [INDEX], ceiling: 4 * 1024 },
  { name: "topic", files: topicFiles, ceiling: 8 * 1024 },
  { name: "decision", files: decisionFiles, ceiling: 8 * 1024 },
];

{
  const problems = [];
  for (const level of DOCUMENT_LEVELS) {
    const rows = [];
    for (const file of level.files) {
      // A missing index is already reported above as a useful sentence.
      if (!sources.has(file)) continue;
      const bytes = Buffer.byteLength(sources.get(file), "utf8");
      const name = file.slice(file.lastIndexOf("/") + 1);
      const share = Math.round((bytes / level.ceiling) * 100);
      rows.push(
        `${name.padEnd(66)} ${String(bytes).padStart(6)} B  ${String(share).padStart(3)}% of ${level.ceiling / 1024} kB`,
      );
      if (bytes > level.ceiling) {
        problems.push(`${file} is ${bytes} bytes, over its ${level.ceiling}-byte ceiling`);
      }
    }
    report.detail(`        ${level.name}`);
    for (const row of rows) report.detail(`          ${row}`);
  }
  check("docs", "documentation files are within their level's context budget", problems);
  if (problems.length > 0) {
    report.detail(`
        Delete code-owned detail, repeated rules, history and implementation
        narration first. Move extended rationale into a decision record, or
        split a topic only when it has genuinely independent responsibilities.
        Raising a ceiling is a deliberate change to the documentation contract.`);
  }
}

// --- result ----------------------------------------------------------------

report.finish(`\nAll references resolve across ${markdown.length} Markdown files.`);
