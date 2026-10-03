import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  decodeLinkPath,
  frontmatterDate,
  isExternalUrl,
  parseFrontmatter,
  parseLinkUrl,
  resolveRelative,
} from "@iyulab/canopy";
import { extractReferences } from "./references.js";
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
 * The mount path `siteUrl` declares, when it says the site stands under a
 * sub-path rather than a domain root.
 *
 * `siteUrl` is the one place settings already say where the site is served
 * from — set today only to address a sitemap, but its path component answers
 * exactly the question a root-absolute reference otherwise leaves open.
 */
function siteBasePath(site: LoadedSite): string | undefined {
  const { siteUrl } = site.settings;
  if (siteUrl === undefined) return undefined;
  // settings.ts only checks the "http(s)://" prefix, which "http://" itself
  // satisfies without naming a host — malformed enough that `new URL` throws.
  // That is a settings mistake for `sitemapXml` to report, not a reason for
  // this unrelated check to crash the whole run.
  let pathname: string;
  try {
    ({ pathname } = new URL(siteUrl));
  } catch {
    return undefined;
  }
  return pathname === "/" ? undefined : pathname;
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
  // Matched the way the renderer matches a link target against its pages:
  // the exact path, case-insensitively — not through `toPageKey`, whose
  // forgiveness (a backslash read as a separator) is for settings references
  // and would pass a link the renderer leaves broken.
  const directory = sitePath.endsWith("/");
  const bare = (directory ? sitePath.replace(/\/+$/, "") : sitePath).toLowerCase();
  const pages = new Set(site.index.pages.map((page) => page.toLowerCase()));
  if (directory) return pages.has(`${bare}/index.md`);
  if (pages.has(bare) || pages.has(`${bare}.md`)) return true;
  if (bare.endsWith(".html") && pages.has(bare.replace(/\.html$/, ".md"))) return true;
  return site.index.assets.some((asset) => asset.toLowerCase() === bare);
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

/**
 * `encodeURIComponent`'s unreserved set — the ASCII characters it leaves
 * alone. Everything else ASCII (a space, `#`, `&`, `?`, …) is the kind of
 * character that lands in a filename by accident — a stray space, a
 * character copied from somewhere that meant it as punctuation, not a path.
 */
const ASCII_URI_SAFE = /^[A-Za-z0-9\-_.!~*'()]$/;

/**
 * True if `segment` contains an ASCII character `encodeURIComponent` would
 * escape. Deliberately blind to non-ASCII: canopy percent-encodes every
 * character outside the unreserved set, which means *any* non-English
 * filename — a Korean directory name, an emoji — would otherwise trip this,
 * and canopy-page's own demo site intentionally ships one (see
 * `examples/site/guide/한국어-예시/`) as a *supported* pattern, not a mistake
 * to flag. An ASCII character in the escaped set, on the other hand, is
 * consistently a slip — nobody names a file "error#messages.md" on purpose.
 */
function hasAsciiEncodingIssue(segment: string): boolean {
  for (const char of segment) {
    const code = char.codePointAt(0);
    if (code !== undefined && code <= 0x7f && !ASCII_URI_SAFE.test(char)) return true;
  }
  return false;
}

/**
 * A published path's segments, exactly where percent-encoding canopy applies
 * to the *link* (never the file, which keeps its raw name) turns out to
 * matter: `relativeHref` (canopy's site-path.ts) encodes each segment with
 * `encodeURIComponent`, so a name with a space or other URL-unsafe character
 * still resolves — a static host serves "error%20messages.html" correctly —
 * but nothing tells the author whether that was intended. Pages become
 * `.html`; every other published file's segments are checked exactly as
 * written, mirroring `toSitePath`'s own "everything but markdown passes
 * through unchanged".
 */
export function filenameEncodingFindings(site: LoadedSite): Finding[] {
  const findings: Finding[] = [];
  for (const file of [...site.index.pages, ...site.index.assets]) {
    const published = file.replace(/\.md$/i, ".html");
    const segments = published.split("/");
    if (!segments.some(hasAsciiEncodingIssue)) continue;
    const href = segments.map((segment) => encodeURIComponent(segment)).join("/");
    findings.push({
      level: "warning",
      message: `${file}: published URL is "${href}" (rename to avoid the encoding, or ignore if intentional)`,
    });
  }
  return findings;
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

      // Where a link points is canopy's rule, applied here through the same
      // functions the renderer calls, so the check cannot disagree with it.
      const url = parseLinkUrl(reference.target).path;

      if (isRootAbsolute(url)) {
        const atRoot = decodeLinkPath(url.replace(/^\/+/, "")) ?? url.replace(/^\/+/, "");
        const resolves = atRoot === "" || existsInSite(site, atRoot);
        const basePath = siteBasePath(site);
        if (resolves && basePath === undefined) continue;
        findings.push({
          level: "warning",
          message: resolves
            ? `${where}: ${reference.kind} "${reference.target}" resolves only when the ` +
              `site is served from the domain root, but settings.siteUrl declares it is ` +
              `mounted under "${basePath}"`
            : `${where}: ${reference.kind} "${reference.target}" — ` +
              `nothing is published at "${atRoot}". A root-absolute path resolves ` +
              "against wherever the site is served from, so this is right only if " +
              "something else answers it there",
        });
        continue;
      }

      if (isExternalUrl(url)) continue;
      // Classified as a URL above, resolved as a path from here — so the
      // encoding an editor wrote is undone only after the cases that are about
      // URL syntax have been answered.
      const decoded = decodeLinkPath(url);
      // An escape the renderer cannot read either: it leaves the link as
      // written, so there is no published target to hold the page to.
      if (decoded === undefined) continue;
      const resolved = resolveRelative(page, decoded);
      // A target that walks above the site root addresses something outside it,
      // which the renderer leaves alone and this has no standing to judge.
      if (resolved === undefined || resolved === "") continue;
      // Resolution drops a trailing slash along with the empty segment it makes,
      // and with it the fact that the target named a directory.
      if (existsInSite(site, decoded.endsWith("/") ? `${resolved}/` : resolved)) continue;

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
    ...filenameEncodingFindings(site),
    ...(await referenceFindings(site)),
    ...(await descriptionFindings(site)),
    ...(await dateFindings(site)),
  ];
}

/**
 * Pages with no `description:` of their own, on a site that is going to be
 * found by search.
 *
 * Such a page falls back to the site's one description, which is harmless for
 * a site nobody searches and a duplicate summary on every result for one that
 * is public. `siteUrl` is the setting that says which of the two this is — the
 * same gate the sitemap already uses — so the warning waits for it rather than
 * asking for a field of its own. One warning naming every such page, one per
 * line, for the same reason `navFindings` lists uncovered pages that way: on a
 * real site the list runs to dozens, and a warning per page would be a wall.
 * Never an error: a site published somewhere but not meant to be found that way
 * is entitled to ignore this.
 *
 * Frontmatter is read with canopy's own parser, so what counts as a
 * description here is exactly what canopy will put in the page.
 */
export async function descriptionFindings(site: LoadedSite): Promise<Finding[]> {
  if (site.settings.siteUrl === undefined) return [];
  const missing: string[] = [];
  for (const page of site.index.pages) {
    const { data } = parseFrontmatter(await readFile(path.join(site.root, page), "utf8"));
    const description = data.description;
    if (typeof description !== "string" || description.trim() === "") missing.push(page);
  }
  if (missing.length === 0) return [];
  return [
    {
      level: "warning",
      message:
        `${missing.length} page(s) have no "description:" in their frontmatter, so search ` +
        "results and link previews show the site's description for each of them:\n" +
        missing.map((page) => `  ${page}`).join("\n"),
    },
  ];
}

/**
 * Dates that will not do what their author meant.
 *
 * Two ways a date goes quietly missing, both read with canopy's own rule
 * (`frontmatterDate`) so what is flagged here is exactly what canopy will and
 * will not treat as dated:
 *
 * - a `date:` or `updated:` that is not a date (`2026-02-30`, `28/09/2026`) —
 *   the page renders as if the line were not there;
 * - a page in a `feed` section with no `date:` — it is left out of the feed,
 *   which a reader following the section never finds out. The section's own
 *   index page is exempt: it describes the series rather than being an entry.
 *
 * Warnings, not errors: an undated page is still a sound page.
 */
export async function dateFindings(site: LoadedSite): Promise<Finding[]> {
  const feedDirs = (site.settings.sections ?? [])
    .filter((section) => section.feed === true)
    .map((section) => section.path.toLowerCase());
  const malformed: string[] = [];
  const undatedInFeed: string[] = [];
  for (const page of site.index.pages) {
    const { data } = parseFrontmatter(await readFile(path.join(site.root, page), "utf8"));
    for (const key of ["date", "updated"] as const) {
      if (data[key] !== undefined && data[key] !== null && frontmatterDate(data[key]) === undefined) {
        malformed.push(`  ${page} (${key}: ${String(data[key])})`);
      }
    }
    const key = page.toLowerCase();
    const inFeed = feedDirs.some((dir) => key.startsWith(`${dir}/`) && key !== `${dir}/index.md`);
    if (inFeed && data.date === undefined) undatedInFeed.push(`  ${page}`);
  }
  const findings: Finding[] = [];
  if (malformed.length > 0) {
    findings.push({
      level: "warning",
      message:
        `${malformed.length} frontmatter date(s) are not dates (expected YYYY-MM-DD, optionally ` +
        "with a time), so those pages render as undated:\n" +
        malformed.join("\n"),
    });
  }
  if (undatedInFeed.length > 0) {
    findings.push({
      level: "warning",
      message:
        `${undatedInFeed.length} page(s) in a feed section have no "date:", so the feed leaves ` +
        "them out:\n" +
        undatedInFeed.join("\n"),
    });
  }
  return findings;
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
