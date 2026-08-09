import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Assembling canopy-page's own client-side surface for a build.
 *
 * canopy carries at most one `--script` and one `--tokens-css`, so every UI
 * feature canopy-page ships (search, the outline scrollspy, and whatever
 * follows) has to land in those two files rather than one each. Reading the
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

/** The single script every canopy-page site carries via canopy's `--script`. */
export async function assembleScript(): Promise<string> {
  const [search, scrollspy, themeToggle] = await Promise.all([
    readAsset("search.js"),
    readAsset("scrollspy.js"),
    readAsset("theme-toggle.js"),
  ]);
  return `${search}\n${scrollspy}\n${themeToggle}`;
}

/**
 * CSS canopy-page contributes on top of a site's own tokens, carried via
 * canopy's `--tokens-css` — the same channel a site's own `settings.tokens`
 * already uses, so no new canopy surface is needed for this either.
 */
export async function assembleTokensCss(userTokensCss: string | undefined): Promise<string> {
  const [search, scrollspy] = await Promise.all([readAsset("search.css"), readAsset("scrollspy.css")]);
  const own = `${search}\n${scrollspy}`;
  return userTokensCss === undefined ? own : `${userTokensCss}\n${own}`;
}
