import type { Settings, SettingsNavItem, SettingsSection } from "./settings.js";
import type { PageIndex } from "./vault.js";

/**
 * Translate a settings file into the navigation spec canopy consumes.
 *
 * Settings speak in the author's terms — sections of a site, a release log that
 * reads newest-first, a folder listed page by page. Canopy consumes one flat
 * spec of ordered items and knows nothing about where it came from. This module
 * is the whole of the translation between the two, which is what keeps the
 * author's vocabulary out of canopy and canopy's out of the settings file.
 *
 * ## What is derived, and by whom
 *
 * Only what the author wrote is translated here. Everything a section does not
 * list is left to canopy: each section becomes a spec group that `derive`s its
 * directory — canopy places the pages there that the settings did not, by its
 * own rules — and pages outside every section are appended by canopy
 * (`unplaced: "append"`). No derivation rule is restated on this side.
 *
 * When settings ask for no ordering at all, no spec is emitted and canopy
 * derives navigation itself.
 */

/** The navigation spec canopy reads from `--nav`: items in display order. */
export interface NavSpec {
  items: NavSpecItem[];
  /** Pages the spec places nowhere: appended by canopy rather than left out. */
  unplaced?: "report" | "append";
}

/** One spec entry: a page (`path`), a group (`items`), or a group with its own page. */
export interface NavSpecItem {
  label?: string;
  path?: string;
  items?: NavSpecItem[];
  /** A directory whose pages canopy derives into this group, after `items`. */
  derive?: string;
  /** File-name order of the derived part. */
  order?: "asc" | "desc";
}

/** What the translation produced, and what it could not place. */
export interface NavTranslation {
  /** The spec to pass to canopy, or `undefined` to let canopy derive navigation. */
  spec?: NavSpec;
  /** Settings references that match no page in the site. */
  missing: string[];
  /** Published pages no section covers. */
  orphans: string[];
  /** Pages the settings place more than once. */
  duplicates: string[];
  /**
   * Top-level section paths labeled by their own directory name because the
   * settings file wrote no `label` and the section has no index page to name
   * it instead — see `NavReport.rawSlugLabels` for why this is scoped to
   * sections rather than every subdirectory that falls back the same way.
   */
  rawSlugLabels: string[];
}

/** The page a directory is entered by, if it has one. */
function indexOf(dir: string, index: PageIndex): string | undefined {
  return index.resolve(dir === "" ? "index" : `${dir}/index`);
}

function stemOf(pagePath: string): string {
  return (pagePath.split("/").pop() ?? pagePath).replace(/\.md$/i, "");
}

function lastSegment(dir: string): string {
  return dir.split("/").pop() ?? dir;
}

/** Pages directly inside a directory, excluding nested ones. */
function pagesDirectlyIn(dir: string, pages: readonly string[]): string[] {
  const prefix = dir === "" ? "" : `${dir}/`;
  return pages.filter((page) => {
    if (!page.toLowerCase().startsWith(prefix.toLowerCase())) return false;
    return !page.slice(prefix.length).includes("/");
  });
}

/** Pages anywhere beneath a directory. */
function pagesUnder(dir: string, pages: readonly string[]): string[] {
  const prefix = `${dir.toLowerCase()}/`;
  return pages.filter((page) => page.toLowerCase().startsWith(prefix));
}

function byStem(order: "asc" | "desc"): (a: string, b: string) => number {
  const direction = order === "desc" ? -1 : 1;
  return (a, b) => direction * stemOf(a).localeCompare(stemOf(b), undefined, { sensitivity: "base" });
}

