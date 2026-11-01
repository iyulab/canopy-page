import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { frontmatterDate, parseFrontmatter } from "@iyulab/canopy";

const execFileAsync = promisify(execFile);

/**
 * Resolving each page's `<lastmod>`.
 *
 * A sitemap's `<lastmod>` is a claim about when a page actually changed, and a
 * wrong claim is worse than none: a crawler that trusts a stale or fabricated
 * date has no reason to revisit a page that did change. The only two sources
 * honest enough to publish are a page's own frontmatter, when the author named
 * a date, and its source markdown's last git commit otherwise. Anything else —
 * a file's mtime, the build's own clock — describes the filesystem or the
 * build, not the page.
 */

/** A page's own `updated:` frontmatter date, when it names one. */
async function frontmatterUpdated(absPath: string): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await readFile(absPath, "utf8");
  } catch {
    // No source file at this path — canopy's synthetic root index.html, or a
    // page whose source moved. Nothing to read frontmatter from.
    return undefined;
  }
  // canopy's own rule for what is a date, so a page the renderer dates is the
  // page the sitemap dates. A sitemap names the day only.
  return frontmatterDate(parseFrontmatter(raw).data.updated)?.slice(0, 10);
}

/** Told of every git process this module starts — what lets a test hold the number of them to a bound. */
type GitObserver = (args: readonly string[]) => void;

/** The date (YYYY-MM-DD) git last recorded a change to `file`, or undefined when it has none. */
async function lastCommitDate(file: string, cwd: string, observe?: GitObserver): Promise<string | undefined> {
  try {
    const args = ["log", "-1", "--format=%cs", "--", file];
    observe?.(args);
    const { stdout } = await execFileAsync("git", args, {
      cwd,
    });
    const date = stdout.trim();
    return date === "" ? undefined : date;
  } catch {
    // Not a git repository, or the file is untracked — indistinguishable from
    // here, and both mean the same thing: no date to publish.
    return undefined;
  }
}

/**
 * Whether git would print `file` quoted. Git quotes a path holding a double quote, a backslash or a
 * control character (even with `core.quotePath=false`, which only spares the bytes above ASCII), and
 * a quoted name cannot be matched to the page it came from without undoing git's escaping.
 */
function gitQuotes(file: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what git quotes
  return /["\\\u0000-\u001f\u007f]/.test(file);
}

/**
 * The last commit date of every file in `wanted` (paths relative to `cwd`, `/`-separated), read from
 * ONE `git log` of the history under `cwd` instead of one process per file — a process per file was
 * ~95 s of a 105 s build of a thousand posts on Windows. History is read newest first, so the first
 * commit that lists a file is its last; the read stops as soon as every wanted file has one.
 *
 * `undefined` when git cannot read the history (not a repository, or no commit yet): the caller then
 * has no dates to publish, the same answer a failing per-file `git log` gave.
 */
async function lastCommitDates(
  cwd: string,
  wanted: ReadonlySet<string>,
  observe?: GitObserver,
): Promise<Map<string, string> | undefined> {
  const args = [
    "-c",
    "core.quotePath=false",
    "log",
    "--no-color",
    "--format=%x01%cs",
    "--name-only",
    "--relative",
    "--",
    ".",
  ];
  observe?.(args);
  return new Promise((resolve) => {
    const found = new Map<string, string>();
    if (wanted.size === 0) return resolve(found);
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
    let date = "";
    let pending = "";
    let done = false;
    let stoppedEarly = false;
    const finish = (value: Map<string, string> | undefined) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const take = (line: string) => {
      if (line.startsWith("\u0001")) {
        date = line.slice(1).trim();
      } else if (line !== "" && date !== "" && wanted.has(line) && !found.has(line)) {
        found.set(line, date);
      }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) take(line.replace(/\r$/, ""));
      if (found.size === wanted.size && !stoppedEarly) {
        // Everything asked for is dated; the rest of the history cannot change an answer. The answer
        // waits for the process to be gone ("close"): a git still dying holds its working directory.
        stoppedEarly = true;
        child.kill();
      }
    });
    child.on("error", () => finish(undefined));
    child.on("close", (code) => {
      if (pending !== "") take(pending.replace(/\r$/, ""));
      finish(stoppedEarly || code === 0 ? found : undefined);
    });
  });
}

/**
 * Whether the repository containing `cwd` is a shallow clone.
 *
 * A shallow clone's history stops at an arbitrary boundary commit. A page last
 * touched before that boundary reports the boundary commit's date instead of
 * its own — so every such page would carry the same `<lastmod>`, which reads
 * to a crawler as "all of these changed together" when in fact none of them
 * did. That false agreement is worse than publishing nothing.
 */
export async function isShallowClone(cwd: string, observe?: GitObserver): Promise<boolean> {
  try {
    const args = ["rev-parse", "--is-shallow-repository"];
    observe?.(args);
    const { stdout } = await execFileAsync("git", args, {
      cwd,
    });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/** Every page a `<lastmod>` could be found for, and whether it was suppressed for being unsafe to trust. */
export interface Lastmods {
  /** htmlPath → date, for pages a date was found for. */
  byPath: Record<string, string>;
  /** True when dates were withheld entirely because the clone is shallow. */
  shallowClone: boolean;
}

/**
 * Resolve `<lastmod>` for each published page.
 *
 * `htmlPaths` are site paths as `listHtmlFiles` returns them; each is mapped
 * back to the source markdown `toSitePath` produced it from
 * (`toSitePath`'s only transform is `.md` → `.html`, so the inverse is exact).
 * A path with no such source — canopy's synthetic root `index.html` when a
 * site has none of its own — is left out rather than guessed at.
 */
export async function resolveLastmods(
  siteRoot: string,
  htmlPaths: readonly string[],
  observe?: GitObserver,
): Promise<Lastmods> {
  if (await isShallowClone(siteRoot, observe)) {
    return { byPath: {}, shallowClone: true };
  }
  const byPath: Record<string, string> = {};
  const needGit: { htmlPath: string; mdPath: string }[] = [];
  for (const htmlPath of htmlPaths) {
    if (!htmlPath.toLowerCase().endsWith(".html")) continue;
    const mdPath = htmlPath.replace(/\.html$/i, ".md");
    const fromFrontmatter = await frontmatterUpdated(path.join(siteRoot, mdPath));
    if (fromFrontmatter !== undefined) byPath[htmlPath] = fromFrontmatter;
    else needGit.push({ htmlPath, mdPath });
  }
  const plain = needGit.filter(({ mdPath }) => !gitQuotes(mdPath));
  const dates = await lastCommitDates(siteRoot, new Set(plain.map(({ mdPath }) => mdPath)), observe);
  if (dates === undefined) return { byPath, shallowClone: false };
  for (const { htmlPath, mdPath } of needGit) {
    const date = gitQuotes(mdPath) ? await lastCommitDate(mdPath, siteRoot, observe) : dates.get(mdPath);
    if (date !== undefined) byPath[htmlPath] = date;
  }
  return { byPath, shallowClone: false };
}
