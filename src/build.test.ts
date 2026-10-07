import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildSite, canopyArgs } from "./build.js";
import type { Settings } from "./settings.js";
import type { LoadedSite } from "./site.js";
import { indexSite } from "./vault.js";
import { translateNav } from "./nav.js";

/**
 * These run the real canopy, on a real folder, and read the files that come out.
 *
 * The point of this package is the site it produces, and every layer below is
 * only evidence about it: a translation that is correct in a unit test and wrong
 * on the command line has still shipped a broken site. So the assertions here
 * are about published HTML — that the order asked for is the order rendered.
 *
 * One site is built for all of them, deliberately. Each build starts a Node
 * process and renders markdown, which is seconds rather than milliseconds, and a
 * suite that pays that per assertion stops being run. One fixture carrying every
 * feature under test costs one process and reads as a realistic site rather than
 * as eight synthetic ones. What can be decided without building — a settings
 * file that names a page which does not exist — is tested below without a build.
 */

/**
 * The ceiling is for a machine under load, not for a healthy build.
 *
 * A build is a Node process that loads a renderer and renders markdown. On an
 * idle machine that is seconds; on a busy one — a shared CI runner, a laptop
 * with an antivirus scanning every file a new process opens — the same work has
 * been measured an order of magnitude slower. A ceiling tight enough to catch
 * "this hung" would turn those machines' passing runs into flaky ones, so it is
 * set to catch a hang and nothing else.
 */
const SPAWNS_A_PROCESS = 300_000;

const temporary: string[] = [];

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canopy-page-build-"));
  temporary.push(root);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(root, rel), content, "utf8");
  }
  return root;
}