function byName(order: "asc" | "desc"): (a: string, b: string) => number {
  const direction = order === "desc" ? -1 : 1;
  return (a, b) => direction * a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** What a translation pass records as it places pages. */
interface NavReport {
  missing: string[];
  place: (page: string) => void;
  isPlaced: (page: string) => boolean;
  /**
   * The index page of the section being expanded, which its heading already
   * links. Naming it in `items` asks for what is there, so it is not a second
   * placement — the same conclusion `expandGlob` reaches by filtering.
   */
  sectionIndex?: string;
  /**
   * Top-level section paths whose label is the section's own directory name,
   * because the settings file wrote no `label` and the section has no index
   * page to name it instead — `translateSection`'s only source for the
   * fallback. Reported so an author sees it rather than a raw path segment
   * silently becoming a sidebar's top-level heading (see `navFindings`).
   * Scoped to sections, not every derived subdirectory canopy also names
   * this way: a subdirectory with no index page is an ordinary, expected
   * grouping, while a raw slug at the section level sits at a far more
   * visible spot in the sidebar.
   */
  rawSlugLabels: string[];
}

/** Expand one settings entry, which may be a page, a glob, or a group. */
function expandItem(
  item: SettingsNavItem,
  index: PageIndex,
  report: NavReport,
): NavSpecItem[] {
  const children = item.items?.flatMap((child) => expandItem(child, index, report));

  if (item.path === undefined) {
    return [{ ...(item.label === undefined ? {} : { label: item.label }), items: children ?? [] }];
  }

  if (item.path.includes("*")) {
    // A glob stands for the pages it matches, so it expands in place rather
    // than becoming a node of its own — `guide/settings/*` means those pages,
    // not a group containing them.
    //
    // It means the pages there that are not placed already, which is what makes
    // `["guide/install", "guide/*"]` read the way it looks: this page first,
    // then the rest. It also keeps a section from listing its own index page a
    // second time, since the section's label already links it.
    const matched = expandGlob(item.path, index).filter((page) => !report.isPlaced(page));
    if (matched.length === 0) report.missing.push(item.path);
    for (const page of matched) report.place(page);
    return matched.map((page) => ({ path: page }));
  }

  // The section heading is already a link to its index page, so listing it again
  // would show one page twice under two names. A glob reaches this by filtering
  // what is placed; an explicit mention is the same request spelled out, and
  // used to come back as "placed more than once" — a contradiction to an author
  // who named it once.
  if (report.sectionIndex !== undefined && index.resolve(item.path) === report.sectionIndex) {
    return children === undefined ? [] : children;
  }

  const resolved = index.resolve(item.path);
  if (resolved === undefined) {
    report.missing.push(item.path);
    // A group survives losing its own page; a leaf has nothing left to show.
    if (children === undefined) return [];
    return [{ ...(item.label === undefined ? {} : { label: item.label }), items: children }];
  }
  report.place(resolved);
  return [
    {
      ...(item.label === undefined ? {} : { label: item.label }),
      path: resolved,
      ...(children === undefined ? {} : { items: children }),
    },
  ];
}

/**
 * Expand a glob into pages, in file-name order.
 *
 * Two shapes, matching how small the exclusion dialect is kept: `dir/*` is the
 * pages directly in a directory, `dir/**` is every page beneath it.
 */
function expandGlob(pattern: string, index: PageIndex): string[] {
  const normalized = pattern.replace(/\\/g, "/");
  if (normalized.endsWith("/**")) {
    return pagesUnder(normalized.slice(0, -3), index.pages).sort(byName("asc"));
  }
  if (normalized.endsWith("/*")) {
    return pagesDirectlyIn(normalized.slice(0, -2), index.pages).sort(byStem("asc"));
  }
  // Any other use of `*` is a pattern this does not implement, and matching
  // nothing would look like a site with missing pages rather than a settings
  // file using a shape that was never supported.
  return [];
}

function translateSection(
  section: SettingsSection,
  index: PageIndex,
  report: NavReport,
): NavSpecItem {
  const sectionIndex = indexOf(section.path, index);
  if (sectionIndex !== undefined) report.place(sectionIndex);

  const items = (section.items ?? []).flatMap((item) =>
    expandItem(item, index, { ...report, sectionIndex }),
  );

  if (sectionIndex === undefined && items.length === 0 && pagesUnder(section.path, index.pages).length === 0) {
    report.missing.push(section.path);
  }

  // Same rule as a derived directory: the page fronting a section names it, and
  // only a section with no index page needs a name written for it here. A label
  // in the settings file still wins — that is what writing one is for.
  const usesRawSlugLabel = section.label === undefined && sectionIndex === undefined;
  if (usesRawSlugLabel) report.rawSlugLabels.push(section.path);
  const label = section.label ?? (usesRawSlugLabel ? lastSegment(section.path) : undefined);

  return {
    ...(label === undefined ? {} : { label }),
    ...(sectionIndex === undefined ? {} : { path: sectionIndex }),
    items,
    // Whatever the section does not list, canopy fills in from its directory.
    // The order is always by file name — what an author sees in the folder
    // they are ordering, and what `order` has always meant here — ascending
    // unless the section asks otherwise.
    derive: section.path,
    order: section.order ?? "asc",
  };
}

/**
 * Turn settings plus the site's pages into the spec canopy builds from.
 *
 * Pages no section mentions are appended rather than dropped — inside their own
 * section when they have one, after the sections when they do not. A page that
 * exists but cannot be reached is a worse outcome than one shown in an order
 * nobody chose, and an author who lists three pages of a folder and forgets the
 * fourth is describing an oversight, not a decision to hide it. They are
 * reported as orphans either way, so the author can say which they meant.
 */
export function translateNav(settings: Settings, index: PageIndex): NavTranslation {
  const sections = settings.sections ?? [];
  if (sections.length === 0) {
    return { missing: [], orphans: [], duplicates: [], rawSlugLabels: [] };
  }

  const placements = new Map<string, number>();
  const missing: string[] = [];
  const rawSlugLabels: string[] = [];
  const place = (page: string): void => {
    placements.set(page, (placements.get(page) ?? 0) + 1);
  };
  const report: NavReport = {
    missing,
    place,
    isPlaced: (page) => placements.has(page),
    rawSlugLabels,
  };

  const items = sections.map((section) => translateSection(section, index, report));

  // The root index is the site's home page: it is reached without navigation, so
  // it is neither placed by a section nor counted as something nobody placed.
  // A section that lists nothing covers its whole directory; a page anywhere
  // else the settings do not mention is an orphan — placed all the same (by
  // canopy, inside the section whose directory holds it, else after the
  // sections) and reported, so the author can say which they meant.
  const homePage = indexOf("", index);
  const covered = sections
    .filter((section) => section.items === undefined)
    .map((section) => `${section.path.toLowerCase()}/`);
  const orphans = index.pages.filter(
    (page) =>
      !placements.has(page) &&
      page !== homePage &&
      !covered.some((prefix) => page.toLowerCase().startsWith(prefix)),
  );

  if (homePage !== undefined) {
    // Home first: it is where a reader lands, so it reads oddly anywhere else.
    items.unshift({ path: homePage });
  }

  const duplicates = [...placements.entries()]
    .filter(([, count]) => count > 1)
    .map(([page]) => page)
    .sort();

  return { spec: { items, unplaced: "append" }, missing, orphans, duplicates, rawSlugLabels };
}
