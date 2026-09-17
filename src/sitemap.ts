import { readdir } from "node:fs/promises";
import path from "node:path";
import { pageUrl } from "@iyulab/canopy";

/**
 * The two files a site is found by.
 *
 * Both need one thing canopy deliberately does not know: where the site
 * actually stands. Every link canopy writes is relative, which is what lets a
 * site be served from any sub-path — and exactly why a sitemap, whose entries
 * must be absolute, cannot be derived from the output alone. `siteUrl` supplies
 * it, and without it neither file is written.
 *
 * The page list comes from the *output* rather than from the source: canopy adds
 * a synthetic `index.html` to a site whose root has no index page, and a sitemap
 * that omitted it would omit the site's front door. Listing files is not reading
 * them — nothing here parses the HTML canopy produced.
 *
 * `pageUrl` is canopy's own rule for a page's canonical address (an index page
 * is its directory) — the same function the shell uses for `rel="canonical"`,
 * imported rather than restated so the sitemap's `<loc>` and the page's own
 * canonical can never disagree by a character. canopy-page otherwise drives
 * canopy through its command line (see `canopy.ts`); that stance is about the
 * build, and a pure URL rule is not a second door into it.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The site's other language editions, for the sitemap's `xhtml:link` alternates. */
export interface SitemapEditions {
  /** This edition's own language tag; defaults to "en", as canopy's shell does. */
  lang?: string;
  /** `hreflang` → that edition's own site URL, `x-default` allowed. */
  alternates?: Record<string, string>;
}

/**
 * A sitemap naming every published page, newline-terminated.
 *
 * With an edition map, each entry also lists the page's counterpart in every
 * edition, this one included — the sitemap form of the `hreflang` links the
 * pages themselves carry, and the same rule: this edition leads unless the map
 * already places its language explicitly.
 */
export function sitemapXml(
  siteUrl: string,
  htmlPaths: readonly string[],
  editions: SitemapEditions = {},
): string {
  const editionList: [string, string][] = [];
  if (editions.alternates !== undefined) {
    const lang = editions.lang ?? "en";
    if (!Object.hasOwn(editions.alternates, lang)) editionList.push([lang, siteUrl]);
    editionList.push(...Object.entries(editions.alternates));
  }
  const entries = [...htmlPaths]
    .sort()
    .map((htmlPath) => {
      const alternates = editionList
        .map(
          ([hreflang, base]) =>
            `<xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(pageUrl(base, htmlPath))}"/>`,
        )
        .join("");
      return `  <url><loc>${escapeXml(pageUrl(siteUrl, htmlPath))}</loc>${alternates}</url>`;
    })
    .join("\n");
  const xhtmlNamespace =
    editionList.length > 0 ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtmlNamespace}>
${entries}
</urlset>
`;
}

/**
 * A robots file whose only job is to point at the sitemap.
 *
 * Written only alongside one. A robots.txt with nothing to say would be canopy-page
 * asserting a crawl policy nobody stated.
 */
export function robotsTxt(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
}

/** Every `.html` file under `outDir`, as sorted POSIX paths relative to it. */
export async function listHtmlFiles(outDir: string): Promise<string[]> {
  const entries = await readdir(outDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) =>
      path.relative(outDir, path.join(entry.parentPath, entry.name)).replace(/\\/g, "/"),
    )
    .sort();
}