async function cleanup(): Promise<void> {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

/** Sidebar link targets, in the order the shell rendered them. */
function sidebarOrder(html: string): string[] {
  const sidebar = html.slice(html.indexOf("canopy-sidebar"), html.indexOf("<main"));
  return [...sidebar.matchAll(/href="([^"]+)"/g)].map((match) => match[1] as string);
}

describe("canopyArgs", () => {
  // A translation test, not a build: it only needs a LoadedSite shape, not a
  // real site on disk, so it runs without spawning a process.
  const SITE_ROOT = path.join(tmpdir(), "canopy-page-build-args-site");
  const SEARCH_ASSETS = { stylesheetPath: "/work/canopy-page.css", scriptPath: "/work/script.js" };

  function siteWith(overrides: Partial<Settings>): LoadedSite {
    const settings: Settings = { ...overrides };
    const index = indexSite({ pages: [], assets: [] });
    return {
      root: SITE_ROOT,
      settings,
      index,
      nav: translateNav(settings, index),
      unusedExclusions: [],
      sources: new Map(),
      layout: undefined,
      fragments: new Map(),
    };
  }

  // Published where they stand rather than carried, so a relative url() in a
  // site's stylesheet resolves as its author wrote it.
  it("links the site's styles where they are published, and carries only canopy-page's own CSS", () => {
    const args = canopyArgs(
      siteWith({ styles: ["brand.css", "theme/layout.css"] }),
      "/out",
      undefined,
      SEARCH_ASSETS,
    );
    const carried = args.flatMap((arg, i) => (arg === "--stylesheet" ? [args[i + 1]] : []));
    const linked = args.flatMap((arg, i) => (arg === "--site-stylesheet" ? [args[i + 1]] : []));
    expect(carried).toEqual([SEARCH_ASSETS.stylesheetPath]);
    expect(linked).toEqual(["brand.css", "theme/layout.css"]);
    expect(args.join(" ")).not.toContain("--exclude brand.css");
  });

  it("passes the logo and both halves of the home link", () => {
    const args = canopyArgs(
      siteWith({ logo: "assets/logo.svg", home: { url: "https://example.test/", label: "제품 홈" } }),
      "/out",
      undefined,
      SEARCH_ASSETS,
    );
    expect(args.join(" ")).toContain("--site-logo assets/logo.svg");
    expect(args.join(" ")).toContain("--home-url https://example.test/");
    expect(args).toContain("제품 홈");
  });

  it("always wires canopy-page's own stylesheet and script, with no settings field", () => {
    const args = canopyArgs(siteWith({}), "/out", undefined, SEARCH_ASSETS);
    expect(args[args.indexOf("--stylesheet") + 1]).toBe(SEARCH_ASSETS.stylesheetPath);
    expect(args).not.toContain("--tokens-css");
    expect(args[args.indexOf("--script") + 1]).toBe(SEARCH_ASSETS.scriptPath);
    expect(args.join(" ")).toContain("--search-index search-index.json");
  });

  it("passes each rehype plugin through as its own --rehype-plugin flag", () => {
    const args = canopyArgs(
      siteWith({ rehypePlugins: ["rehype-declart", "rehype-mermaid"] }),
      "/out",
      undefined,
      SEARCH_ASSETS,
    );
    expect(args.join(" ")).toContain("--rehype-plugin rehype-declart --rehype-plugin rehype-mermaid");
  });

  it("asks canopy for a feed of each section that wants one", () => {
    const args = canopyArgs(
      siteWith({
        siteUrl: "https://example.test",
        sections: [{ path: "release-notes", feed: true }, { path: "guide" }, { path: "blog", feed: true }],
      }),
      "/out",
      undefined,
      SEARCH_ASSETS,
    );
    expect(args.join(" ")).toContain("--feed release-notes --feed blog");
    expect(args.filter((arg) => arg === "--feed")).toHaveLength(2);
  });

  it("has no --rehype-plugin flag when a site names none", () => {
    const args = canopyArgs(siteWith({}), "/out", undefined, SEARCH_ASSETS);
    expect(args).not.toContain("--rehype-plugin");
  });

  it("passes reader chrome string overrides as a JSON --strings flag", () => {
    const args = canopyArgs(
      siteWith({ strings: { search: "검색", toggleTheme: "테마 전환" } }),
      "/out",
      undefined,
      SEARCH_ASSETS,
    );
    const value = args[args.indexOf("--strings") + 1] as string;
    expect(JSON.parse(value)).toEqual({ search: "검색", toggleTheme: "테마 전환" });
  });

  it("has no --strings flag when a site overrides none", () => {
    const args = canopyArgs(siteWith({}), "/out", undefined, SEARCH_ASSETS);
    expect(args).not.toContain("--strings");
  });
});

describe("buildSite", () => {
  let out: string;
  let exitCode: number;
  let warnings: string;
  let home: string;
  let published: string[];

  beforeAll(async () => {
    const root = await fixture({
      "settings.json": JSON.stringify({
        title: "Handbook",
        description: "How to use it",
        lang: "en-GB",
        exclude: ["_drafts"],
        styles: "brand.css",
        siteUrl: "https://example.test/handbook",
        sections: [{ path: "release-notes", label: "Release notes", order: "desc", feed: true }],
        strings: { searchFailed: "Could not load search." },
      }),
      "brand.css": ":root { --accent: #0a7c5a; }\n",
      "index.md": "# Home\n\nSee [[guide/install]].\n",
      "guide/install.md": "# Install\n",
      "about.md": "# About\n",
      "release-notes/index.md": "---\nlisting: true\n---\n# Changes\n",
      "release-notes/2026-04.md": "---\ndate: 2026-04-01\ndescription: Spring\n---\n# April\n",
      "release-notes/2026-08.md": "---\ndate: 2026-08-01\n---\n# August\n",
      "_drafts/wip.md": "# Work in progress\n",
      // A settings file *inside* the site is content: only the one at its root
      // configures the build, and the exclusion has to tell the two apart.
      "guide/settings.json": '{"example": true}',
    });
    out = path.join(path.dirname(root), `${path.basename(root)}-out`);
    temporary.push(out);

    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    exitCode = await buildSite({ dir: root, out });
    warnings = warned.mock.calls.flat().join("\n");
    warned.mockRestore();

    home = await readFile(path.join(out, "index.html"), "utf8");
    published = await readdir(out);
  }, SPAWNS_A_PROCESS);

  afterAll(cleanup);

  it("builds the site and leaves with a success code", () => {
    expect(exitCode).toBe(0);
    expect(published).toContain("index.html");
  });

  // Wave 2's search wiring is unconditional (no settings field), so every
  // build carries it — this fixture names no search-related setting at all.
  it("wires search unconditionally, with no settings field asking for it", async () => {
    expect(published).toContain("search-index.json");
    expect(home).toContain('class="canopy-search"');
    expect(home).toMatch(/<script[^>]*src="assets\/script\.js"/);
    const assets = await readdir(path.join(out, "assets"));
    expect(assets).toContain("script.js");
  });

  it("links canopy-page's layered CSS, then the site's own styles, after canopy's", async () => {
    const own = await readFile(path.join(out, "assets", "stylesheet-1.css"), "utf8");
    expect(own.startsWith("@layer canopy-page {")).toBe(true);
    expect(own).toContain(".canopy-search");
    // canopy's own token file stays canopy's: nothing of canopy-page's rides in it any more.
    expect(await readFile(path.join(out, "tokens.css"), "utf8")).not.toContain(".canopy-search");
    const at = (sheet: string) => home.indexOf(`href="${sheet}"`);
    expect(at("styles.css")).toBeLessThan(at("assets/stylesheet-1.css"));
    expect(at("assets/stylesheet-1.css")).toBeLessThan(at("brand.css"));
  });

  it("publishes the site's styles file at its own path", async () => {
    expect(await readFile(path.join(out, "brand.css"), "utf8")).toContain("--accent: #0a7c5a");
  });

  it("passes the site's own settings through to the published page", () => {
    expect(home).toContain("Handbook");
    expect(home).toContain('lang="en-GB"');
    expect(home).toContain("How to use it");
  });

  // Building the whole site in one pass is what makes cross-references resolve;
  // building each section separately would leave this link dangling.
  it("resolves a link from one part of the site to another", () => {
    expect(home).toContain('href="guide/install.html"');
  });

  it("renders a section in the order the settings ask for", () => {
    const order = sidebarOrder(home);
    expect(order.indexOf("release-notes/2026-08.html")).toBeLessThan(
      order.indexOf("release-notes/2026-04.html"),
    );
  });

  it("leaves excluded folders unpublished", () => {
    expect(published).not.toContain("_drafts");
  });

  // The settings → canopy wiring end to end: `"feed": true` has to reach canopy
  // as a flag it understands, or the feed silently never appears.
  it("publishes a feed section's dated pages as an Atom feed, linked from the section", async () => {
    const feed = await readFile(path.join(out, "release-notes", "feed.xml"), "utf8");
    expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-GB">');
    expect(feed).toContain("<id>https://example.test/handbook/release-notes/feed.xml</id>");
    expect(feed.indexOf("<title>August</title>")).toBeLessThan(feed.indexOf("<title>April</title>"));
    expect(feed).not.toContain("<title>Changes</title>");
    const note = await readFile(path.join(out, "release-notes", "2026-04.html"), "utf8");
    expect(note).toContain('<link rel="alternate" type="application/atom+xml"');
    expect(note).toContain('<time datetime="2026-04-01">');
    expect(home).not.toContain("application/atom+xml");
  });

  it("lists a series on an index page that asks for it", async () => {
    const index = await readFile(path.join(out, "release-notes", "index.html"), "utf8");
    expect(index).toContain('<ul class="canopy-listing">');
    expect(index).toContain("<p>Spring</p>");
  });

  // The settings file configures the site; it is not part of its content. A
  // file of the same name deeper in the site is content, and ships.
  it("keeps the site's settings file out of the published site", async () => {
    expect(published).not.toContain("settings.json");
    expect(await readdir(path.join(out, "guide"))).toContain("settings.json");
  });

  it("publishes a page no section covers, and says that it did", () => {
    expect(published).toContain("about.html");
    expect(warnings).toContain("about.md");
  });

  // assets/script.js is canopy-page's own asset (assembleScript), not
  // something canopy renders, so this is the one settings.strings key not
  // provable from canopy's HTML output — it has to be read back from the
  // published script itself.
  it("carries a settings.strings.searchFailed override into the published script", async () => {
    const script = await readFile(path.join(out, "assets", "script.js"), "utf8");
    expect(script).toContain('"Could not load search."');
    expect(script).not.toContain("Search failed to load.");
  });
});

describe("buildSite with a layout", () => {
  afterEach(cleanup);

  it("builds a stream section in a host's own header and footer, keeping the fragments off the site", async () => {
    const root = await fixture({
      "settings.json": JSON.stringify({
        title: "Example",
        sections: [
          {
            path: "blog",
            label: "Journal",
            profile: "stream",
            regions: { header: "partials/header.html", footer: "partials/footer.html" },
          },
        ],
      }),
      "index.md": "# Home\n",
      "blog/first.md": "---\ndate: 2026-09-01\n---\n# First\n",
      "blog/second.md": "---\ndate: 2026-10-01\n---\n# Second\n",
      "partials/header.html":
        '<header class="host"><a href="index.html">Host</a><canopy-slot name="back"></canopy-slot></header>',
      "partials/footer.html": '<footer class="host">Host footer</footer>',
    });
    const out = path.join(path.dirname(root), `${path.basename(root)}-out`);
    temporary.push(out);

    expect(await buildSite({ dir: root, out })).toBe(0);

    const post = await readFile(path.join(out, "blog", "first.html"), "utf8");
    expect(post).toContain(
      '<header class="host"><a href="../index.html">Host</a><a class="canopy-back" href="index.html">Journal</a></header>',
    );
    expect(post).toContain('<footer class="host">Host footer</footer>');
    const index = await readFile(path.join(out, "blog", "index.html"), "utf8");
    expect(index.indexOf("second.html")).toBeLessThan(index.indexOf("first.html"));
    await expect(readFile(path.join(out, "partials", "header.html"), "utf8")).rejects.toThrow();
  }, SPAWNS_A_PROCESS);
});

describe("buildSite: a site's own robots.txt", () => {
  afterEach(cleanup);

  it("publishes it as written instead of writing one", async () => {
    const root = await fixture({
      "settings.json": JSON.stringify({ siteUrl: "https://example.org/docs" }),
      "index.md": "# Home\n",
      "robots.txt": "User-agent: *\nDisallow: /drafts/\n",
    });
    const out = path.join(path.dirname(root), `${path.basename(root)}-out`);
    temporary.push(out);
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await buildSite({ dir: root, out })).toBe(0);

    expect(await readFile(path.join(out, "robots.txt"), "utf8")).toBe("User-agent: *\nDisallow: /drafts/\n");
    expect(await readFile(path.join(out, "sitemap.xml"), "utf8")).toContain("<urlset");
  }, SPAWNS_A_PROCESS);
});

