import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseFrontmatter } from "@iyulab/canopy";
import { type CommitStamp, type GitObserver, gitQuotes, isShallowClone, lastCommits } from "./lastmod.js";
import type { Finding } from "./site.js";

const execFileAsync = promisify(execFile);

/**
 * Whether a page still describes what it documents.
 *
 * A page names the files it documents with `sourceGlobs:` in its frontmatter. It is stale
 * when one of those files changed in a commit that the page's own last commit does not contain:
 * the code moved and the page never saw it. That is a question about the history's shape, not
 * its clock — a change merged in from a branch can carry an earlier date than the page edit it
 * was never shown, and two commits a second apart carry the same one. The answer comes from
 * git's history alone — no stored hash, no step that has to be run to say "I reviewed this"
 * (committing the page, even unchanged in meaning, says it).
 *
 * Opt-in by page: a site that uses no `sourceGlobs` pays nothing, not even a `git` process.
 */

/** One `sourceGlobs` entry, judged against the page that names it. */
export interface SourceTime {
  glob: string;
  /** Whether any file git has committed matches it. */
  committed: boolean;
  /**
   * The day (`YYYY-MM-DD`, on the committer's calendar) of the newest change to a file it names
   * that the page's last commit does not contain; `undefined` when the page has seen every such change.
   */
  unseen: string | undefined;
}

/** What is known about one page that names its sources. */
export interface PageFreshness {
  /** What kept the page from being judged at all (a value that is not a list of paths, say). */
  problems: string[];
  /** The day git last committed the page, as the sitemap dates it; `undefined` for a page it has no commit of. */
  pageDay: string | undefined;
  /** That commit's hash; `undefined` alongside `pageDay`. */
  pageCommit?: string;
  sources: SourceTime[];
}

/** Everything `check` needs to judge `sourceGlobs`, read once when the site is loaded. */
export interface SourceFreshness {
  /** Why no page could be judged against history, when that is the case. */
  withheld?: string;
  pages: ReadonlyMap<string, PageFreshness>;
}

const PARALLEL_GIT = 8;

/** `items` mapped through `work`, at most {@link PARALLEL_GIT} at a time, in order. */
async function inParallel<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_GIT, items.length) }, worker));
  return results;
}

/** A commit, by hash and the day (`YYYY-MM-DD`) as its committer's own calendar spells it. */
interface Commit {
  hash: string;
  day: string;
}

/**
 * The newest commit in `range` (a revision range — `HEAD` for the whole history) that changed
 * anything `pathspec` names, relative to `cwd`; `undefined` for none.
 */
async function newestCommit(
  range: string,
  pathspec: string,
  cwd: string,
  observe?: GitObserver,
): Promise<Commit | undefined> {
  const args = ["log", "-1", "--format=%H %cs", range, "--", pathspec];
  observe?.(args);
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    const [hash, day] = stdout.trim().split(" ");
    return hash === undefined || hash === "" || day === undefined ? undefined : { hash, day };
  } catch {
    return undefined;
  }
}

/** The patterns a page names, or why it names none we can use. */
function patternsOf(value: unknown): { globs: string[] } | { problem: string } {
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length === 0) return { problem: "`sourceGlobs` is an empty list" };
  const globs: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return { problem: "`sourceGlobs` must be a path pattern or a list of them" };
    }
    const glob = entry.trim();
    if (glob.startsWith("/") || glob.startsWith(":") || /^[A-Za-z]:/.test(glob) || glob.includes("\\")) {
      return {
        problem: `\`sourceGlobs\` entry "${glob}" must be a path pattern from the site folder, written with "/" ` +
          "(not absolute, not a drive path, not git pathspec magic)",
      };
    }
    globs.push(glob);
  }
  return { globs };
}

/**
 * Read, for every page that names `sourceGlobs`, when it and each file it names were last
 * committed. `undefined` when no page names any — nothing was asked, so git is not.
 */
