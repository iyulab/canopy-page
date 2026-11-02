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
  /** The commit the page's `sourcesReviewed` names, when it names one git has in HEAD's history — the page is judged from it. */
  review?: { named: string; day: string };
  sources: SourceTime[];
}

/** Everything `check` needs to judge `sourceGlobs`, read once when the site is loaded. */
export interface SourceFreshness {
  /** Why no page could be judged against history, when that is the case, and how many pages that leaves unjudged. */
  withheld?: { reason: string; pages: number };
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
 * anything `pathspec` names, relative to `cwd` — with no pathspec, the newest commit in it at all;
 * `undefined` for none.
 */
async function newestCommit(
  range: string,
  pathspec: string | undefined,
  cwd: string,
  observe?: GitObserver,
): Promise<Commit | undefined> {
  const args = ["log", "-1", "--format=%H %cs", range, "--", ...(pathspec === undefined ? [] : [pathspec])];
  observe?.(args);
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    const [hash, day] = stdout.trim().split(" ");
    return hash === undefined || hash === "" || day === undefined ? undefined : { hash, day };
  } catch {
    return undefined;
  }
}

/**
 * The commit a page's `sourcesReviewed` names, or why it names none we can use. Only a commit hash
 * (abbreviated or full) is taken: a review is of one fixed state of the sources, which a branch or
 * tag name — free to move — does not pin.
 */
function reviewedOf(value: unknown): { hash: string } | { problem: string } {
  if (typeof value === "number") {
    return { problem: "`sourcesReviewed` must be quoted: YAML read the commit hash as a number" };
  }
  if (typeof value !== "string" || !/^[0-9a-f]{7,64}$/i.test(value.trim())) {
    return { problem: "`sourcesReviewed` must be a commit hash (at least 7 hex digits)" };
  }
  return { hash: value.trim().toLowerCase() };
}

/**
 * The commit `hash` abbreviates, when it is one in HEAD's history — a review of a state the branch
 * never reached (another branch, a rewritten history) says nothing about the sources it now has.
 */
