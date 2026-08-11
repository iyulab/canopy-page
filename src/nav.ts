import type { Settings, SettingsNavItem, SettingsSection } from "./settings.js";
import { type PageIndex, toPageKey } from "./vault.js";

/**
 * Translate a settings file into the navigation spec canopy consumes.
 *
 * Settings speak in the author's terms — sections of a site, a release log that
 * reads newest-first, a folder listed page by page. Canopy consumes one flat
 * spec of ordered items and knows nothing about where it came from. This module
 * is the whole of the translation between the two, which is what keeps the
 * author's vocabulary out of canopy and canopy's out of the settings file.
 *
 * ## Why a spec has to describe the whole site
 *
 * Canopy applies a spec instead of deriving navigation, not alongside it: pages
 * a spec omits are left out and reported. So ordering one section means naming
 * every other page too, and the pages an author did not order are derived here
 * — a second derivation next to canopy's own, which is duplication with a drift
 * risk rather than a design.
 * TODO(upstream: claudedocs/issues/ISSUE-canopy-20260806-partial-nav-spec.md)
 * proposes the partial spec that would retire it.
 *
 * When settings ask for no ordering at all, no spec is emitted and canopy
 * derives navigation itself — the case where the duplication costs nothing.
 */

/** The navigation spec canopy reads from `--nav`: items in display order. */
export interface NavSpec {
  items: NavSpecItem[];
}

/** One spec entry: a page (`path`), a group (`items`), or a group with its own page. */
export interface NavSpecItem {
  label?: string;
  path?: string;
  items?: NavSpecItem[];
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

/** Immediate subdirectory names of a directory, in the order pages first named them. */
function subdirectoriesOf(dir: string, pages: readonly string[]): string[] {
  const prefix = dir === "" ? "" : `${dir}/`;
  const names = new Set<string>();
  for (const page of pages) {
    if (!page.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    const rest = page.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash > 0) names.add(rest.slice(0, slash));
  }
  return [...names];
}

function byStem(order: "asc" | "desc"): (a: string, b: string) => number {
  const direction = order === "desc" ? -1 : 1;
  return (a, b) => direction * stemOf(a).localeCompare(stemOf(b), undefined, { sensitivity: "base" });
}

function byName(order: "asc" | "desc"): (a: string, b: string) => number {
  const direction = order === "desc" ? -1 : 1;
  return (a, b) => direction * a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Derive the contents of a directory the author did not list.
 *
 * Ordering follows file names rather than frontmatter titles. Canopy's own
 * derivation prefers a title when a page has one, but reading titles means
 * parsing every document, which is canopy's work and not worth duplicating for
 * a sort key. File names are what an author sees in the folder they are
 * ordering, and `desc` on a log of dated files is exactly the case this serves.
 */
function deriveItems(
  dir: string,
  index: PageIndex,
  order: "asc" | "desc",
  place: (page: string) => void,
): NavSpecItem[] {
  const items: NavSpecItem[] = [];
  // Folders before pages, mirroring how canopy derives a tree, so a site that
  // orders one section does not reshuffle the others.
  for (const name of subdirectoriesOf(dir, index.pages).sort(byName(order))) {
    const childDir = dir === "" ? name : `${dir}/${name}`;
    const childIndex = indexOf(childDir, index);
    if (childIndex !== undefined) place(childIndex);
    items.push({
      // A directory with an index page is named by that page — canopy asks the
      // document first and falls back to this same directory name when it has
      // no name of its own. Writing the label here would win over the document
      // every time, which is this file answering a question it already delegates.
      ...(childIndex === undefined ? { label: name } : { path: childIndex }),
      items: deriveItems(childDir, index, order, place),
    });
  }
  const ownIndex = indexOf(dir, index);
  for (const page of pagesDirectlyIn(dir, index.pages).sort(byStem(order))) {
    // A directory's index page is entered through the directory itself, so
    // listing it again would show the same page twice under two names.
    if (page === ownIndex) continue;
    place(page);
    items.push({ path: page });
  }
  return items;
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
   * Scoped to sections, not every derived subdirectory `deriveItems` also
   * falls back this way: a subdirectory with no index page is an ordinary,
   * expected grouping (nav.test.ts pins it as kept behavior), while a raw
   * slug at the section level sits at a far more visible spot in the sidebar.
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

  const items =
    section.items === undefined
      ? deriveItems(section.path, index, section.order ?? "asc", report.place)
      : section.items.flatMap((item) =>
          expandItem(item, index, { ...report, sectionIndex }),
        );

  if (sectionIndex === undefined && items.length === 0) {
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
  };
}

/** A view of the same site narrowed to a subset of its pages. */
function narrowTo(pages: readonly string[], index: PageIndex): PageIndex {
  const keys = new Set(pages.map(toPageKey));
  return {
    pages,
    assets: index.assets,
    resolve: (reference) => (keys.has(toPageKey(reference)) ? index.resolve(reference) : undefined),
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
  const homePage = indexOf("", index);
  const orphans = index.pages.filter((page) => !placements.has(page) && page !== homePage);

  // Leftovers land in the section that covers them, so a partly-listed folder
  // stays one folder in the sidebar instead of appearing a second time at the end.
  let stray = orphans;
  sections.forEach((section, i) => {
    const mine = stray.filter((page) => page.toLowerCase().startsWith(`${section.path.toLowerCase()}/`));
    if (mine.length === 0) return;
    stray = stray.filter((page) => !mine.includes(page));
    const target = items[i];
    if (target === undefined) return;
    target.items = [
      ...(target.items ?? []),
      ...deriveItems(section.path, narrowTo(mine, index), section.order ?? "asc", place),
    ];
  });
  if (stray.length > 0) {
    items.push(...deriveItems("", narrowTo(stray, index), "asc", place));
  }

  if (homePage !== undefined) {
    // Home first: it is where a reader lands, so it reads oddly anywhere else.
    items.unshift({ path: homePage });
  }

  const duplicates = [...placements.entries()]
    .filter(([, count]) => count > 1)
    .map(([page]) => page)
    .sort();

  return { spec: { items }, missing, orphans, duplicates, rawSlugLabels };
}