describe("buildSite failures", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  // A settings file that names a page which does not exist cannot be made right
  // by anything in the site, so it stops the build before canopy is run at all.
  it("fails on a reference to a page that does not exist", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await fixture({
      "settings.json": JSON.stringify({ sections: [{ path: "guide", items: ["guide/nope"] }] }),
      "index.md": "# Home\n",
      "guide/install.md": "# Install\n",
    });

    expect(await buildSite({ dir: root, out: path.join(root, "out") })).toBe(1);
    expect(errors.mock.calls.flat().join("\n")).toContain('"guide/nope" matches no page');
  });

  it("says which file is wrong when the settings do not parse", async () => {
    const root = await fixture({ "settings.json": "{ oops }", "index.md": "# Home\n" });
    await expect(buildSite({ dir: root, out: path.join(root, "out") })).rejects.toThrow(
      /settings\.json: not valid JSON/,
    );
  });

  it("says so when there is no settings file", async () => {
    const root = await fixture({ "index.md": "# Home\n" });
    await expect(buildSite({ dir: root, out: path.join(root, "out") })).rejects.toThrow(
      /no settings\.json/,
    );
  });
});

describe("canopyArgs: layout and feeds", () => {
  const SEARCH_ASSETS = { stylesheetPath: "/work/canopy-page.css", scriptPath: "/work/script.js" };
  function siteWith(overrides: Partial<Settings>): LoadedSite {
    const settings: Settings = { ...overrides };
    const index = indexSite({ pages: [], assets: [] });
    return {
      root: path.join(tmpdir(), "canopy-page-build-args-site"),
      settings,
      index,
      nav: translateNav(settings, index),
      unusedExclusions: [],
      sources: new Map(),
      layout: undefined,
      fragments: new Map(),
    };
  }

  it("hands canopy the layout file when there is one", () => {
    const args = canopyArgs(siteWith({}), "/out", undefined, SEARCH_ASSETS, "/work/layout.json");
    expect(args.slice(args.indexOf("--layout"), args.indexOf("--layout") + 2)).toEqual([
      "--layout",
      "/work/layout.json",
    ]);
    expect(canopyArgs(siteWith({}), "/out", undefined, SEARCH_ASSETS)).not.toContain("--layout");
  });

  it("asks for a feed for every stream section once there is a siteUrl", () => {
    const args = canopyArgs(
      siteWith({ siteUrl: "https://example.test", sections: [{ path: "blog", profile: "stream" }] }),
      "/out",
      undefined,
      SEARCH_ASSETS,
    );
    expect(args.slice(args.indexOf("--feed"), args.indexOf("--feed") + 2)).toEqual(["--feed", "blog"]);
  });
});

