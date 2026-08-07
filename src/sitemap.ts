import { readdir } from "node:fs/promises";
import path from "node:path";

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
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The URL a page is canonically reached by.
 *
 * A directory's index page is the directory: `guide/index.html` and `guide/` are
 * one page, and listing both would ask a crawler to treat it as two.
 */
function pageUrl(base: string, htmlPath: string): string {
  const canonical = htmlPath.replace(/(^|\/)index\.html$/, "$1");
  // encodeURI leaves the separators alone and fixes what a URL cannot carry raw.
  return `${base}/${encodeURI(canonical)}`;
}

/** A sitemap naming every published page, newline-terminated. */
export function sitemapXml(siteUrl: string, htmlPaths: readonly string[]): string {
  const base = siteUrl.replace(/\/+$/, "");
  const entries = [...htmlPaths]
    .sort()
    .map((htmlPath) => `  <url><loc>${escapeXml(pageUrl(base, htmlPath))}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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
