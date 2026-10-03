import { execFile } from "node:child_process";
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

/** The date (YYYY-MM-DD) git last recorded a change to `file`, or undefined when it has none. */
async function lastCommitDate(file: string, cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%cs", "--", file], {
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
 * Whether the repository containing `cwd` is a shallow clone.
 *
 * A shallow clone's history stops at an arbitrary boundary commit. A page last
 * touched before that boundary reports the boundary commit's date instead of
 * its own — so every such page would carry the same `<lastmod>`, which reads
 * to a crawler as "all of these changed together" when in fact none of them
 * did. That false agreement is worse than publishing nothing.
 */
export async function isShallowClone(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-shallow-repository"], {
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
): Promise<Lastmods> {
  if (await isShallowClone(siteRoot)) {
    return { byPath: {}, shallowClone: true };
  }
  const byPath: Record<string, string> = {};
  for (const htmlPath of htmlPaths) {
    if (!htmlPath.toLowerCase().endsWith(".html")) continue;
    const mdPath = htmlPath.replace(/\.html$/i, ".md");
    const fromFrontmatter = await frontmatterUpdated(path.join(siteRoot, mdPath));
    const date = fromFrontmatter ?? (await lastCommitDate(mdPath, siteRoot));
    if (date !== undefined) byPath[htmlPath] = date;
  }
  return { byPath, shallowClone: false };
}
