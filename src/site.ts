import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Layout, layoutFragments, type OutputOwner, outputCollisions } from "@iyulab/canopy";
import { feedDirs, layoutSpec, withLayoutFile } from "./layout.js";
import { type NavTranslation, translateNav } from "./nav.js";
import { parseSettings, SettingsError, type Settings } from "./settings.js";
import { indexSite, listSite, type PageIndex, publishingExcludes, SETTINGS_FILENAME } from "./vault.js";

/**
 * Loading a site: settings, the files they describe, and the navigation that
 * falls out of putting the two together.
 *
 * Every command works from this one view, so `build` and a check cannot disagree
 * about what the site contains — a checker that inspects something other than
 * what the build ships is worse than no checker, because it reports confidence
 * it has not earned.
 */

/** Why a site could not be loaded, phrased for whoever runs the command. */
export class SiteError extends Error {}

/** A site read from disk, ready to be checked or built. */
export interface LoadedSite {
  /** Absolute path of the directory holding the settings file. */
  root: string;
  settings: Settings;
  index: PageIndex;
  nav: NavTranslation;
  /** Exclusion patterns that left the site exactly as they found it. */
  unusedExclusions: string[];
  /**
   * Each page's markdown, read once when the site is loaded. Every check reads
   * a page from here rather than from disk, so all of them judge the same text
   * — a file saved halfway through a check (in `watch`, say) cannot have one
   * check see the old version and another the new.
   */
  sources: ReadonlyMap<string, string>;
  /** The layout these settings make (see layout.ts); `undefined` when they set no profile and no regions. */
  layout: Layout | undefined;
  /**
   * Each fragment the layout names, read once like the pages are, by its path
   * as the settings write it. A fragment that could not be read is absent, and
   * `check` says so.
   */
  fragments: ReadonlyMap<string, string>;
}

/** Something worth telling the author about their site. */
export interface Finding {
  /** `error` stops a build; `warning` is reported and the build continues. */
  level: "error" | "warning";
  message: string;
  /** The page the finding is about, when it is about one page's content. */
  page?: string;
}

/**
 * Read a site directory into settings, files, and a navigation translation.
 *
 * `out`, when given, is where a build will write: an output directory inside
 * the site is then not part of it, as canopy's build leaves it out.
 */
export async function loadSite(dir: string, out?: string): Promise<LoadedSite> {
  const root = path.resolve(dir);
  const settingsPath = path.join(root, SETTINGS_FILENAME);

  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SiteError(
        `no ${SETTINGS_FILENAME} in ${root}\n` +
          "A site is configured by that file; run canopy-page in the folder that holds it.",
      );
    }
    throw error;
  }

  let settings: Settings;
  try {
    settings = parseSettings(raw);
  } catch (error) {
    if (error instanceof SettingsError) {
      // Name the file: a message about `sections[0]` is only actionable if the
      // reader knows which file to open.
      throw new SiteError(`${settingsPath}: ${error.message}`);
    }
    throw error;
  }

  // The listing is the build's: with the layout, canopy leaves the fragments
  // out of it and names the index pages it will write.
  const listing = await withLayoutFile(layoutSpec(settings), (file) =>
    listSite(root, publishingExcludes(settings), file, out),
  );
  const index = indexSite(listing);
  settings = inSiteSpelling(settings, index);
  const layout = layoutSpec(settings);
  // Only the author's own patterns are theirs to be told about: the ones
  // canopy-page adds (the settings file, the styles files) name configuration
  // that may legitimately be absent.
  const authored = new Set(settings.exclude ?? []);
  const sources = new Map(
    await Promise.all(
      index.pages.map(async (page) => [page, await readFile(path.join(root, page), "utf8")] as const),
    ),
  );
  const fragments = new Map<string, string>();
  for (const { path: file } of layoutFragments(layout)) {
    try {
      fragments.set(file, await readFile(path.join(root, file), "utf8"));
    } catch {
      // Reported by check (regionFindings), naming the regions that wanted it.
    }
  }
  return {
    root,
    settings,
    index,
    nav: translateNav(settings, index),
    unusedExclusions: listing.unusedExcludes.filter((pattern) => authored.has(pattern)),
    sources,
    layout,
    fragments,
  };
}

/**
 * The settings with each section's directory spelled the way the site's own
 * files spell it. A section is matched to its directory ignoring case, like
 * every path in a site; what the build writes from it — the feed, the sidebar
 * heading, the layout canopy is given — has to lead to the directory as it is,
 * which a host that tells "BLOG" from "blog" apart will not forgive. A
 * directory with nothing in it has no spelling to go by, and keeps the one the
 * settings wrote.
 */
function inSiteSpelling(settings: Settings, index: PageIndex): Settings {
  if (settings.sections === undefined) return settings;
  const files = [...index.pages, ...index.assets];
  return {
    ...settings,
    sections: settings.sections.map((section) => {
      const prefix = `${section.path.toLowerCase()}/`;
      const file = files.find((candidate) => candidate.toLowerCase().startsWith(prefix));
      return file === undefined ? section : { ...section, path: file.slice(0, section.path.length) };
    }),
  };
}

/**
 * What the settings themselves got wrong, beyond what they say about navigation.
 *
 * An exclusion that excluded nothing is a warning rather than an error: the site
 * is publishable and every page in it is sound. What is wrong is that the file
 * claims to hold something back and does not, which the author can only find out
 * by being told.
 */
