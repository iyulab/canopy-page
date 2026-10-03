import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Assembling canopy-page's own client-side surface for a build.
 *
 * canopy carries one `--script`, so every UI feature canopy-page ships
 * (search, the outline scrollspy, and whatever follows) lands in one script
 * and one stylesheet rather than a file each. Reading the
 * pieces here — rather than at each call site — keeps the list of what
 * ships in one place: adding a feature means adding one line below, not
 * hunting for every place a script or stylesheet gets assembled.
 *
 * Resolved relative to this module rather than `process.cwd()`, so it finds
 * `assets/` next to itself whether it is running as `src/assets-bundle.ts`
 * (tests, dev) or the compiled `dist/assets-bundle.js` (published package) —
 * `copy-assets.mjs` copies `src/assets` to `dist/assets` in the same
 * position relative to the compiled output.
 */
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

async function readAsset(name: string): Promise<string> {
  return readFile(path.join(ASSETS_DIR, name), "utf8");
}

/** The literal `search.js` falls back to when no override is given — the substitution target. */
const SEARCH_FAILED_DEFAULT = "Search failed to load.";

/**
 * The single script every canopy-page site carries via canopy's `--script`.
 *
 * `searchFailed` overrides the message `search.js` shows when its fetch of the
 * search index fails — the one reader-facing string in canopy-page's own
 * assets, `settings.strings.searchFailed` in the settings surface. The other
 * two files carry no site-specific text, so only `search.js` takes this
 * substitution; a source literal, not a template placeholder, so the shipped
 * asset stays valid, readable JavaScript on its own.
 */
export async function assembleScript(searchFailed?: string): Promise<string> {
  const [search, scrollspy, themeToggle, mobileNav, imageLightbox] = await Promise.all([
    readAsset("search.js"),
    readAsset("scrollspy.js"),
    readAsset("theme-toggle.js"),
    readAsset("mobile-nav.js"),
    readAsset("image-lightbox.js"),
  ]);
  // A function replacer, not a replacement string: String.replace treats
  // "$&"/"$'"/"$$" etc. in a replacement string as patterns, and a site
  // author's searchFailed text is free to contain a literal "$".
  const searchWithStrings =
    searchFailed === undefined
      ? search
      : search.replace(JSON.stringify(SEARCH_FAILED_DEFAULT), () => JSON.stringify(searchFailed));
  return `${searchWithStrings}\n${scrollspy}\n${themeToggle}\n${mobileNav}\n${imageLightbox}`;
}

/**
 * The stylesheet every canopy-page site carries via canopy's `--stylesheet`,
 * first of the caller stylesheets — so its layer, `canopy-page`, is declared
 * after canopy's own and outranks it, while a site's own `styles` (linked
 * after this, unlayered) outrank both.
 */
export async function assembleStylesheet(): Promise<string> {
  const [search, scrollspy, imageLightbox] = await Promise.all([
    readAsset("search.css"),
    readAsset("scrollspy.css"),
    readAsset("image-lightbox.css"),
  ]);
  return `@layer canopy-page {\n${search}\n${scrollspy}\n${imageLightbox}\n}\n`;
}
