import {
  type ControlSlot,
  decodeLinkPath,
  fileNameDate,
  fragmentControls,
  fragmentLinks,
  fragmentProblems,
  frontmatterDate,
  isExternalUrl,
  layoutFragments,
  pageDate,
  pageSlotKeys,
  pageSlotText,
  parseFrontmatter,
  parseLinkUrl,
  resolveMarkdownLink,
  resolvePageLayout,
  resolveRelative,
  streamIndexPath,
  toSitePath,
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
import { pagesMatching, toPageKey } from "./vault.js";

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
 * What is wrong with a root-absolute path, if anything — the rest of a finding
 * after `<kind> "<target>"`.
 *
 * `siteUrl`'s path says where this site stands on its host. A path inside it is
 * this site's own page written absolute: resolved against that mount and
 * checked like any internal link, and a miss is an error, since nothing else
 * can answer it. A path outside it belongs to the host — the product site a
 * blog stands inside — which this check cannot see and does not judge; the one
 * exception is a path this site publishes at its own root, which reads like a
 * link to this site written without its mount.
 *
 * With no mount path (no siteUrl, or one at a domain root) a root-absolute path
 * resolves against wherever the site is served from, so a miss is a warning:
 * something else may answer it there.
 */
function rootAbsoluteProblem(
  site: LoadedSite,
  url: string,
): { level: "error" | "warning"; message: string } | undefined {
  const decode = (value: string): string => decodeLinkPath(value) ?? value;
  const base = siteBasePath(site)?.replace(/\/+$/, "");
  const atRoot = decode(url.replace(/^\/+/, ""));
  if (base !== undefined && base !== "") {
    if (url === base || url.startsWith(`${base}/`)) {
      const inSite = decode(url.slice(base.length).replace(/^\/+/, ""));
      if (inSite === "" || existsInSite(site, inSite)) return undefined;
      return {
        level: "error",
        message: `points at nothing published — under settings.siteUrl's path "${base}/" it addresses "${inSite}"`,
      };
    }
    if (atRoot !== "" && existsInSite(site, atRoot)) {
      return {
        level: "warning",
        message:
          `leaves this site — it is outside settings.siteUrl's path "${base}/" — though this site publishes ` +
          `"${atRoot}"; if that page is meant, write "${base}/${atRoot}" or a relative link`,
      };
    }
    return undefined;
  }
  if (atRoot === "" || existsInSite(site, atRoot)) return undefined;
  return {
    level: "warning",
    message:
      `— nothing is published at "${atRoot}". A root-absolute path resolves against wherever the ` +
      "site is served from, so this is right only if something else answers it there",
  };
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
  return findPublished(site, sitePath) !== undefined;
}

/**
 * The file a target reaches — a page's source, a written index page, or a
 * copied file — and whether the target spells it exactly.
 *
 * Matched the way the renderer matches a link target against its pages: the
 * exact path, case-insensitively — not through `toPageKey`, whose forgiveness
 * (a backslash read as a separator) is for settings references and would pass
 * a link the renderer leaves broken. The renderer writes a link to anything but a
 * page as it was written, so such a target that matches only by ignoring case is
 * published in a spelling most hosts serve nothing at; `exact` says which it is.
 */
function findPublished(site: LoadedSite, sitePath: string): { file: string; exact: boolean } | undefined {
  const directory = sitePath.endsWith("/");
  const written = directory ? sitePath.replace(/\/+$/, "") : sitePath;
  const key = written.toLowerCase();
  const page = (path: string) => site.index.pages.find((candidate) => candidate.toLowerCase() === path);
  // A stream folder's index page canopy writes for it has no source here, but
  // is published all the same.
  const generated = (path: string) => site.index.generated.find((candidate) => candidate.toLowerCase() === path);
  const found = (file: string, spelled: string) => ({ file, exact: spelled === written });
  if (directory) {
    const index = page(`${key}/index.md`) ?? generated(`${key}/index.html`);
    return index === undefined ? undefined : found(index, index.slice(0, written.length));
  }
  const exact = page(key) ?? generated(key);
  if (exact !== undefined) return found(exact, exact);
  const extensionless = page(`${key}.md`);
  if (extensionless !== undefined) return found(extensionless, extensionless.slice(0, -".md".length));
  const rendered = key.endsWith(".html") ? page(key.replace(/\.html$/, ".md")) : undefined;
  if (rendered !== undefined) return found(rendered, `${rendered.slice(0, -".md".length)}.html`);
  const asset = site.index.assets.find((candidate) => candidate.toLowerCase() === key);
  return asset === undefined ? undefined : found(asset, asset);
}

/**
 * The page published at a site path, in the build's spelling — the lookup the
 * renderer matches a markdown link against, over this site's pages and the
 * index pages canopy writes for them.
 */
function sitePage(site: LoadedSite, sitePath: string): string | undefined {
  if (!/\.html$/i.test(sitePath)) return undefined;
  const key = sitePath.toLowerCase();
  const source = site.index.pages.find((candidate) => toSitePath(candidate).toLowerCase() === key);
  return source !== undefined ? toSitePath(source) : site.index.generated.find((candidate) => candidate.toLowerCase() === key);
}

/**
 * Does the renderer match this markdown link to a page? Then it writes the link
 * in the page's own spelling, whatever case it was written in — asked through
 * canopy's own `resolveMarkdownLink`, so the two cannot disagree.
 */
function writtenAsPage(site: LoadedSite, page: string, target: string): boolean {
  const lookup = (sitePath: string) => sitePage(site, sitePath);
  const written = resolveMarkdownLink(toSitePath(page), target, lookup);
  return written !== undefined && lookup(written) === written;
}

/** Why a target that reaches its file only by ignoring letter case is still broken. */
function caseOnlyMessage(kind: string, target: string, file: string): string {
  return (
    `${kind} "${target}" reaches "${file}" only by ignoring letter case — the built page keeps ` +
    `"${target}" as written, which leads nowhere on a host that tells letter case apart`
  );
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
 * `docs/guide/한국어-예시/`) as a *supported* pattern, not a mistake
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
export function referenceFindings(site: LoadedSite): Finding[] {
  const findings: Finding[] = [];

  for (const page of site.index.pages) {
    const markdown = site.sources.get(page) ?? "";
    for (const reference of extractReferences(markdown)) {
      const where = `${page}:${reference.line}`;

      if (reference.kind === "wikilink") {
        if (!wikilinkExists(site, reference.target)) {
          findings.push({
            page,
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
        const problem = rootAbsoluteProblem(site, url);
        if (problem !== undefined) {
          findings.push({
            page,
            level: problem.level,
            message: `${where}: ${reference.kind} "${reference.target}" ${problem.message}`,
          });
        }
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
      const published = findPublished(site, decoded.endsWith("/") ? `${resolved}/` : resolved);
      if (published !== undefined) {
        if (!published.exact && !(reference.kind === "link" && writtenAsPage(site, page, reference.target))) {
          findings.push({
            page,
            level: "error",
            message: `${where}: ${caseOnlyMessage(reference.kind, reference.target, published.file)}`,
          });
        }
        continue;
      }

      if (reference.cutAtSpace) {
        findings.push({
          page,
          level: "error",
          message:
            `${where}: ${reference.kind} destination stops at a space, so it addresses ` +
            `"${reference.target}" and the rest of the line is left as text. ` +
            "Wrap the path in <> or write the space as %20",
        });
        continue;
      }

      findings.push({
        page,
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

/** A fragment link, which is written from the site root, checked the way a build will rewrite it. */
function fragmentLinkProblem(
  site: LoadedSite,
  url: string,
): { level: "error" | "warning"; message: string } | undefined {
  const target = parseLinkUrl(url).path;
  if (isRootAbsolute(target)) {
    const problem = rootAbsoluteProblem(site, target);
    return problem === undefined ? undefined : { level: problem.level, message: `link "${url}" ${problem.message}` };
  }
  if (isExternalUrl(target)) return undefined;
  const decoded = (decodeLinkPath(target) ?? target).replace(/^\.\//, "");
  if (decoded === "") return undefined;
  const published = findPublished(site, decoded);
  if (published !== undefined) {
    return published.exact ? undefined : { level: "error", message: caseOnlyMessage("link", url, published.file) };
  }
  return {
    level: "error",
    message: `link "${url}" points at nothing published (fragment links are written from the site root)`,
  };
}

/**
 * Region fragments and the slots in them, checked the way the build will use
 * them. Each error here would otherwise fail `build` — or, for a link, reach a
 * reader as a 404 — so a check finds it first, and says which file to open.
 * Fragment findings name no page, so `knownBroken` cannot excuse them: a
 * fragment is on every page of its section, not one page being fixed.
 */
export function regionFindings(site: LoadedSite): Finding[] {
  if (site.layout === undefined) return [];
  const findings: Finding[] = [];
  for (const { path: file, regions } of layoutFragments(site.layout)) {
    const html = site.fragments.get(file);
    if (html === undefined) {
      findings.push({
        level: "error",
        message: `settings: region fragment "${file}" is not a file in the site (${regions.join(", ")})`,
      });
      continue;
    }
    for (const region of regions) {
      for (const problem of fragmentProblems(html, region)) {
        findings.push({ level: "error", message: `${file} (${region}): ${problem}` });
      }
    }
    for (const url of fragmentLinks(html)) {
      const problem = fragmentLinkProblem(site, url);
      if (problem !== undefined) findings.push({ level: problem.level, message: `${file}: ${problem.message}` });
    }
  }
  // A page slot is filled from each page it reaches, so each of those pages
  // is read with canopy's own rule for what can fill one.
  for (const page of site.index.pages) {
    const { regions } = resolvePageLayout(site.layout, toSitePath(page));
    const keys = new Set(
      Object.values(regions).flatMap((file) => {
        const html = site.fragments.get(file);
        return html === undefined ? [] : pageSlotKeys(html);
      }),
    );
    if (keys.size === 0) continue;
    const { data } = parseFrontmatter(site.sources.get(page) ?? "");
    for (const key of keys) {
      try {
        pageSlotText(data, key);
      } catch (error) {
        findings.push({ page, level: "error", message: `${page}: ${(error as Error).message}` });
      }
    }
  }
  findings.push(...slotOutletFindings(site));
  // The mirror case: a slot with nothing to show. A site with one colour
  // scheme has no toggle, so a theme-toggle slot is an empty space in the
  // header that looks like a missing control.
  if (site.settings.colorScheme !== undefined) {
    for (const [file, html] of site.fragments) {
      if (fragmentControls(html).includes("theme-toggle")) {
        findings.push({
          level: "warning",
          message:
            `${file}: places <canopy-slot name="theme-toggle">, but settings.colorScheme gives the site one ` +
            "scheme, so there is no toggle — the slot shows nothing",
        });
      }
    }
  }
  return findings;
}

/**
 * Settings that reach pages only through a control slot, shown on none of them.
 *
 * Once a header fragment replaces canopy's top bar, `home` and `logo` show
 * only where a fragment places their slot. A setting accepted and then shown
 * nowhere is the failure strict validation exists to prevent — it looks obeyed
 * and is not — so it is said, naming the headers that leave it out. A setting
 * some pages show is doing its job: a section whose own header leaves it out
 * (a blog in a product site's header, beside docs in canopy-page's top bar)
 * made that choice in its fragment.
 */
function slotOutletFindings(site: LoadedSite): Finding[] {
  if (site.layout === undefined || site.index.pages.length === 0) return [];
  const wanted: { key: string; slot: ControlSlot; what: string }[] = [];
  if (site.settings.home !== undefined) wanted.push({ key: "home", slot: "home", what: "the link" });
  if (site.settings.logo !== undefined) wanted.push({ key: "logo", slot: "site-title", what: "the logo" });
  if (wanted.length === 0) return [];

  const shown = new Set<ControlSlot>();
  const headers = new Map<ControlSlot, Set<string>>();
  for (const page of site.index.pages) {
    const { regions } = resolvePageLayout(site.layout, toSitePath(page));
    if (regions.header === undefined) {
      // canopy's own top bar shows both.
      for (const { slot } of wanted) shown.add(slot);
      continue;
    }
    const placed = Object.values(regions).flatMap((file) => {
      const html = site.fragments.get(file);
      return html === undefined ? [] : fragmentControls(html);
    });
    for (const { slot } of wanted) {
      if (placed.includes(slot)) shown.add(slot);
      else headers.set(slot, (headers.get(slot) ?? new Set()).add(regions.header));
    }
  }
  return wanted
    .filter(({ slot }) => !shown.has(slot))
    .map(({ key, slot, what }) => ({
      level: "warning" as const,
      message:
        `settings: ${key} is set, but ${what} shows on no page — every page has a header region ` +
        `(${[...(headers.get(slot) ?? [])].map((file) => `"${file}"`).join(", ")}) and no fragment of it places ` +
        `<canopy-slot name="${slot}">`,
    }));
}

/**
 * Everything worth saying about a site, in the order a reader wants it: what
 * the settings got wrong first, then what the pages point at.
 */
export function siteFindings(site: LoadedSite): Finding[] {
  return [
    ...settingsFindings(site),
    ...navFindings(site.nav),
    ...regionFindings(site),
    ...filenameEncodingFindings(site),
    ...knownBrokenFindings(site, [...referenceFindings(site), ...imageFindings(site)]),
    ...descriptionFindings(site),
    ...dateFindings(site),
  ];
}

/**
 * Apply `settings.knownBroken` to the reference findings: a broken reference on
 * a page an entry excuses is reported under that entry, with its reason, as a
 * warning — so the build goes ahead — while a broken reference anywhere else is
 * still the error it was.
 *
 * Each entry also has to keep earning its place. One that names no page, or
 * whose pages have nothing broken left, is reported for removal: a baseline is
 * a list of debts being paid down, and an entry nobody is reminded to delete
 * becomes a permanent exemption — the way an "allow errors" switch ends up
 * silencing a checker for good.
 */
export function knownBrokenFindings(site: LoadedSite, findings: Finding[]): Finding[] {
  const entries = site.settings.knownBroken ?? [];
  if (entries.length === 0) return findings;

  const excused = entries.map((entry) => ({
    entry,
    pages: new Set(pagesMatching(entry.path, site.index)),
    held: [] as string[],
  }));
  const kept: Finding[] = [];
  for (const finding of findings) {
    const by =
      finding.level === "error" && finding.page !== undefined
        ? excused.find((candidate) => candidate.pages.has(finding.page as string))
        : undefined;
    if (by === undefined) kept.push(finding);
    else by.held.push(finding.message);
  }

  for (const { entry, pages, held } of excused) {
    const where = `settings.knownBroken "${entry.path}"`;
    if (pages.size === 0) {
      kept.push({ level: "warning", message: `${where} matches no page — remove the entry` });
    } else if (held.length === 0) {
      kept.push({
        level: "warning",
        message: `${where}: nothing there is broken any more — remove the entry`,
      });
    } else {
      kept.push({
        level: "warning",
        message:
          `${where} (${entry.reason}): ${held.length} broken reference(s) published anyway:` +
          held.map((message) => `\n  ${message}`).join(""),
      });
    }
  }
  return kept;
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
export function descriptionFindings(site: LoadedSite): Finding[] {
  if (site.settings.siteUrl === undefined) return [];
  const missing: string[] = [];
  for (const page of site.index.pages) {
    const { data } = parseFrontmatter(site.sources.get(page) ?? "");
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
 * Pages whose `image:` will not show.
 *
 * A page's `image:` is the picture link previews show for it and, on a stream
 * page, its cover under the byline and on the stream's listing. A site path —
 * from the site root, as canopy reads it — that is not published is a broken
 * image a reader sees; one that reaches its file only by ignoring letter case
 * is kept as written, like any file that is not a page. A root-absolute path is
 * held to the same rule as a root-absolute link; any other absolute URL is the
 * author's to vouch for. Read with canopy's own frontmatter parser.
 */
export function imageFindings(site: LoadedSite): Finding[] {
  const findings: Finding[] = [];
  for (const page of site.index.pages) {
    const { data } = parseFrontmatter(site.sources.get(page) ?? "");
    const image = typeof data.image === "string" ? data.image.trim() : "";
    if (image === "") continue;
    const where = `${page}: image: "${image}"`;
    if (isRootAbsolute(image)) {
      const problem = rootAbsoluteProblem(site, image);
      if (problem !== undefined) findings.push({ page, level: problem.level, message: `${where} ${problem.message}` });
      continue;
    }
    if (isExternalUrl(image)) continue;
    const target = (decodeLinkPath(image) ?? image).replace(/^\.\//, "");
    const published = findPublished(site, target);
    if (published === undefined) {
      findings.push({ page, level: "error", message: `${where} is not a published file (it is a path from the site root)` });
    } else if (!published.exact) {
      findings.push({ page, level: "error", message: `${page}: ${caseOnlyMessage("image:", image, published.file)}` });
    }
  }
  return findings;
}

/**
 * Dates that will not do what their author meant.
 *
 * Three ways a date goes quietly wrong, all read with canopy's own rule
 * (`frontmatterDate`, `fileNameDate`, `pageDate`) so what is flagged here is
 * exactly what canopy will and will not treat as dated:
 *
 * - a `date:` or `updated:` that is not a date (`2026-02-30`, `28/09/2026`) —
 *   the page renders as if the line were not there;
 * - a `date:` on another day than the one the file is named by
 *   (`2026-10-03-launch.md` with `date: 2026-10-05`) — `date:` wins, so the
 *   page's URL and its stated date disagree, usually because one of them was
 *   edited and the other was not;
 * - an undated page — no `date:`, no day in its file name — in a `feed`
 *   section, which the feed leaves out without a reader following the section
 *   ever finding out. The section's own index page is exempt: it describes
 *   the series rather than being an entry.
 *
 * Warnings, not errors: an undated page is still a sound page.
 */
export function dateFindings(site: LoadedSite): Finding[] {
  const feedDirs = (site.settings.sections ?? [])
    .filter((section) => section.feed === true)
    .map((section) => section.path.toLowerCase());
  const malformed: string[] = [];
  const disagreeing: string[] = [];
  const undatedInFeed: string[] = [];
  const undatedInStream: string[] = [];
  for (const page of site.index.pages) {
    const { data } = parseFrontmatter(site.sources.get(page) ?? "");
    for (const key of ["date", "updated"] as const) {
      if (data[key] !== undefined && data[key] !== null && frontmatterDate(data[key]) === undefined) {
        malformed.push(`  ${page} (${key}: ${String(data[key])})`);
      }
    }
    const stated = frontmatterDate(data.date);
    const named = fileNameDate(page);
    if (stated !== undefined && named !== undefined && stated.slice(0, 10) !== named) {
      disagreeing.push(`  ${page} (date: ${stated})`);
    }
    const dated = pageDate({ sourcePath: page, frontmatter: data }) !== undefined;
    const key = page.toLowerCase();
    const sitePath = toSitePath(page);
    const { streamDir } = resolvePageLayout(site.layout, sitePath);
    const inStream =
      streamDir !== undefined && sitePath.toLowerCase() !== streamIndexPath(streamDir).toLowerCase();
    const inFeed = feedDirs.some((dir) => key.startsWith(`${dir}/`) && key !== `${dir}/index.md`);
    // One warning per page: a stream's feed (when it has one) leaves the same
    // pages out, and the stream's ordering is the larger consequence.
    if (inStream && !dated) undatedInStream.push(`  ${page}`);
    else if (inFeed && !dated) undatedInFeed.push(`  ${page}`);
  }
  const findings: Finding[] = [];
  if (malformed.length > 0) {
    findings.push({
      level: "warning",
      message:
        `${malformed.length} frontmatter date(s) are not dates (expected YYYY-MM-DD, optionally ` +
        "with a time), so canopy reads those pages as if the line were not there:\n" +
        malformed.join("\n"),
    });
  }
  if (disagreeing.length > 0) {
    findings.push({
      level: "warning",
      message:
        `${disagreeing.length} page(s) say a different day in "date:" than their file name does; ` +
        `"date:" wins, so each page's URL and its date disagree:\n` +
        disagreeing.join("\n"),
    });
  }
  if (undatedInFeed.length > 0) {
    findings.push({
      level: "warning",
      message:
        `${undatedInFeed.length} page(s) in a feed section have no "date:" (nor a day in their file name), so the feed leaves ` +
        "them out:\n" +
        undatedInFeed.join("\n"),
    });
  }
  if (undatedInStream.length > 0) {
    findings.push({
      level: "warning",
      message:
        `${undatedInStream.length} page(s) in a stream section have no "date:" (nor a day in their file name), so the stream lists them ` +
        "last, after every dated page:\n" +
        undatedInStream.join("\n"),
    });
  }
  return findings;
}

/** Check the site in `dir`, returning the exit code to leave with. */
export async function checkSite(dir: string): Promise<number> {
  const site = await loadSite(dir);
  const findings = siteFindings(site);
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
