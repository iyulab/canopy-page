/**
 * canopy-page — the authoring pipeline around a documentation site.
 *
 * Rendering markdown into a site is canopy's job; this package owns what
 * surrounds it: the `settings.json` contract a documentation set is configured
 * with, the integrity checks that keep a published site from shipping broken
 * references, and the build that ties them together.
 *
 * The command line is the intended way in. This entry point exposes the same
 * pieces for a caller that wants to run a check inside its own tooling.
 */
export { buildSite, type BuildOptions } from "./build.js";
export { checkSite, referenceFindings, siteFindings } from "./check.js";
export {
  extractReferences,
  isExternalUrl,
  type Reference,
} from "./references.js";
export {
  loadSite,
  navFindings,
  reportFindings,
  SiteError,
  type Finding,
  type LoadedSite,
} from "./site.js";
export {
  parseSettings,
  SettingsError,
  type Settings,
  type SettingsNavItem,
  type SettingsSection,
} from "./settings.js";
