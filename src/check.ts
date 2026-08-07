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
  settingsFindings,
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

/**
 * A path anchored to wherever the site is served from, rather than to the page.
 *
 * canopy leaves these exactly as written, because only the deployment knows what
 * `/` is. That is a reason not to rewrite one — not a reason to say nothing
 * about it. A site served from the root, which is the ordinary case, resolves
 * these against its own root, and whether anything is there is a question this
 * can answer.
 */
function isRootAbsolute(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/**
 * Does anything published sit at this path — a page, a copied file, or the index
 * page a directory is entered by?
 *
 * A target written with a trailing slash names a directory, and a directory is
 * served by its index page. `/update-note/` is a correct link to a site holding
 * `update-note/index.md`, so reading it as a missing file would report a working
 * link as broken.
 */
function existsInSite(site: LoadedSite, sitePath: string): boolean {
  const directory = sitePath.endsWith("/");
  const bare = directory ? sitePath.replace(/\/+$/, "") : sitePath;
  if (directory) return site.index.resolve(`${bare}/index`) !== undefined;
  if (site.index.resolve(bare) !== undefined) return true;
  const key = bare.toLowerCase();
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

      if (isRootAbsolute(url)) {
        const atRoot = url.replace(/^\/+/, "");
        if (atRoot === "" || existsInSite(site, atRoot)) continue;
        findings.push({
          level: "warning",
          message:
            `${where}: ${reference.kind} "${reference.target}" — ` +
            `nothing is published at "${atRoot}". A root-absolute path resolves ` +
            "against wherever the site is served from, so this is right only if " +
            "something else answers it there",
        });
        continue;
      }

      if (isExternalUrl(url)) continue;
      const resolved = resolveFrom(page, url);
      // A target that walks above the site root addresses something outside it,
      // which the renderer leaves alone and this has no standing to judge.
      if (resolved === undefined || resolved === "") continue;
      // Resolution drops a trailing slash along with the empty segment it makes,
      // and with it the fact that the target named a directory.
      if (existsInSite(site, url.endsWith("/") ? `${resolved}/` : resolved)) continue;

      if (reference.cutAtSpace) {
        findings.push({
          level: "error",
          message:
            `${where}: ${reference.kind} destination stops at a space, so it addresses ` +
            `"${reference.target}" and the rest of the line is left as text. ` +
            "Wrap the path in <> or write the space as %20",
        });
        continue;
      }

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
  return [
    ...settingsFindings(site),
    ...navFindings(site.nav),
    ...(await referenceFindings(site)),
  ];
}

/** Check the site in `dir`, returning the exit code to leave with. */
export async function checkSite(dir: string): Promise<number> {
  const site = await loadSite(dir);
  const findings = await siteFindings(site);
  const failed = reportFindings(findings);
  if (!failed) {
    // "nothing broken" after a screen of warnings reads as a contradiction, so
    // the closing line says which of the two happened.
    const warnings = findings.length;
    console.log(
      `canopy-page: ${site.index.pages.length} page(s) checked, ` +
        (warnings === 0 ? "nothing broken" : `nothing broken, ${warnings} warning(s)`),
    );
  }
  return failed ? 1 : 0;
}
