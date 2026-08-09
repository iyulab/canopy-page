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

/** Why a settings file was rejected, phrased for someone editing it. */
export class SettingsError extends Error {}

function fail(message: string): never {
  throw new SettingsError(message);
}

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
  /** Favicon, relative to the settings file. Must be a published file. */
  icon?: string;
  /**
   * CSS of design-token overrides, relative to the settings file.
   *
   * Appended after canopy's own tokens, so a file naming one value keeps the
   * rest. It is configuration rather than content: it is read at build time and
   * left off the published site.
   */
  tokens?: string;
  /** Paths to leave unpublished: a directory, an extension (`*.tmp`), or one exact path. */
  exclude?: string[];
  /** Ordered regions of the site. Without them, navigation follows the folder tree. */
  sections?: SettingsSection[];
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
   * the things that must be absolute: `sitemap.xml` and the robots file that
   * points at it. Absent, neither is written.
   */
  siteUrl?: string;
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
  };
}

/**
 * Keys that are allowed but carry no meaning for the build.
 *
 * `$schema` is how an editor knows to offer completion and inline validation,
 * so it has to survive a strict key check.
 */
const IGNORED_KEYS = new Set(["$schema"]);

const SETTINGS_KEYS = new Set([
  "title",
  "description",
  "lang",
  "icon",
  "tokens",
  "exclude",
  "sections",
  "logo",
  "home",
  "siteUrl",
  "rehypePlugins",
  "strings",
]);

const SECTION_KEYS = new Set(["path", "label", "order", "items"]);

const HOME_KEYS = new Set(["url", "label"]);

const STRINGS_KEYS = new Set(["search", "toggleTheme", "siteNav", "pageNav", "onThisPage"]);

const NAV_ITEM_KEYS = new Set(["label", "path", "items"]);

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

function parseSection(value: unknown, where: string): SettingsSection {
  const section = asObject(value, where, 'expected an object with a "path"');
  rejectUnknownKeys(section, SECTION_KEYS, where);

  const { path, label, order, items } = section;
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

  return {
    path: asRelativePath(path, `${where}.path`),
    ...(label === undefined ? {} : { label: label as string }),
    ...(order === undefined ? {} : { order: order as "asc" | "desc" }),
    ...(items === undefined
      ? {}
      : { items: (items as unknown[]).map((item, i) => parseNavItem(item, `${where}.items[${i}]`)) }),
  };
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
  rejectUnknownKeys(value, SETTINGS_KEYS, "settings");

  const {
    title,
    description,
    lang,
    icon,
    tokens,
    exclude,
    sections,
    logo,
    home,
    siteUrl,
    rehypePlugins,
    strings,
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
  if (exclude !== undefined && !Array.isArray(exclude)) fail("settings.exclude: must be an array");
  if (sections !== undefined && !Array.isArray(sections)) fail("settings.sections: must be an array");
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
  }

  return {
    ...(title === undefined ? {} : { title: title as string }),
    ...(description === undefined ? {} : { description: description as string }),
    ...(lang === undefined ? {} : { lang: lang as string }),
    ...(icon === undefined ? {} : { icon: asRelativePath(icon, "settings.icon") }),
    ...(tokens === undefined ? {} : { tokens: asRelativePath(tokens, "settings.tokens") }),
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
      : {
          sections: (sections as unknown[]).map((section, i) =>
            parseSection(section, `settings.sections[${i}]`),
          ),
        }),
    ...(logo === undefined ? {} : { logo: asRelativePath(logo, "settings.logo") }),
    ...(parsedHome === undefined ? {} : { home: parsedHome }),
    ...(siteUrl === undefined ? {} : { siteUrl: siteUrl as string }),
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
