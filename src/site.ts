import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NavTranslation, translateNav } from "./nav.js";
import { parseSettings, SettingsError, type Settings } from "./settings.js";
import { indexSite, listSiteFiles, type PageIndex, SETTINGS_FILENAME } from "./vault.js";

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
}

/** Something worth telling the author about their site. */
export interface Finding {
  /** `error` stops a build; `warning` is reported and the build continues. */
  level: "error" | "warning";
  message: string;
}

/** Read a site directory into settings, files, and a navigation translation. */
export async function loadSite(dir: string): Promise<LoadedSite> {
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

  const index = indexSite(await listSiteFiles(root, settings.exclude));
  return { root, settings, index, nav: translateNav(settings, index) };
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
    findings.push({
      level: "warning",
      message:
        `${nav.orphans.length} page(s) no section covers, placed at the end of their section: ` +
        nav.orphans.join(", "),
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
