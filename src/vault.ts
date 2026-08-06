import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Reading the source tree a settings file describes.
 *
 * canopy-page has to see the same files canopy will publish, because everything
 * it does is about them: expanding `guide/*` into pages, reporting a link to a
 * page that does not exist, deciding what a section contains. The checks are
 * only worth anything if the file list they run against is the one that ships.
 *
 * That means the exclusion rules here have to agree with canopy's, and they are
 * stated in canopy's README as the interface they are: dot-prefixed directories
 * and `node_modules` are never published, and caller patterns come in three
 * shapes. Agreeing by restating is a seam — if canopy ever widens its dialect,
 * a check here would quietly disagree with the build. See
 * TODO(upstream: claudedocs/issues/ISSUE-canopy-20260806-published-file-listing.md)
 * for the proposal that would let a consumer ask canopy instead of restating it.
 */

/** Directories whose contents are never published, whatever the settings say. */
function isSkippedDir(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

/**
 * Match a site-relative POSIX path against one exclusion pattern.
 *
 * Supported, and nothing else — the dialect canopy accepts:
 *  - `drafts` or `drafts/**` — that directory and everything beneath it
 *  - `*.tmp` — any file with that extension, at any depth
 *  - `notes/scratch.md` — one exact path
 *
 * Comparison is case-insensitive, so a site behaves the same on a
 * case-insensitive filesystem as in a checkout on a case-sensitive one.
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  const target = filePath.toLowerCase();
  const raw = pattern.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  if (raw === "") return false;
  if (raw.startsWith("*.")) return target.endsWith(raw.slice(1));
  const dir = raw.replace(/\/\*\*$/, "").replace(/\/+$/, "");
  return target === dir || target.startsWith(`${dir}/`);
}

/** Build the "is this path unpublished?" predicate for a set of patterns. */
export function createExcluder(patterns: readonly string[] = []): (filePath: string) => boolean {
  const active = patterns.filter((pattern) => pattern.trim() !== "");
  if (active.length === 0) return () => false;
  return (filePath) => active.some((pattern) => matchesPattern(filePath, pattern));
}

async function walk(
  root: string,
  rel: string,
  found: string[],
  excluded: (filePath: string) => boolean,
): Promise<void> {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      // Pruning at the directory keeps an excluded tree from being walked at
      // all, so a large archive costs nothing to skip.
      if (!isSkippedDir(entry.name) && !excluded(childRel)) {
        await walk(root, childRel, found, excluded);
      }
    } else if (entry.isFile() && !excluded(childRel)) {
      found.push(childRel);
    }
  }
}

/**
 * List the files a site publishes, as POSIX paths relative to its root, sorted.
 *
 * The settings file itself is not content and never ships: it is configuration
 * that happens to live next to what it configures.
 */
export async function listSiteFiles(
  root: string,
  exclude: readonly string[] = [],
): Promise<string[]> {
  const found: string[] = [];
  await walk(root, "", found, createExcluder(exclude));
  return found.filter((file) => file !== SETTINGS_FILENAME).sort();
}

/** The settings file a site is configured by, found at the root of the site. */
export const SETTINGS_FILENAME = "settings.json";

/** Is this a markdown source file — a page rather than an asset? */
export function isPage(filePath: string): boolean {
  return /\.md$/i.test(filePath);
}

/**
 * The key a page is addressed by, from any of the ways one can be written.
 *
 * Settings name pages the way an author thinks of them — `guide/install`,
 * `guide/install.md`, sometimes the published `guide/install.html` — and paths
 * are compared case-insensitively for the same reason exclusions are. Reducing
 * all of those to one key is what lets a reference be resolved once.
 */
export function toPageKey(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\.(md|html)$/i, "")
    .toLowerCase();
}

/** An index of the pages a site publishes, addressable however they are written. */
export interface PageIndex {
  /** Page paths, sorted, as they appear in the source tree. */
  readonly pages: readonly string[];
  /** Resolve any spelling of a page reference to its source path. */
  resolve(reference: string): string | undefined;
  /** Non-markdown files, sorted — images and anything else copied alongside. */
  readonly assets: readonly string[];
}

/** Index the files of a site into pages, assets, and a resolver over them. */
export function indexSite(files: readonly string[]): PageIndex {
  const pages = files.filter(isPage);
  const assets = files.filter((file) => !isPage(file));
  const byKey = new Map<string, string>();
  for (const page of pages) {
    byKey.set(toPageKey(page), page);
  }
  return {
    pages,
    assets,
    resolve: (reference) => byKey.get(toPageKey(reference)),
  };
}
