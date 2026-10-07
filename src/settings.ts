/**
 * `settings.json` — the one file a documentation set hands to canopy-page.
 *
 * Everything a site needs to build lives here, next to the markdown it
 * describes, so the build is reproducible from the source tree alone: no build
 * script holds half the configuration, and the file can be read by a person
 * deciding what the site is supposed to look like.
 *
 * The whole file is optional in the sense that every field is: a directory of
 * markdown with an empty `{}` builds, with navigation derived from the folder
 * tree. Settings exist to override what a source tree cannot express by itself —
 * the display order of a release log, a label that is not a directory name, a
 * draft folder that must stay unpublished.
 *
 * ## One site, not several builds
 *
 * A settings file describes a single site, built in one pass from the directory
 * that holds it. `sections` name ordered regions *within* that site — a guide, a
 * release log — rather than separate builds of their own.
 *
 * The alternative, building each region separately, would break the thing the
 * site is for: links and backlinks resolve across one build, so splitting a
 * guide from the release notes it refers to would leave those cross-references
 * dangling — the fragmentation this tool exists to remove. A favicon or an
 * excluded path is likewise stated once for the site, which is only meaningful
 * if there is one. Two genuinely independent sites are two settings files.
 */

import { PROFILES, type Profile, REGIONS, type RegionName } from "@iyulab/canopy";

/** Why a settings file was rejected, phrased for someone editing it. */
export class SettingsError extends Error {}

function fail(message: string): never {
  throw new SettingsError(message);
}

/**
 * Region → the HTML fragment that fills it, relative to the settings file.
 * `header` and `footer` replace canopy's own with the fragment's markup; `head`,
 * `beforeArticle` and `afterArticle` add to the page. canopy's controls go
 * where the fragment's `<canopy-slot name="…"></canopy-slot>` elements say.
 */
export type RegionPaths = Partial<Record<RegionName, string>>;

/** One ordered region of the site: a guide, a release log, a reference section. */
export interface SettingsSection {
  /** Directory this section covers, relative to the settings file. */
  path: string;
  /** Heading shown for the section. Defaults to the directory name. */
  label?: string;
  /**
   * Order for the pages inside, when they are not listed one by one.
   * `desc` is what a release log wants: newest first, which no folder tree says.
   */
  order?: "asc" | "desc";
  /** Explicit contents, in display order. Overrides `order`. */
  items?: SettingsNavItem[];
  /**
   * Publish an Atom feed of the section's dated pages at `<path>/feed.xml`, so
   * a reader can follow it. Needs `siteUrl`. A page is in the feed when its
   * frontmatter names a `date:`. A stream section has one by default once
   * `siteUrl` is set; `false` turns it off.
   */
  feed?: boolean;
  /**
   * How the section reads. `stream` is for dated pages: newest first by
   * `date:`, one column, a lead and a byline under each title, and an index
   * listing them — written for the section when it has none. Defaults to the
   * site's `profile`.
   */
  profile?: Profile;
  /** Fragments for this section, over the site's `regions` key by key. `""` turns one off here. */
  regions?: RegionPaths;
  /**
   * How many posts a stream section's index lists — the rest continue on
   * `<path>/page/2.html` on. Only with this section's own `"profile": "stream"`.
   * Defaults to 10.
   */
  pageSize?: number;
}

/** Pages whose broken references are known and being fixed — see `Settings.knownBroken`. */
export interface KnownBroken {
  /** A page, `dir/*` (the pages directly in a directory), or `dir/**` (every page beneath it). */
  path: string;
  /** Why these pages are let through. Required: an excuse nobody wrote down is never revisited. */
  reason: string;
}

/**
 * One entry in a section's contents: a page, or a group of entries.
 *
 * The common case is a bare path, so a string is accepted as shorthand for
 * `{ path }` and normalized away here — the rest of the code sees one shape.
 */
