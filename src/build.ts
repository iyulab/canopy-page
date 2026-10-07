import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assembleScript, assembleStylesheet } from "./assets-bundle.js";
import { runCanopy } from "./canopy.js";
import { siteFindings } from "./check.js";
import { feedDirs } from "./layout.js";
import { resolveLastmods } from "./lastmod.js";
import { listHtmlFiles, robotsTxt, sitemapXml } from "./sitemap.js";
import { loadSite, reportFindings, SEARCH_INDEX_PATH } from "./site.js";
import { publishingExcludes } from "./vault.js";

/**
 * Building a site: check first, then hand the whole of it to canopy in one pass.
 *
 * Checking before building is the order every documentation set that has been
 * burned by this arrives at. A broken reference costs nothing to find now and
 * is expensive to find after deployment, where it presents as a reader hitting
 * a 404 rather than as a build saying which line is wrong.
 */

/** Where a build reads from and writes to. */
export interface BuildOptions {
  /** Directory holding the settings file. */
  dir: string;
  /** Directory to write the site into. */
  out: string;
}

/** Assembled search/UI assets, written to real files so canopy's CLI can read them. */
export interface SearchAssets {
  /** Absolute path to canopy-page's own layered stylesheet (search, scrollspy, lightbox). */
  stylesheetPath: string;
  /** Absolute path to the assembled client script (search, scrollspy, ...). */
  scriptPath: string;
}

/**
 * Translate settings into canopy's arguments.
 *
 * Everything a settings file says about the site itself is already something
 * canopy takes: this is a translation, not a layer of behaviour of its own. The
 * navigation spec and `searchAssets` are the things that have to be materialized
 * first, since canopy reads all three from files.
 */
export function canopyArgs(
  site: Awaited<ReturnType<typeof loadSite>>,
  out: string,
  navPath: string | undefined,
  searchAssets: SearchAssets,
  layoutPath?: string,
): string[] {
  const { settings } = site;
  return [
    "build",
    site.root,
    out,
    ...(settings.title === undefined ? [] : ["--site-title", settings.title]),
    ...(settings.description === undefined ? [] : ["--site-description", settings.description]),
    // The same URL the sitemap below is written against, so canopy's canonical
    // tags and the sitemap's entries name each page by one string.
    ...(settings.siteUrl === undefined ? [] : ["--site-url", settings.siteUrl]),
    ...(settings.previewImage === undefined ? [] : ["--site-image", settings.previewImage]),
    ...Object.entries(settings.alternates ?? {}).flatMap(([hreflang, url]) => [
      "--alternate",
      `${hreflang}=${url}`,
    ]),
    ...(settings.lang === undefined ? [] : ["--lang", settings.lang]),
    ...(settings.colorScheme === undefined ? [] : ["--color-scheme", settings.colorScheme]),
    ...(settings.icon === undefined ? [] : ["--site-icon", settings.icon]),
    // canopy-page's own CSS, always — no settings field for it, matching the
    // minimal-configuration principle — carried in from outside the site.
    "--stylesheet",
    searchAssets.stylesheetPath,
    // The site's own styles are published files, linked where they stand (so a
    // relative url() inside one resolves as written) and after everything else.
    ...(settings.styles ?? []).flatMap((style) => ["--site-stylesheet", style]),
    ...(settings.logo === undefined ? [] : ["--site-logo", settings.logo]),
    ...(settings.home === undefined
      ? []
      : ["--home-url", settings.home.url, "--home-label", settings.home.label]),
    ...(settings.strings === undefined ? [] : ["--strings", JSON.stringify(settings.strings)]),
    ...(navPath === undefined ? [] : ["--nav", navPath]),
    ...(layoutPath === undefined ? [] : ["--layout", layoutPath]),
    // Always on, same reasoning as canopy-page's stylesheet above: a search index and the
    // script that searches it are canopy-page's own contribution, not a site
    // author's choice to make.
    "--search-index",
    SEARCH_INDEX_PATH,
    "--script",
    searchAssets.scriptPath,
    // The same list the check's listing ran against (see vault.ts), so what
    // was checked is what ships.
    ...publishingExcludes(settings).flatMap((pattern) => ["--exclude", pattern]),
    ...(settings.rehypePlugins ?? []).flatMap((specifier) => ["--rehype-plugin", specifier]),
    ...feedDirs(settings).flatMap((dir) => ["--feed", dir]),
  ];
}

/** Build the site in `dir` into `out`, returning the exit code to leave with. */
export async function buildSite({ dir, out }: BuildOptions): Promise<number> {
  // Given the output directory, the view is the build's own: an output inside
  // the site from an earlier build is not part of the site.
  const site = await loadSite(dir, out);
  // The same checks `check` runs, on the same view of the site, so a build can
  // never publish something a passing check said was sound.
  if (reportFindings(siteFindings(site))) return 1;

  // The spec is derived from settings and means nothing on its own, so it lives
  // in a temporary file rather than in the site or its output: writing it beside
  // the source would leave a generated file for someone to edit by hand, and
  // writing it into the output would ship it. The assembled script/CSS are
  // temporary for the same reason — they are canopy-page's own contribution,
  // not something a site author edits or that belongs in the output tree.
  const workDir = await mkdtemp(path.join(tmpdir(), "canopy-page-"));
  try {
    let navPath: string | undefined;
    if (site.nav.spec !== undefined) {
      navPath = path.join(workDir, "nav.json");
      await writeFile(navPath, JSON.stringify(site.nav.spec, null, 2), "utf8");
    }

    let layoutPath: string | undefined;
    if (site.layout !== undefined) {
      layoutPath = path.join(workDir, "layout.json");
      await writeFile(layoutPath, JSON.stringify(site.layout, null, 2), "utf8");
    }

    const stylesheetPath = path.join(workDir, "canopy-page.css");
    await writeFile(stylesheetPath, await assembleStylesheet(), "utf8");

    const scriptPath = path.join(workDir, "script.js");
    await writeFile(scriptPath, await assembleScript(site.settings.strings?.searchFailed), "utf8");

    const code = await runCanopy(
      canopyArgs(site, path.resolve(out), navPath, { stylesheetPath, scriptPath }, layoutPath),
    );
    // Only after canopy succeeded, and only over what it actually wrote: a
    // sitemap listing pages a failed build never produced would be a lie a
    // crawler acts on.
    if (code === 0 && site.settings.siteUrl !== undefined) {
      const outDir = path.resolve(out);
      const pages = await listHtmlFiles(outDir);
      const { byPath: lastmodByPath, shallowClone } = await resolveLastmods(site.root, pages);
      if (shallowClone) {
        console.warn(
          "warning: this checkout is a shallow git clone, so a page's last commit date cannot " +
            "be trusted (every untouched page would report the same boundary date); " +
            "sitemap.xml is written without <lastmod>",
        );
      }
      await writeFile(
        path.join(outDir, "sitemap.xml"),
        sitemapXml(
          site.settings.siteUrl,
          pages,
          {
            ...(site.settings.lang === undefined ? {} : { lang: site.settings.lang }),
            ...(site.settings.alternates === undefined ? {} : { alternates: site.settings.alternates }),
          },
          lastmodByPath,
        ),
        "utf8",
      );
      // A site's own robots.txt is its author's policy, published as written;
      // canopy-page writes one only for a site that has none.
      if (!site.index.assets.some((asset) => asset.toLowerCase() === "robots.txt")) {
        await writeFile(path.join(outDir, "robots.txt"), robotsTxt(site.settings.siteUrl), "utf8");
      }
      console.log(`canopy-page: sitemap.xml with ${pages.length} page(s)`);
    }
    return code;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
