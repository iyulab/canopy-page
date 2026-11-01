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

/**
 * Every sentence canopy-page's own scripts show a reader, and the `settings.strings` key that
 * overrides it. This table is the whole list: a script that shows a hard-coded sentence adds a row
 * here (and the key to `settings.strings`), and a test fails any script that shows one without a row.
 *
 * `default` is the source literal in `file` — a source literal, not a template placeholder, so the
 * shipped asset stays valid, readable JavaScript on its own. It must occur exactly once there.
 */
export const ASSET_STRINGS = {
  searchFailed: { file: "search.js", default: "Search failed to load." },
  lightboxClose: { file: "image-lightbox.js", default: "Close" },
} as const;

export type AssetStringKey = keyof typeof ASSET_STRINGS;

/** The `settings.strings` keys that reach canopy-page's own scripts rather than canopy's shell. */
export const ASSET_STRING_KEYS = Object.keys(ASSET_STRINGS) as AssetStringKey[];

export type AssetStrings = Partial<Record<AssetStringKey, string>>;

/** The scripts a site carries, in the order they are concatenated. */
const SCRIPTS = ["search.js", "scrollspy.js", "theme-toggle.js", "mobile-nav.js", "image-lightbox.js"] as const;

/**
 * The single script every canopy-page site carries via canopy's `--script`.
 *
 * `strings` overrides the sentences in {@link ASSET_STRINGS} — the reader-facing text of
 * canopy-page's own assets, `settings.strings` in the settings surface. A key left out keeps its
 * English default.
 */
export async function assembleScript(strings: AssetStrings = {}): Promise<string> {
  const sources = await Promise.all(SCRIPTS.map((name) => readAsset(name)));
  return sources
    .map((source, index) => {
      const file = SCRIPTS[index];
      let result = source;
      for (const key of ASSET_STRING_KEYS) {
        const entry = ASSET_STRINGS[key];
        const override = strings[key];
        if (entry.file !== file || override === undefined) continue;
        const target = JSON.stringify(entry.default);
        if (result.split(target).length !== 2) {
          throw new Error(`${file} must carry ${target} exactly once, for settings.strings.${key} to replace`);
        }
        // A function replacer, not a replacement string: String.replace treats "$&"/"$'"/"$$"
        // etc. in a replacement string as patterns, and a site author's text is free to contain a literal "$".
        result = result.replace(target, () => JSON.stringify(override));
      }
      return result;
    })
    .join("\n");
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