export interface SettingsNavItem {
  /** Display text. Defaults to the page's title, then its filename. */
  label?: string;
  /** Path of the page, relative to the settings file, with or without `.md`. */
  path?: string;
  /** Nested entries, in display order. */
  items?: SettingsNavItem[];
}

/** A validated settings file. Absent fields mean "use canopy's default". */
export interface Settings {
  /** Site name. Defaults to the directory name. */
  title?: string;
  /** Fills `<meta name="description">`, which is what link previews show. */
  description?: string;
  /** BCP 47 language tag for `<html lang>`. Worth setting for any non-English site. */
  lang?: string;
  /**
   * The site's one colour scheme, for a site that has only one (a dark-only
   * product site, say): every page is drawn in it whatever the reader's system
   * prefers, and there is no theme toggle. Absent, pages follow the system
   * preference and the toggle switches them.
   */
  colorScheme?: "light" | "dark";
  /** Favicon, relative to the settings file. Must be a published file. */
  icon?: string;
  /**
   * Stylesheets, relative to the settings file, linked after canopy's and
   * canopy-page's own CSS in the order given. Both of those sit in cascade
   * layers, so a rule here wins over them at any specificity — a token
   * restated or a region restyled alike. Each must be a published file, like
   * `icon` and `logo`: it is linked where the site publishes it, so a relative
   * `url()` inside it resolves as written.
   */
  styles?: string[];
  /** Paths to leave unpublished: a directory, an extension (`*.tmp`), or one exact path. */
  exclude?: string[];
  /** How the site reads by default: `manual` (a tree to look things up in) or `stream` (dated pages, newest first). */
  profile?: Profile;
  /** With `profile: "stream"`, how many posts the site's front page lists before `page/2.html`. Defaults to 10. */
  pageSize?: number;
  /** Fragments that fill the site's regions — a host site's own header, footer and stylesheet links. */
  regions?: RegionPaths;
  /** Ordered regions of the site. Without them, navigation follows the folder tree. */
  sections?: SettingsSection[];
  /**
   * Pages known to have broken references, published anyway while they are
   * being fixed — the baseline a site already broken before it adopted
   * canopy-page starts from. Their broken links and images are reported as
   * warnings naming the reason instead of stopping the build; anything broken
   * elsewhere still stops it. An entry with nothing left to excuse is flagged
   * for removal, so the list only ever shrinks.
   */
  knownBroken?: KnownBroken[];
  /** Logo shown beside the site title, relative to the settings file. Must be a published file. */
  logo?: string;
  /**
   * A link back to the site this documentation sits beside.
   *
   * Both halves or neither: a URL with no text renders an empty link, and text
   * with no URL links nowhere. Stating them as one object makes the half-filled
   * state unrepresentable rather than merely rejected.
   */
  home?: { url: string; label: string };
  /**
   * Where the built site will stand, as an absolute URL.
   *
   * Every link canopy writes is relative, so a site needs this for nothing except
   * the things that must be absolute: `sitemap.xml`, the robots file that points
   * at it, and the `<head>` tags a search engine reads as addresses — canonical,
   * `og:url`, `og:image`, `hreflang`. Absent, none of them is written.
   */
  siteUrl?: string;
  /**
   * Image a link preview shows (`og:image`) for any page whose frontmatter has
   * no `image` of its own, relative to the settings file. Must be a published
   * file, like `icon` and `logo`. Needs `siteUrl`: the tag has to be absolute.
   */
  previewImage?: string;
  /**
   * The site's other language editions, `hreflang` tag → that edition's own
   * absolute site URL (`x-default` allowed). Each page then names its
   * counterpart at the same path under every edition, in `<head>` and in the
   * sitemap. Needs `siteUrl`, which is the entry for this edition itself.
   */
  alternates?: Record<string, string>;
  /**
   * Rehype plugins to run on every page, after canopy's own sanitize step and
   * before syntax highlighting — canopy's fixed extension point for markdown
   * that needs more than CommonMark and GFM, a diagram fence rendered to SVG
   * being the case this exists for.
   *
   * Each entry is an installed package name (`"rehype-declart"`), never a
   * filesystem path: this is a JSON settings file naming a dependency the site
   * author already declared, not a script with a place of its own to resolve a
   * relative path against.
   */
  rehypePlugins?: string[];
  /**
   * Overrides for the reader chrome's own text — search, the theme toggle,
   * and the navigation landmarks.
   *
   * `lang` changes what `<html lang>` declares, but that text is canopy's own
   * UI, not vault content, so `lang` alone leaves it English. There is no
   * built-in translation table: like `home.label`, link text has to be
   * written in the site's own language, and canopy cannot know what that
   * language calls "Search". Keys left out keep their English default.
   */
  strings?: {
    search?: string;
    toggleTheme?: string;
    siteNav?: string;
    pageNav?: string;
    onThisPage?: string;
    /** Title and heading of the auto-generated contents page at the site root. */
    indexTitle?: string;
    /** Heading over a page's list of pages that link to it. */
    backlinks?: string;
    /** Accessible label for the topbar's ancestor-trail nav. */
    breadcrumb?: string;
    /** Accessible label for the other-language links a `language` slot shows. */
    language?: string;
    /** A stream page's reading time, with `{n}` where the minutes go: "{n} min read". */
    readingTime?: string;
    /** The link every page opens with, past the header and navigation to the content. */
    skipToContent?: string;
    /** Over the link at a stream post's end to the post published after it: "Newer post". */
    newerPost?: string;
    /** Over the link at a stream post's end to the post published before it: "Older post". */
    olderPost?: string;
    /** Where a page of a stream's list is, with `{n}` and `{total}`: "Page {n} of {total}". */
    pageOf?: string;
    /** The link to the page of a stream's list before this one, with newer posts: "Newer posts". */
    newerPosts?: string;
    /** The link to the page of a stream's list after this one, with older posts: "Older posts". */
    olderPosts?: string;
    /** A stream post's tags' label, and the title of a stream's list of tags: "Tags". */
    tags?: string;
    /**
     * Message shown in place of results when the client search index fails to
     * load. This key rides the same JSON `--strings` flag as every other one
     * here (canopy just never reads it), but it is consumed by canopy-page's
     * own script assembly (`assembleScript`), not by canopy — every other key
     * styles canopy's own shell markup, this one styles canopy-page's own
     * search UI (see `assets/search.js`).
     */
    searchFailed?: string;
  };
}

