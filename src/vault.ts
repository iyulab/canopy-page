import { runCanopyForOutput } from "./canopy.js";
import type { Settings } from "./settings.js";

/**
 * Reading the source tree a settings file describes.
 *
 * canopy-page has to see the same files canopy will publish, because everything
 * it does is about them: expanding `guide/*` into pages, reporting a link to a
 * page that does not exist, deciding what a section contains. The checks are
 * only worth anything if the file list they run against is the one that ships,
 * so the list comes from canopy itself (`canopy list`) — the build's own walk —
 * rather than from a restatement of its exclusion rules here.
 */

/**
 * The `--exclude` patterns a build of this site passes canopy.
 *
 * One list for both `build` and the listing a check runs against, so the two
 * cannot disagree about what ships.
 */
export function publishingExcludes(settings: Pick<Settings, "exclude">): string[] {
  return [
    // The settings file is configuration rather than content, and canopy has no
    // reason to know it exists; excluding it keeps it off the published site.
    SETTINGS_FILENAME,
    ...(settings.exclude ?? []),
  ];
}

/** What a site publishes, as canopy answers it. */
export interface SiteListing {
  /** Markdown sources canopy renders into pages — POSIX paths relative to the site root, sorted. */
  pages: string[];
  /** Everything else canopy copies as-is, same form. */
  assets: string[];
  /** Place-naming `exclude` patterns that matched nothing. */
  unusedExcludes: string[];
  /** Site paths of pages canopy writes that have no source — a stream folder's index. */
  generated: string[];
}

/** Ask canopy what a build of `root` with these exclusions would publish. */
export async function listSite(
  root: string,
  exclude: readonly string[] = [],
  layoutPath?: string,
): Promise<SiteListing> {
  const output = await runCanopyForOutput([
    "list",
    root,
    "--json",
    ...exclude.flatMap((pattern) => ["--exclude", pattern]),
    ...(layoutPath === undefined ? [] : ["--layout", layoutPath]),
  ]);
  return JSON.parse(output) as SiteListing;
}

/** The settings file a site is configured by, found at the root of the site. */
export const SETTINGS_FILENAME = "settings.json";

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
  /** Site paths of pages canopy writes without a source (a stream's index), sorted. */
  readonly generated: readonly string[];
}

/** Index a site's listing into pages, assets, and a resolver over its pages. */
export function indexSite({
  pages,
  assets,
  generated = [],
}: Pick<SiteListing, "pages" | "assets"> & { generated?: readonly string[] }): PageIndex {
  const byKey = new Map<string, string>();
  for (const page of pages) {
    byKey.set(toPageKey(page), page);
  }
  return {
    pages,
    assets,
    generated,
    resolve: (reference) => byKey.get(toPageKey(reference)),
  };
}

/**
 * The pages a settings path pattern names: one page however it is spelled,
 * `dir/*` for the pages directly in a directory, or `dir/**` for every page
 * beneath it — the same two glob shapes sections use, compared
 * case-insensitively like every other page path here.
 */
export function pagesMatching(pattern: string, index: PageIndex): string[] {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  const tree = normalized.endsWith("/**");
  if (tree || normalized.endsWith("/*")) {
    const dir = normalized.replace(/\/\*\*?$/, "").toLowerCase();
    return index.pages.filter((page) => {
      const key = page.toLowerCase();
      if (!key.startsWith(`${dir}/`)) return false;
      return tree || !key.slice(dir.length + 1).includes("/");
    });
  }
  const page = index.resolve(normalized);
  return page === undefined ? [] : [page];
}
