import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseFrontmatter } from "@iyulab/canopy";
import { isShallowClone } from "./lastmod.js";
import type { Finding } from "./site.js";

const execFileAsync = promisify(execFile);

/**
 * Whether a page still describes what it documents.
 *
 * A page names the files it documents with `sourceGlobs:` in its frontmatter. It is stale
 * when one of those files was committed after the page itself: the code moved and the page
 * did not. The answer comes from git's history alone — no stored hash, no step that has to be
 * run to say "I reviewed this" (committing the page, even unchanged in meaning, says it).
 *
 * Opt-in by page: a site that uses no `sourceGlobs` pays nothing, not even a `git` process.
 */

/** Told of every git process this module starts — what lets a test hold the number of them to a bound. */
type GitObserver = (args: readonly string[]) => void;

/** One `sourceGlobs` entry, and when git last saw a file it names change (seconds since the epoch). */
export interface SourceTime {
  glob: string;
  /** `undefined`: no file git has committed matches. */
  time: number | undefined;
}

/** What is known about one page that names its sources. */
export interface PageFreshness {
  /** What kept the page from being judged at all (a value that is not a list of paths, say). */
  problems: string[];
  /** When git last committed the page; `undefined` for a page it has no commit of. */
  pageTime: number | undefined;
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

/** When git last committed a change to anything `pathspec` names, relative to `cwd`; `undefined` for none. */
async function lastCommitTime(pathspec: string, cwd: string, observe?: GitObserver): Promise<number | undefined> {
  const args = ["log", "-1", "--format=%ct", "--", pathspec];
  observe?.(args);
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    const seconds = Number.parseInt(stdout.trim(), 10);
    return Number.isNaN(seconds) ? undefined : seconds;
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
      pages.set(page, { problems: [patterns.problem], pageTime: undefined, sources: [] });
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

  const globTimes = new Map<string, number | undefined>();
  const distinct = [...new Set([...asked.values()].flat())];
  await inParallel(distinct, async (glob) => {
    globTimes.set(glob, await lastCommitTime(`:(glob)${glob}`, root, observe));
  });
  const askedPages = [...asked.keys()];
  const pageTimes = await inParallel(askedPages, (page) => lastCommitTime(`:(literal)${page}`, root, observe));
  askedPages.forEach((page, index) => {
    pages.set(page, {
      problems: [],
      pageTime: pageTimes[index],
      sources: (asked.get(page) ?? []).map((glob) => ({ glob, time: globTimes.get(glob) })),
    });
  });
  return { pages };
}

const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

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
    for (const { glob, time } of known.sources) {
      if (time === undefined && freshness.withheld === undefined) {
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
    if (known.pageTime === undefined) continue;
    const newer = known.sources.filter(({ time }) => time !== undefined && time > (known.pageTime as number));
    if (newer.length === 0) continue;
    findings.push({
      kind: "a-page-is-older-than-the-sources-it-documents",
      level: "warning",
      page,
      message:
        `${page}: last committed ${day(known.pageTime)}, but what it documents changed since — ` +
        newer.map(({ glob, time }) => `${glob} (${day(time as number)})`).join(", "),
    });
  }
  return findings;
}