export function settingsFindings(site: LoadedSite): Finding[] {
  // A stylesheet is linked where the site publishes it, so one that is missing
  // or excluded would be a link to nothing — found here, by `check`, rather
  // than first by the build that needed it.
  const published = new Set(site.index.assets);
  return [
    ...outputFindings(site),
    ...(site.settings.styles ?? [])
      .filter((style) => !published.has(style))
      .map((style) => ({
        level: "error" as const,
        message:
          `settings: styles "${style}" is not a published file (missing, or excluded). ` +
          "Paths are relative to the settings file",
      })),
    ...site.unusedExclusions.map((pattern) => ({
      level: "warning" as const,
      message:
        `settings: exclude "${pattern}" matched nothing, so everything it names is published. ` +
        "Patterns are relative to the settings file",
    })),
  ];
}

/** Where canopy-page has canopy write its search index (see build.ts). */
export const SEARCH_INDEX_PATH = "search-index.json";

/**
 * Site files that would land where the build writes a file of its own.
 *
 * The build writes into the same tree the site's files are copied to, so a
 * site file at one of those paths would replace the build's file or be
 * replaced by it. Canopy refuses that for its own outputs — asked here with
 * the invocation canopy-page's build makes, so the answer is canopy's rather
 * than a list kept beside it, and worded in the settings' terms rather than
 * in flags the author never wrote. `sitemap.xml` is canopy-page's own.
 */
function outputFindings(site: LoadedSite): Finding[] {
  const files = [...site.index.pages, ...site.index.assets];
  const collisions = outputCollisions(files, {
    pages: site.index.pages,
    // canopy-page's own stylesheet and script, and its search index (build.ts).
    stylesheets: 1,
    script: true,
    searchIndexPath: SEARCH_INDEX_PATH,
    feeds: feedDirs(site.settings),
    ...(site.layout ? { layout: site.layout } : {}),
  }).map(({ path: file, owner }) => ({ file, what: describeOutput(owner) }));
  if (site.settings.siteUrl !== undefined) {
    for (const file of site.index.assets) {
      if (file.toLowerCase() === "sitemap.xml") collisions.push({ file, what: "the sitemap" });
    }
  }
  return collisions.map(({ file, what }) => ({
    level: "error" as const,
    message: `${file}: the build writes ${what} at this path, so the site cannot publish a file there — rename or move it`,
  }));
}

function describeOutput(owner: OutputOwner): string {
  switch (owner.kind) {
    case "tokens":
      return "canopy's design tokens";
    case "styles":
      return "canopy's layout stylesheet";
    case "katex":
      return "the stylesheet and fonts math is drawn with";
    case "stylesheet":
      return "canopy-page's own stylesheet";
    case "script":
      return "canopy-page's own script";
    case "search-index":
      return "the search index";
    case "feed":
      return `the feed of section "${owner.dir || "."}"`;
    case "page":
      return `the page rendered from ${owner.page}`;
    case "stream-index":
      return `the index page of stream section "${owner.dir || "."}"`;
  }
}

/**
 * What the navigation translation found, as findings.
 *
 * A reference to a page that does not exist and a page placed twice are both
 * mistakes *in the settings file*: nothing in the site can make them right, so
 * they stop a build. A page no section mentions is different — the site is
 * complete, it is the description that is behind, and the page is placed anyway
 * — so it is said out loud and the build continues.
 */
export function navFindings(nav: NavTranslation): Finding[] {
  const findings: Finding[] = [];
  for (const reference of nav.missing) {
    findings.push({ level: "error", message: `settings: "${reference}" matches no page` });
  }
  for (const page of nav.duplicates) {
    findings.push({ level: "error", message: `settings: "${page}" is placed more than once` });
  }
  if (nav.orphans.length > 0) {
    // One page per line. A real site's uncovered pages run to dozens, and a list
    // joined onto one line is a wall nobody reads to the end of — which loses
    // the whole point of naming them.
    findings.push({
      level: "warning",
      message:
        `${nav.orphans.length} page(s) no section covers, placed at the end of their section:\n` +
        nav.orphans.map((page) => `  ${page}`).join("\n"),
    });
  }
  for (const path of nav.rawSlugLabels) {
    // Publishable either way — canopy-page's own fallback is sound, and the
    // build is not wrong to use it. What is wrong is doing so silently: the
    // directory name it falls back to is written for a filesystem, not a
    // reader, and the author has no other way to find out their sidebar's
    // top-level heading is about to read that way instead of a name they chose.
    const slug = path.split("/").pop() ?? path;
    findings.push({
      level: "warning",
      message:
        `settings: section "${path}" has no "label" and no index page, ` +
        `so its sidebar heading falls back to the directory name "${slug}". ` +
        'Add a "label", or an index page for the section to name itself',
    });
  }
  return findings;
}

/** Print findings in the order given, and report whether any of them stops a build. */
export function reportFindings(findings: readonly Finding[]): boolean {
  for (const finding of findings) {
    if (finding.level === "error") console.error(`error: ${finding.message}`);
    else console.warn(`warning: ${finding.message}`);
  }
  return findings.some((finding) => finding.level === "error");
}