export async function readSourceFreshness(
  root: string,
  sources: ReadonlyMap<string, string>,
  observe?: GitObserver,
): Promise<SourceFreshness | undefined> {
  const asked = new Map<string, string[]>();
  const pages = new Map<string, PageFreshness>();
  for (const [page, markdown] of sources) {
    let data: Record<string, unknown>;
    try {
      data = parseFrontmatter(markdown).data;
    } catch {
      // Frontmatter that does not parse is canopy's to report when it renders the page; this
      // read only asks whether the page names its sources.
      continue;
    }
    if (!("sourceGlobs" in data)) continue;
    const patterns = patternsOf(data.sourceGlobs);
    if ("problem" in patterns) {
      pages.set(page, { problems: [patterns.problem], pageDay: undefined, sources: [] });
    } else {
      asked.set(page, patterns.globs);
    }
  }
  if (asked.size === 0 && pages.size === 0) return undefined;
  if (asked.size === 0) return { pages };

  const insideArgs = ["rev-parse", "--is-inside-work-tree"];
  observe?.(insideArgs);
  const inside = await execFileAsync("git", insideArgs, { cwd: root }).then(
    ({ stdout }) => stdout.trim() === "true",
    () => false,
  );
  if (!inside) return { withheld: "the site is not inside a git repository", pages };
  if (await isShallowClone(root, observe)) {
    return {
      withheld:
        "the clone is shallow, so its history stops at an arbitrary commit and every page would look newer than its sources (fetch the full history)",
      pages,
    };
  }

  const committed = new Map<string, boolean>();
  const distinct = [...new Set([...asked.values()].flat())];
  await inParallel(distinct, async (glob) => {
    committed.set(glob, (await newestCommit("HEAD", `:(glob)${glob}`, root, observe)) !== undefined);
  });
  // Every page's last commit from ONE pass over the history (the one the sitemap's dates use) — a
  // process per page is what made a thousand-post build take a hundred seconds. A page whose name
  // git prints quoted cannot be matched in that pass and is asked for by itself.
  const askedPages = [...asked.keys()];
  const plain = askedPages.filter((page) => !gitQuotes(page));
  const stamps = (await lastCommits(root, new Set(plain), observe)) ?? new Map<string, CommitStamp>();
  const pageCommits = new Map<string, Commit | undefined>();
  await inParallel(askedPages, async (page) => {
    pageCommits.set(
      page,
      gitQuotes(page) ? await newestCommit("HEAD", `:(literal)${page}`, root, observe) : stamps.get(page),
    );
  });
  // What each page has not seen: the changes to its patterns that its last commit does not contain.
  // Pages last committed together share that question, so it is asked once per (commit, pattern).
  const question = (hash: string, glob: string) => JSON.stringify([hash, glob]);
  const questions = new Map<string, { hash: string; glob: string }>();
  for (const page of askedPages) {
    const commit = pageCommits.get(page);
    if (commit === undefined) continue;
    for (const glob of asked.get(page) ?? []) {
      if (committed.get(glob)) questions.set(question(commit.hash, glob), { hash: commit.hash, glob });
    }
  }
  const unseen = new Map<string, string | undefined>();
  await inParallel([...questions], async ([id, { hash, glob }]) => {
    unseen.set(id, (await newestCommit(`${hash}..HEAD`, `:(glob)${glob}`, root, observe))?.day);
  });
  for (const page of askedPages) {
    const commit = pageCommits.get(page);
    pages.set(page, {
      problems: [],
      pageDay: commit?.day,
      pageCommit: commit?.hash,
      sources: (asked.get(page) ?? []).map((glob) => ({
        glob,
        committed: committed.get(glob) ?? false,
        unseen: commit === undefined ? undefined : unseen.get(question(commit.hash, glob)),
      })),
    });
  }
  return { pages };
}


/** What `check` says about `sourceGlobs`: pages older than their sources, and what could not be judged. */
export function sourceFreshnessFindings(freshness: SourceFreshness | undefined): Finding[] {
  if (freshness === undefined) return [];
  const findings: Finding[] = [];
  if (freshness.withheld !== undefined) {
    findings.push({
      kind: "a-sourceglobs-entry-cannot-be-judged",
      level: "warning",
      message: `${freshness.pages.size === 0 ? "" : "some pages "}name \`sourceGlobs\` but they cannot be judged: ${freshness.withheld}`,
    });
  }
  for (const page of [...freshness.pages.keys()].sort()) {
    const known = freshness.pages.get(page) as PageFreshness;
    const problems = [...known.problems];
    for (const { glob, committed } of known.sources) {
      if (!committed && freshness.withheld === undefined) {
        problems.push(`\`sourceGlobs\` entry "${glob}" matches no file git has committed`);
      }
    }
    if (problems.length > 0) {
      findings.push({
        kind: "a-sourceglobs-entry-cannot-be-judged",
        level: "warning",
        page,
        message: `${page}: ${problems.join("; ")}`,
      });
    }
    if (known.pageDay === undefined) continue;
    const unseen = known.sources.filter((source) => source.unseen !== undefined);
    if (unseen.length === 0) continue;
    findings.push({
      kind: "a-page-is-older-than-the-sources-it-documents",
      level: "warning",
      page,
      message:
        `${page}: what it documents changed in commits its own last commit (${known.pageDay}) does not contain — ` +
        unseen.map(({ glob, unseen }) => `${glob} (${unseen})`).join(", "),
    });
  }
  return findings;
}
