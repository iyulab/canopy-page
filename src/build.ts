import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCanopy } from "./canopy.js";
import { siteFindings } from "./check.js";
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

/**
 * Translate settings into canopy's arguments.
 *
 * Everything a settings file says about the site itself is already something
 * canopy takes: this is a translation, not a layer of behaviour of its own. The
 * navigation spec is the one thing that has to be materialized, since canopy
 * reads it from a file.
 */
export function canopyArgs(
  site: Awaited<ReturnType<typeof loadSite>>,
  out: string,
  navPath: string | undefined,
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
    // canopy resolves --tokens-css against the working directory rather than the
    // vault, so it gets an absolute path — unlike --site-icon just above.
    ...(settings.tokens === undefined
      ? []
      : ["--tokens-css", path.join(site.root, settings.tokens)]),
    ...(settings.logo === undefined ? [] : ["--site-logo", settings.logo]),
    ...(settings.home === undefined
      ? []
      : ["--home-url", settings.home.url, "--home-label", settings.home.label]),
    ...(navPath === undefined ? [] : ["--nav", navPath]),
    // The settings file is configuration rather than content, and canopy has no
    // reason to know it exists; excluding it keeps it off the published site.
    ...["--exclude", "settings.json"],
    // Configuration, not content — the same reason settings.json is excluded.
    // Without this the same CSS ships twice: once as tokens.css, once copied.
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
  // writing it into the output would ship it.
  let workDir: string | undefined;
  let navPath: string | undefined;
  try {
    if (site.nav.spec !== undefined) {
      workDir = await mkdtemp(path.join(tmpdir(), "canopy-page-"));
      navPath = path.join(workDir, "nav.json");
      await writeFile(navPath, JSON.stringify(site.nav.spec, null, 2), "utf8");
    }
    return await runCanopy(canopyArgs(site, path.resolve(out), navPath));
  } finally {
    if (workDir !== undefined) await rm(workDir, { recursive: true, force: true });
  }
}