describe("canopyArgs: where the site is published", () => {
  const SEARCH_ASSETS = { stylesheetPath: "/work/canopy-page.css", scriptPath: "/work/script.js" };
  function siteWith(overrides: Partial<Settings>): LoadedSite {
    const settings: Settings = { ...overrides };
    const index = indexSite({ pages: [], assets: [] });
    return {
      root: path.join(tmpdir(), "canopy-page-build-args-site"),
      settings,
      index,
      nav: translateNav(settings, index),
      unusedExclusions: [],
      sources: new Map(),
      layout: undefined,
      fragments: new Map(),
    };
  }

  it("passes siteUrl through as --site-url, so canopy can write canonical and og:url", () => {
    const args = canopyArgs(siteWith({ siteUrl: "https://example.test/help" }), "/out", undefined, SEARCH_ASSETS);
    expect(args[args.indexOf("--site-url") + 1]).toBe("https://example.test/help");
  });

  it("passes the preview image and each alternate edition as its own flag", () => {
    const args = canopyArgs(
      siteWith({
        siteUrl: "https://example.test/help",
        previewImage: "assets/cover.png",
        alternates: { ko: "https://example.test/ko/help", "x-default": "https://example.test/help" },
      }),
      "/out",
      undefined,
      SEARCH_ASSETS,
    );
    expect(args[args.indexOf("--site-image") + 1]).toBe("assets/cover.png");
    const alternates = args.flatMap((arg, i) => (arg === "--alternate" ? [args[i + 1]] : []));
    expect(alternates).toEqual(["ko=https://example.test/ko/help", "x-default=https://example.test/help"]);
  });

  it("names none of them without a site URL", () => {
    const args = canopyArgs(siteWith({}), "/out", undefined, SEARCH_ASSETS);
    expect(args).not.toContain("--site-url");
    expect(args).not.toContain("--site-image");
    expect(args).not.toContain("--alternate");
  });
});