/**
 * Keys that are allowed but carry no meaning for the build.
 *
 * `$schema` is how an editor knows to offer completion and inline validation,
 * so it has to survive a strict key check.
 */
const IGNORED_KEYS = new Set(["$schema"]);

/**
 * Exported so `settings.schema.json` (`docs/`) can be tested against
 * the parser's own allowlists rather than a hand-copied duplicate — the two
 * are otherwise free to drift silently apart as fields are added.
 */
export const SETTINGS_KEYS = new Set([
  "title",
  "description",
  "lang",
  "colorScheme",
  "icon",
  "styles",
  "profile",
  "pageSize",
  "regions",
  "exclude",
  "sections",
  "logo",
  "home",
  "siteUrl",
  "previewImage",
  "alternates",
  "rehypePlugins",
  "strings",
  "knownBroken",
]);

export const KNOWN_BROKEN_KEYS = new Set(["path", "reason"]);

export const SECTION_KEYS = new Set(["path", "label", "order", "items", "feed", "profile", "regions", "pageSize"]);

export const HOME_KEYS = new Set(["url", "label"]);

export const STRINGS_KEYS = new Set([
  "search",
  "toggleTheme",
  "siteNav",
  "pageNav",
  "onThisPage",
  "indexTitle",
  "backlinks",
  "breadcrumb",
  "language",
  "readingTime",
  "skipToContent",
  "newerPost",
  "olderPost",
  "pageOf",
  "newerPosts",
  "olderPosts",
  "tags",
  "searchFailed",
]);

export const NAV_ITEM_KEYS = new Set(["label", "path", "items"]);

