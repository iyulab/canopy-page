import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assembleScript, assembleTokensCss } from "./assets-bundle.js";
import { runCanopy } from "./canopy.js";
import { siteFindings } from "./check.js";
import { listHtmlFiles, robotsTxt, sitemapXml } from "./sitemap.js";
import { loadSite, reportFindings } from "./site.js";

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
  /** Absolute path to the assembled tokens CSS (a site's own tokens, plus canopy-page's). */
  tokensCssPath: string;
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
): string[] {
  const { settings } = site;
  return [
    "build",
    site.root,
    out,
    ...(settings.title === undefined ? [] : ["--site-title", settings.title]),
    ...(settings.description === undefined ? [] : ["--site-description", settings.description]),
    ...(settings.lang === undefined ? [] : ["--lang", settings.lang]),
    ...(settings.icon === undefined ? [] : ["--site-icon", settings.icon]),
    // Always present: canopy-page's own CSS (search, scrollspy) rides here
    // whether or not the site names a tokens file of its own (assembleTokensCss
    // folds one into the other before this ever runs) — no settings field for
    // this, matching the minimal-configuration principle Wave 2 already set.
    "--tokens-css",
    searchAssets.tokensCssPath,
    ...(settings.logo === undefined ? [] : ["--site-logo", settings.logo]),
    ...(settings.home === undefined
      ? []
      : ["--home-url", settings.home.url, "--home-label", settings.home.label]),
    ...(navPath === undefined ? [] : ["--nav", navPath]),
    // Always on, same reasoning as --tokens-css above: a search index and the
    // script that searches it are canopy-page's own contribution, not a site
    // author's choice to make.
    "--search-index",
    "search-index.json",
    "--script",
    searchAssets.scriptPath,
    // The settings file is configuration rather than content, and canopy has no
    // reason to know it exists; excluding it keeps it off the published site.
    ...["--exclude", "settings.json"],
    // Configuration, not content — the same reason settings.json is excluded.
    // Without this the same CSS ships twice: once folded into tokens.css by
    // assembleTokensCss, once copied as a plain asset.
    ...(settings.tokens === undefined ? [] : ["--exclude", settings.tokens]),
    ...(settings.exclude ?? []).flatMap((pattern) => ["--exclude", pattern]),
  ];
}

/** Build the site in `dir` into `out`, returning the exit code to leave with. */
export async function buildSite({ dir, out }: BuildOptions): Promise<number> {
  const site = await loadSite(dir);
  // The same checks `check` runs, on the same view of the site, so a build can
  // never publish something a passing check said was sound.
  if (reportFindings(await siteFindings(site))) return 1;

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

    const userTokensCss =
      site.settings.tokens === undefined
        ? undefined
        : await readFile(path.join(site.root, site.settings.tokens), "utf8");
    const tokensCssPath = path.join(workDir, "tokens.css");
    await writeFile(tokensCssPath, await assembleTokensCss(userTokensCss), "utf8");

    const scriptPath = path.join(workDir, "script.js");
    await writeFile(scriptPath, await assembleScript(), "utf8");

    const code = await runCanopy(
      canopyArgs(site, path.resolve(out), navPath, { tokensCssPath, scriptPath }),
    );
    // Only after canopy succeeded, and only over what it actually wrote: a
    // sitemap listing pages a failed build never produced would be a lie a
    // crawler acts on.
    if (code === 0 && site.settings.siteUrl !== undefined) {
      const outDir = path.resolve(out);
      const pages = await listHtmlFiles(outDir);
      await writeFile(path.join(outDir, "sitemap.xml"), sitemapXml(site.settings.siteUrl, pages), "utf8");
      await writeFile(path.join(outDir, "robots.txt"), robotsTxt(site.settings.siteUrl), "utf8");
      console.log(`canopy-page: sitemap.xml with ${pages.length} page(s)`);
    }
    return code;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