async function resolveReview(
  hash: string,
  cwd: string,
  observe?: GitObserver,
): Promise<Commit | { problem: (named: string) => string }> {
  const commit = await newestCommit(hash, undefined, cwd, observe);
  if (commit === undefined || !commit.hash.startsWith(hash)) {
    return { problem: (named) => `\`sourcesReviewed\` names ${named}, which is no commit git knows` };
  }
  const args = ["merge-base", "--is-ancestor", commit.hash, "HEAD"];
  observe?.(args);
  const inHistory = await execFileAsync("git", args, { cwd }).then(
    () => true,
    () => false,
  );
  if (!inHistory) {
    return { problem: (named) => `\`sourcesReviewed\` names ${named}, which is not in the history of the checked-out commit` };
  }
  return commit;
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
  /** page → the commit its `sourcesReviewed` names, as written. */
  const markers = new Map<string, string>();
  /** page → why its `sourcesReviewed` cannot be used. */
  const markerProblems = new Map<string, string>();
  for (const [page, markdown] of sources) {
    let data: Record<string, unknown>;
    try {
      data = parseFrontmatter(markdown).data;
    } catch {
      // Frontmatter that does not parse is canopy's to report when it renders the page; this
      // read only asks whether the page names its sources.
      continue;
    }
    if (!("sourceGlobs" in data)) {
      if ("sourcesReviewed" in data) {
        pages.set(page, {
          problems: ["`sourcesReviewed` without `sourceGlobs` names a review of nothing"],
          pageDay: undefined,
          sources: [],
        });
      }
      continue;
    }
    const patterns = patternsOf(data.sourceGlobs);
    if ("problem" in patterns) {
      pages.set(page, { problems: [patterns.problem], pageDay: undefined, sources: [] });
      continue;
    }
    asked.set(page, patterns.globs);
    if ("sourcesReviewed" in data) {
      const marker = reviewedOf(data.sourcesReviewed);
      if ("problem" in marker) markerProblems.set(page, marker.problem);
      else markers.set(page, marker.hash);
    }
  }
  if (asked.size === 0 && pages.size === 0) return undefined;
  if (asked.size === 0) return { pages };

  const insideArgs = ["rev-parse", "--is-inside-work-tree"];
  observe?.(insideArgs);
  const inside = await execFileAsync("git", insideArgs, { cwd: root }).then(
    ({ stdout }): "yes" | "no" | "no-git" => (stdout.trim() === "true" ? "yes" : "no"),
    // A git that cannot be started says nothing about the folder; telling the user it is not a
    // repository would send them looking for a problem their repository does not have.
    (error: NodeJS.ErrnoException): "no" | "no-git" => (error.code === "ENOENT" ? "no-git" : "no"),
  );
  const withhold = (reason: string): SourceFreshness => {
    // A marker that is not even a commit hash is wrong with or without a history to read it against.
    for (const [page, problem] of markerProblems) pages.set(page, { problems: [problem], pageDay: undefined, sources: [] });
    return { withheld: { reason, pages: asked.size }, pages };
  };
  if (inside === "no-git") return withhold("git is not installed, or not on the PATH");
  if (inside === "no") return withhold("the site is not inside a git repository");
  if (await isShallowClone(root, observe)) {
    return withhold(
      "the clone is shallow, so its history stops at an arbitrary commit and every page would look newer than its sources (fetch the full history)",
    );
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
  // A page that names `sourcesReviewed` is judged from that commit instead of its own last one: an edit
  // to the page that was not a review of its sources (a typo fixed) then does not silence it.
  const reviews = new Map<string, Commit>();
  await inParallel([...new Set(markers.values())], async (hash) => {
    const review = await resolveReview(hash, root, observe);
    if ("problem" in review) {
      for (const [page, named] of markers) if (named === hash) markerProblems.set(page, review.problem(named));
    } else {
      reviews.set(hash, review);
    }
  });
  const basisOf = (page: string): Commit | undefined => {
    const named = markers.get(page);
    const review = named === undefined ? undefined : reviews.get(named);
    return review ?? pageCommits.get(page);
  };
  // What each page has not seen: the changes to its patterns that its basis commit does not contain.
  // Pages sharing a basis share that question, so it is asked once per (commit, pattern).
  const question = (hash: string, glob: string) => JSON.stringify([hash, glob]);
  const questions = new Map<string, { hash: string; glob: string }>();
  for (const page of askedPages) {
    const basis = basisOf(page);
    if (basis === undefined) continue;
    for (const glob of asked.get(page) ?? []) {
      if (committed.get(glob)) questions.set(question(basis.hash, glob), { hash: basis.hash, glob });
    }
  }
  const unseen = new Map<string, string | undefined>();
  await inParallel([...questions], async ([id, { hash, glob }]) => {
    unseen.set(id, (await newestCommit(`${hash}..HEAD`, `:(glob)${glob}`, root, observe))?.day);
  });
  for (const page of askedPages) {
    const commit = pageCommits.get(page);
    const basis = basisOf(page);
    const named = markers.get(page);
    const problem = markerProblems.get(page);
    pages.set(page, {
      problems: problem === undefined ? [] : [problem],
      pageDay: commit?.day,
      pageCommit: commit?.hash,
      review: named !== undefined && reviews.has(named) ? { named, day: (basis as Commit).day } : undefined,
      sources: (asked.get(page) ?? []).map((glob) => ({
        glob,
        committed: committed.get(glob) ?? false,
        unseen: basis === undefined ? undefined : unseen.get(question(basis.hash, glob)),
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
    const { reason, pages } = freshness.withheld;
    findings.push({
      kind: "a-sourceglobs-entry-cannot-be-judged",
      level: "warning",
      message: `${pages === 1 ? "1 page names" : `${pages} pages name`} \`sourceGlobs\` but cannot be judged: ${reason}`,
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
    if (known.pageDay === undefined && known.review === undefined) continue;
    const unseen = known.sources.filter((source) => source.unseen !== undefined);
    if (unseen.length === 0) continue;
    const basis =
      known.review === undefined
        ? `its own last commit (${known.pageDay})`
        : `its review (sourcesReviewed ${known.review.named}, ${known.review.day})`;
    findings.push({
      kind: "a-page-is-older-than-the-sources-it-documents",
      level: "warning",
      page,
      message:
        `${page}: what it documents changed in commits ${basis} does not contain — ` +
        unseen.map(({ glob, unseen }) => `${glob} (${unseen})`).join(", "),
    });
  }
  return findings;
}
