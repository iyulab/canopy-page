import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  extractReferences,
  isExternalUrl,
  resolveFrom,
  targetPath,
} from "./references.js";
import {
  type Finding,
  type LoadedSite,
  loadSite,
  navFindings,
  reportFindings,
} from "./site.js";
import { toPageKey } from "./vault.js";

/**
 * Checking a site's references before it is published.
 *
 * Every finding here is something a reader would meet as a 404 or a missing
 * image after deployment — the most expensive place to learn about it, and the
 * one where nobody is watching a build log. Finding it costs a directory listing
 * and a read of each page.
 *
 * The checker asks whether *anything* is at the other end of a reference, never
 * which of several candidates the renderer would choose. That question has an
 * answer only the renderer owns, and a checker that answered it differently
 * would report failures on links that build perfectly well.
 */

/** Does anything published sit at this exact path — a page or a copied file? */
function existsInSite(site: LoadedSite, sitePath: string): boolean {
  if (site.index.resolve(sitePath) !== undefined) return true;
  const key = sitePath.toLowerCase();
  return site.index.assets.some((asset) => asset.toLowerCase() === key);
}

/**
 * Does any page answer to this wikilink target?
 *
 * Wikilinks address a note by name or by path, tree-wide. Which note wins when a
 * name is ambiguous is the renderer's rule; whether one exists at all is not, so
 * that is all this asks.
 */
function wikilinkExists(site: LoadedSite, target: string): boolean {
  const key = toPageKey(target);
  if (key.includes("/")) return site.index.resolve(target) !== undefined;
  return site.index.pages.some((page) => toPageKey(page).split("/").pop() === key);
}

/** Check every page's references, returning one finding per broken reference. */
export async function referenceFindings(site: LoadedSite): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const page of site.index.pages) {
    const markdown = await readFile(path.join(site.root, page), "utf8");
    for (const reference of extractReferences(markdown)) {
      const where = `${page}:${reference.line}`;

      if (reference.kind === "wikilink") {
        if (!wikilinkExists(site, reference.target)) {
          findings.push({
            level: "error",
            // Naming the consequence matters: an unresolved wikilink is not left
            // visibly broken, it renders as plain text, so nobody notices.
            message: `${where}: [[${reference.target}]] matches no page, and will render as plain text`,
          });
        }
        continue;
      }

      const url = targetPath(reference.target);
      if (isExternalUrl(url)) continue;
      const resolved = resolveFrom(page, url);
      // A target that walks above the site root addresses something outside it,
      // which the renderer leaves alone and this has no standing to judge.
      if (resolved === undefined || resolved === "") continue;
      if (existsInSite(site, resolved)) continue;

      findings.push({
        level: "error",
        message:
          reference.kind === "image"
            ? `${where}: image "${reference.target}" is not a published file`
            : `${where}: link "${reference.target}" points at nothing published`,
      });
    }
  }

  return findings;
}

/**
 * Everything worth saying about a site, in the order a reader wants it: what
 * the settings got wrong first, then what the pages point at.
 */
export async function siteFindings(site: LoadedSite): Promise<Finding[]> {
  return [...navFindings(site.nav), ...(await referenceFindings(site))];
}

/** Check the site in `dir`, returning the exit code to leave with. */
export async function checkSite(dir: string): Promise<number> {
  const site = await loadSite(dir);
  const findings = await siteFindings(site);
  const failed = reportFindings(findings);
  if (!failed) {
    console.log(
      `canopy-page: ${site.index.pages.length} page(s) checked, nothing broken`,
    );
  }
  return failed ? 1 : 0;
}
