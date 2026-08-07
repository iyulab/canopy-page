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

/** Does this pattern name a place, rather than a kind of file? */
function namesAPlace(pattern: string): boolean {
  return !pattern.replace(/^\.\//, "").startsWith("*.");
}

function normalizePattern(pattern: string): string {
  return pattern
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/\*\*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/**
 * Which exclusion patterns did any work, recorded as the site is walked.
 *
 * Asking this afterwards would mean a second walk of the tree with pruning
 * turned off — the one thing pruning exists to avoid, paid on every check. The
 * walk already tests each pattern against each path, so it can say which of them
 * ever answered yes without doing the work twice.
 */
class ExclusionUse {
  private readonly used = new Set<string>();

  constructor(private readonly patterns: readonly string[]) {}

  /** Note every pattern that claims this path. */
  record(filePath: string): boolean {
    let excluded = false;
    for (const pattern of this.patterns) {
      if (!matchesPattern(filePath, pattern)) continue;
      this.used.add(pattern);
      excluded = true;
    }
    return excluded;
  }

  /**
   * A pruned directory is never walked, so a pattern naming something inside it
   * cannot be said to have matched nothing — the tree it spoke about was
   * excluded by a broader rule, which is redundancy rather than a mistake.
   */
  shadow(dirPath: string): void {
    const prefix = `${dirPath.toLowerCase()}/`;
    for (const pattern of this.patterns) {
      if (normalizePattern(pattern).startsWith(prefix)) this.used.add(pattern);
    }
  }

  /**
   * Patterns that left the site exactly as they found it.
   *
   * One that excludes nothing is usually a path written from the wrong place —
   * `_archive` for what is really `docs/_archive` — and it fails the way a
   * mistyped key would: the file looks right and the folder ships anyway.
   *
   * An extension pattern is left out, because it is a different kind of
   * statement. `*.tmp` in a site with no scratch files is a rule about what may
   * never ship, not a claim that something is there to remove.
   */
  unused(): string[] {
    return this.patterns.filter((pattern) => !this.used.has(pattern) && namesAPlace(pattern));
  }
}

async function walk(root: string, rel: string, found: string[], use: ExclusionUse): Promise<void> {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (isSkippedDir(entry.name)) continue;
      // Pruning at the directory keeps an excluded tree from being walked at
      // all, so a large archive costs nothing to skip.
      if (use.record(childRel)) use.shadow(childRel);
      else await walk(root, childRel, found, use);
    } else if (entry.isFile() && !use.record(childRel)) {
      found.push(childRel);
    }
  }
}

/** The files a site publishes, and what its exclusions did to get there. */
export interface SiteListing {
  /** Published files, as POSIX paths relative to the site root, sorted. */
  files: string[];
  /** Place-naming exclusions that matched nothing and shadowed nothing. */
  unusedExclusions: string[];
}

/**
 * List the files a site publishes, as POSIX paths relative to its root, sorted.
 *
 * The settings file itself is not content and never ships: it is configuration
 * that happens to live next to what it configures.
 */
export async function listSite(
  root: string,
  exclude: readonly string[] = [],
  /** Files that configure the site rather than belong to it — never published. */
  configFiles: readonly string[] = [],
): Promise<SiteListing> {
  const found: string[] = [];
  const use = new ExclusionUse(exclude.filter((pattern) => pattern.trim() !== ""));
  await walk(root, "", found, use);
  const config = new Set([SETTINGS_FILENAME, ...configFiles]);
  return {
    files: found.filter((file) => !config.has(file)).sort(),
    unusedExclusions: use.unused(),
  };
}

/** The published files alone, for callers with nothing to say about exclusions. */
export async function listSiteFiles(
  root: string,
  exclude: readonly string[] = [],
): Promise<string[]> {
  return (await listSite(root, exclude)).files;
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