/**
 * Unknown keys are rejected rather than ignored.
 *
 * A settings file is hand-edited, and a typo in a key (`titel`, `execlude`) that
 * is quietly dropped presents as canopy-page ignoring an instruction it was
 * given — the hardest kind of problem to see, because the file looks right.
 */
function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, where: string): void {
  for (const key of Object.keys(value)) {
    if (allowed.has(key) || IGNORED_KEYS.has(key)) continue;
    fail(`${where}: unknown key "${key}"`);
  }
}

function asObject(value: unknown, where: string, expectation: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${where}: ${expectation}`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, where: string): string {
  if (typeof value !== "string") fail(`${where}: must be a string`);
  if (value.trim() === "") fail(`${where}: must not be empty`);
  return value;
}

/**
 * Normalize a path written in a settings file to the form the rest of the code
 * uses: forward slashes, no leading slash, no trailing slash.
 *
 * Authors on Windows write backslashes, and both `guide` and `guide/` mean the
 * same directory. Paths that leave the site are refused here rather than at the
 * point they fail to resolve, where the message would be about a missing file
 * instead of about the setting that named it.
 */
function asRelativePath(value: unknown, where: string): string {
  const raw = asString(value, where);
  const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.startsWith("/")) {
    fail(`${where}: must be relative to the settings file, not "${raw}"`);
  }
  if (/^[A-Za-z]:/.test(normalized)) {
    fail(`${where}: must be relative to the settings file, not an absolute path`);
  }
  if (normalized.split("/").includes("..")) {
    fail(`${where}: must stay inside the site, so it cannot contain ".."`);
  }
  if (normalized === "" || normalized === ".") {
    fail(`${where}: must name a path inside the site`);
  }
  return normalized;
}

/** `styles` takes one path or a list of them; either way it becomes a list, in link order. */
function asStylesList(value: unknown): string[] {
  if (typeof value === "string") return [asRelativePath(value, "settings.styles")];
  if (!Array.isArray(value) || value.length === 0) {
    fail("settings.styles: expected a path or a non-empty list of paths");
  }
  return value.map((entry, i) => asRelativePath(entry, `settings.styles[${i}]`));
}

function asProfile(value: unknown, where: string): Profile {
  if (!(PROFILES as readonly unknown[]).includes(value)) fail(`${where}: must be one of ${PROFILES.join(", ")}`);
  return value as Profile;
}

/**
 * A region map. A section may write `""` to turn off a region the site sets;
 * the site has nothing above it to turn off, so there an empty path is just
 * an empty path, and refused like any other.
 */
function asRegions(value: unknown, where: string, allowOff: boolean): RegionPaths {
  const object = asObject(value, where, "expected an object of region → fragment path");
  const regions: RegionPaths = {};
  for (const [name, file] of Object.entries(object)) {
    if (!(REGIONS as readonly string[]).includes(name)) {
      fail(`${where}: unknown region "${name}" (regions: ${REGIONS.join(", ")})`);
    }
    regions[name as RegionName] = allowOff && file === "" ? "" : asFragmentPath(file, `${where}.${name}`);
  }
  return regions;
}

/** A region's fragment: one file, so a wildcard in it is a mistake rather than a pattern to expand. */
function asFragmentPath(value: unknown, where: string): string {
  const path = asRelativePath(value, where);
  if (/[*?[\]]/.test(path)) fail(`${where}: names one file, so it cannot contain any of * ? [ ] — not "${value}"`);
  return path;
}

/**
 * Check an exclusion pattern against the dialect that is actually implemented.
 *
 * Four shapes, and nothing else: `drafts`, `drafts/**`, `*.tmp`, and one exact
 * path. A wildcard anywhere else — `images/*.md`, `guide/*` — matches nothing,
 * and a pattern that quietly excludes nothing is the failure strict validation
 * exists to prevent: the file reads as if it said something, and the folder
 * ships anyway. Refusing it here is the same answer an unknown key gets.
 */
function asExclusionPattern(value: unknown, where: string): string {
  const pattern = asString(value, where);
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  // `*.tmp` is the extension form; `drafts/**` is the whole-tree form. Strip
  // whichever applies and nothing else may hold a wildcard.
  const rest = normalized.startsWith("*.")
    ? normalized.slice(2)
    : normalized.replace(/\/\*\*$/, "");
  if (rest.includes("*")) {
    fail(
      `${where}: "${pattern}" is not a pattern canopy-page understands. ` +
        'Use a directory ("drafts"), a whole tree ("drafts/**"), ' +
        'an extension ("*.tmp"), or one exact path ("notes/scratch.md")',
    );
  }
  return pattern;
}

function parseKnownBroken(value: unknown, where: string): KnownBroken {
  const entry = asObject(value, where, 'expected an object with "path" and "reason"');
  rejectUnknownKeys(entry, KNOWN_BROKEN_KEYS, where);
  if (entry.path === undefined) fail(`${where}: needs a "path" naming the pages it excuses`);
  if (entry.reason === undefined) fail(`${where}: needs a "reason" — say why these pages are let through`);
  const path = asRelativePath(entry.path, `${where}.path`);
  // The same two glob shapes sections understand, and only as the last segment.
  if (path.replace(/\/\*\*?$/, "").includes("*")) {
    fail(
      `${where}.path: "${path}" is not a pattern canopy-page understands. ` +
        'Use a page ("guide/install"), "dir/*" for the pages directly in a directory, ' +
        'or "dir/**" for every page beneath it',
    );
  }
  return { path, reason: asString(entry.reason, `${where}.reason`).trim() };
}

/**
 * Check a `rehypePlugins` entry names a package rather than a file.
 *
 * canopy itself accepts either shape on `--rehype-plugin`, resolving a
 * filesystem-looking specifier against its own process's working directory.
 * That directory is canopy-page's spawning process, not the settings file —
 * the same ambiguity every other path setting here avoids by resolving
 * relative to the settings file instead. Rather than resolve it a second way
 * here, a path-looking entry is refused with a message saying why, matching
 * every other setting whose value must stay inside a stated shape.
 */
function asModuleSpecifier(value: unknown, where: string): string {
  const specifier = asString(value, where);
  const looksLikeAPath =
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.includes("\\") ||
    /^[A-Za-z]:/.test(specifier);
  if (looksLikeAPath) {
    fail(
      `${where}: "${specifier}" looks like a file path, not a package name. ` +
        "Install the plugin as a dependency and name it here the way its package.json does " +
        '(e.g. "rehype-declart"), so resolution does not depend on the directory the build runs from.',
    );
  }
  return specifier;
}

function parseNavItem(value: unknown, where: string): SettingsNavItem {
  // A bare string is the common case — a page in the order it should appear.
  if (typeof value === "string") {
    return { path: asRelativePath(value, where) };
  }
  const item = asObject(value, where, 'expected a page path or an object with "label", "path", or "items"');
  rejectUnknownKeys(item, NAV_ITEM_KEYS, where);

  const { label, path, items } = item;
  if (label !== undefined) asString(label, `${where}.label`);
  if (items !== undefined && !Array.isArray(items)) fail(`${where}.items: must be an array`);
  if (path === undefined && items === undefined) {
    fail(`${where}: needs a "path" (a page) or "items" (a group)`);
  }
  // A group with no label renders as an unnamed heading, which reads as a bug in
  // the site rather than as the omission in the file that it is.
  if (path === undefined && label === undefined) {
    fail(`${where}: a group needs a "label"`);
  }

  const children = (items as unknown[] | undefined)?.map((child, i) =>
    parseNavItem(child, `${where}.items[${i}]`),
  );
  return {
    ...(label === undefined ? {} : { label: label as string }),
    ...(path === undefined ? {} : { path: asRelativePath(path, `${where}.path`) }),
    ...(children === undefined ? {} : { items: children }),
  };
}

function parseSection(value: unknown, where: string, siteProfile: Profile | undefined): SettingsSection {
  const section = asObject(value, where, 'expected an object with a "path"');
  rejectUnknownKeys(section, SECTION_KEYS, where);

  const { path, label, order, items, feed, profile, regions, pageSize } = section;
  if (feed !== undefined && typeof feed !== "boolean") fail(`${where}.feed: must be true or false`);
  if (path === undefined) fail(`${where}: needs a "path" naming the directory it covers`);
  if (label !== undefined) asString(label, `${where}.label`);
  if (order !== undefined && order !== "asc" && order !== "desc") {
    fail(`${where}.order: must be "asc" or "desc"`);
  }
  if (items !== undefined && !Array.isArray(items)) fail(`${where}.items: must be an array`);
  // Listing the contents *is* the order. Accepting both would mean silently
  // honouring one and dropping the other, and either choice surprises someone.
  if (items !== undefined && order !== undefined) {
    fail(`${where}: "items" already gives the order, so "order" cannot be set too`);
  }

  const ownProfile = profile === undefined ? undefined : asProfile(profile, `${where}.profile`);
  if (pageSize !== undefined) {
    asPageSize(pageSize, `${where}.pageSize`);
    // A section that only inherits the site's stream is part of the site's one
    // list, paged by settings.pageSize; it has no list of its own to page.
    if (ownProfile !== "stream") {
      fail(`${where}.pageSize: only a section with its own "profile": "stream" has a list to page`);
    }
  }
  // A stream is ordered by its pages' own dates. An order written here would
  // either be ignored or fight that, and neither should happen silently.
  if ((ownProfile ?? siteProfile) === "stream") {
    const inherited = ownProfile === undefined ? " (from settings.profile)" : "";
    if (order !== undefined) {
      fail(
        `${where}.order: a stream section${inherited} is ordered newest first by its pages' date:, so it takes no "order"`,
      );
    }
    if (items !== undefined) {
      fail(
        `${where}.items: a stream section${inherited} lists its pages newest first by date:, so it takes no "items"`,
      );
    }
  }

  return {
    path: asRelativePath(path, `${where}.path`),
    ...(label === undefined ? {} : { label: label as string }),
    ...(order === undefined ? {} : { order: order as "asc" | "desc" }),
    ...(items === undefined
      ? {}
      : { items: (items as unknown[]).map((item, i) => parseNavItem(item, `${where}.items[${i}]`)) }),
    ...(feed === undefined ? {} : { feed: feed as boolean }),
    ...(ownProfile === undefined ? {} : { profile: ownProfile }),
    ...(regions === undefined ? {} : { regions: asRegions(regions, `${where}.regions`, true) }),
    ...(pageSize === undefined ? {} : { pageSize: pageSize as number }),
  };
}

/** A count of posts to a page: a whole number of at least 1. */
function asPageSize(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    fail(`${where}: must be a whole number of at least 1`);
  }
  return value;
}

/**
 * The sections, each folder once. Two sections over one folder would put it in
 * the sidebar twice, and the two can disagree about its label, order and
 * profile; folders are compared ignoring case, since that is how a site's paths
 * are matched.
 */
function asSections(values: unknown[], siteProfile: Profile | undefined): SettingsSection[] {
  const sections = values.map((value, i) => parseSection(value, `settings.sections[${i}]`, siteProfile));
  sections.forEach((section, i) => {
    const first = sections.findIndex((other) => other.path.toLowerCase() === section.path.toLowerCase());
    if (first !== i) {
      fail(`settings.sections[${i}].path: "${section.path}" is already settings.sections[${first}] — a folder is one section`);
    }
  });
  return sections;
}

/**
 * Parse and validate a settings file from JSON text.
 *
 * Validation is strict and every message names the position it is about, since
 * this file is written by hand: a setting that is half-applied looks like a tool
 * that ignores its configuration.
 */
export function parseSettings(json: string): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    fail(`not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const value = asObject(raw, "settings", "expected a JSON object");
  // The one key renamed rather than removed: say where it went, since
  // "unknown key" would read as the setting having been dropped.
  if ("tokens" in value) {
    fail('settings.tokens: renamed to "styles" — the value carries over unchanged ("styles": "brand.css")');
  }
  rejectUnknownKeys(value, SETTINGS_KEYS, "settings");

  const {
    title,
    description,
    lang,
    colorScheme,
    icon,
    styles,
    profile,
    pageSize,
    regions,
    exclude,
    sections,
    logo,
    home,
    siteUrl,
    previewImage,
    alternates,
    rehypePlugins,
    strings,
    knownBroken,
  } = value;
  if (title !== undefined) asString(title, "settings.title");
  if (description !== undefined) asString(description, "settings.description");
  if (lang !== undefined) {
    const tag = asString(lang, "settings.lang");
    // A language tag is subtags of letters and digits joined by hyphens. This
    // catches the shapes people actually mistype — "ko KR", "ko_KR" — without
    // pretending to be a registry of valid tags.
    if (!/^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(tag)) {
      fail(`settings.lang: "${tag}" is not a language tag like "en" or "ko-KR"`);
    }
  }
  const siteProfile = profile === undefined ? undefined : asProfile(profile, "settings.profile");
  if (pageSize !== undefined) {
    asPageSize(pageSize, "settings.pageSize");
    if (siteProfile !== "stream") fail('settings.pageSize: only a site with "profile": "stream" has a list to page');
  }
  if (exclude !== undefined && !Array.isArray(exclude)) fail("settings.exclude: must be an array");
  if (sections !== undefined && !Array.isArray(sections)) fail("settings.sections: must be an array");
  if (knownBroken !== undefined && !Array.isArray(knownBroken)) {
    fail("settings.knownBroken: must be an array");
  }
  if (rehypePlugins !== undefined && !Array.isArray(rehypePlugins)) {
    fail("settings.rehypePlugins: must be an array");
  }

  let parsedHome: { url: string; label: string } | undefined;
  if (home !== undefined) {
    const object = asObject(home, "settings.home", 'expected an object with "url" and "label"');
    rejectUnknownKeys(object, HOME_KEYS, "settings.home");
    if (object.url === undefined) fail('settings.home.url: needed alongside "label"');
    if (object.label === undefined) fail('settings.home.label: needed alongside "url"');
    // Absolute when the target is a different origin, relative when it is a
    // sibling of the published site (a product this documentation is mounted
    // beside) — canopy resolves a relative one against each page's depth, the
    // same way it resolves every other internal link.
    const url = asString(object.url, "settings.home.url");
    parsedHome = { url, label: asString(object.label, "settings.home.label") };
  }

  if (siteUrl !== undefined) {
    const url = asString(siteUrl, "settings.siteUrl");
    if (!/^https?:\/\//i.test(url)) {
      fail(`settings.siteUrl: "${url}" must be an absolute http(s) URL`);
    }
  }
  // Both turn into absolute URLs, and siteUrl is the only thing they can be
  // absolute against — so naming either without it is rejected here, where the
  // message can say what is missing, rather than passed on for canopy to refuse.
  if (previewImage !== undefined && siteUrl === undefined) {
    fail("settings.previewImage: needs siteUrl, since a preview image has to be an absolute URL");
  }
  if (siteUrl === undefined && Array.isArray(sections)) {
    sections.forEach((section, i) => {
      if (typeof section === "object" && section !== null && (section as { feed?: unknown }).feed === true) {
        fail(`settings.sections[${i}].feed: needs siteUrl, since a feed's entries are absolute URLs`);
      }
    });
  }
  let parsedAlternates: Record<string, string> | undefined;
  if (alternates !== undefined) {
    const object = asObject(alternates, "settings.alternates", "expected an object of hreflang → site URL");
    if (siteUrl === undefined) {
      fail("settings.alternates: needs siteUrl, since this edition has to be listed alongside the others");
    }
    parsedAlternates = {};
    for (const key of Object.keys(object)) {
      // The same shape `lang` accepts, plus the one reserved value the
      // protocol defines for "no better match".
      if (key !== "x-default" && !/^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(key)) {
        fail(`settings.alternates: "${key}" is not a language tag like "en" or "ko-KR", or "x-default"`);
      }
      const url = asString(object[key], `settings.alternates.${key}`);
      if (!/^https?:\/\//i.test(url)) {
        fail(`settings.alternates.${key}: "${url}" must be an absolute http(s) URL`);
      }
      parsedAlternates[key] = url;
    }
  }

  if (colorScheme !== undefined && colorScheme !== "light" && colorScheme !== "dark") {
    fail(`settings.colorScheme: expected "light" or "dark", got ${JSON.stringify(colorScheme)}`);
  }
  let parsedStrings: Settings["strings"];
  if (strings !== undefined) {
    const object = asObject(strings, "settings.strings", "expected an object");
    rejectUnknownKeys(object, STRINGS_KEYS, "settings.strings");
    parsedStrings = {};
    for (const key of Object.keys(object)) {
      parsedStrings[key as keyof NonNullable<Settings["strings"]>] = asString(
        object[key],
        `settings.strings.${key}`,
      );
    }
    if (parsedStrings.pageOf !== undefined && !parsedStrings.pageOf.includes("{n}")) {
      fail('settings.strings.pageOf: needs "{n}" where the page number goes, as in "Page {n} of {total}"');
    }
    if (parsedStrings.readingTime !== undefined && !parsedStrings.readingTime.includes("{n}")) {
      fail('settings.strings.readingTime: needs "{n}" where the number of minutes goes, as in "{n} min read"');
    }
  }

  return {
    ...(title === undefined ? {} : { title: title as string }),
    ...(description === undefined ? {} : { description: description as string }),
    ...(lang === undefined ? {} : { lang: lang as string }),
    ...(colorScheme === undefined ? {} : { colorScheme: colorScheme as "light" | "dark" }),
    ...(icon === undefined ? {} : { icon: asRelativePath(icon, "settings.icon") }),
    ...(styles === undefined ? {} : { styles: asStylesList(styles) }),
    ...(siteProfile === undefined ? {} : { profile: siteProfile }),
    ...(pageSize === undefined ? {} : { pageSize: pageSize as number }),
    ...(regions === undefined ? {} : { regions: asRegions(regions, "settings.regions", false) }),
    ...(exclude === undefined
      ? {}
      : {
          // Exclusions are patterns, not paths: `*.tmp` and `drafts/**` are both
          // valid to canopy, so they are passed through rather than normalized
          // into a path shape they do not have.
          exclude: (exclude as unknown[]).map((pattern, i) =>
            asExclusionPattern(pattern, `settings.exclude[${i}]`),
          ),
        }),
    ...(sections === undefined
      ? {}
      : { sections: asSections(sections as unknown[], siteProfile) }),
    ...(knownBroken === undefined
      ? {}
      : {
          knownBroken: (knownBroken as unknown[]).map((entry, i) =>
            parseKnownBroken(entry, `settings.knownBroken[${i}]`),
          ),
        }),
    ...(logo === undefined ? {} : { logo: asRelativePath(logo, "settings.logo") }),
    ...(parsedHome === undefined ? {} : { home: parsedHome }),
    ...(siteUrl === undefined ? {} : { siteUrl: siteUrl as string }),
    ...(previewImage === undefined
      ? {}
      : { previewImage: asRelativePath(previewImage, "settings.previewImage") }),
    ...(parsedAlternates === undefined ? {} : { alternates: parsedAlternates }),
    ...(parsedStrings === undefined ? {} : { strings: parsedStrings }),
    ...(rehypePlugins === undefined
      ? {}
      : {
          rehypePlugins: (rehypePlugins as unknown[]).map((specifier, i) =>
            asModuleSpecifier(specifier, `settings.rehypePlugins[${i}]`),
          ),
        }),
  };
}
