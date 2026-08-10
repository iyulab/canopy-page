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
  const sidebar = html.slice(html.indexOf("canopy-sidebar"), html.indexOf("canopy-main"));
  return [...sidebar.matchAll(/href="([^"]+)"/g)].map((match) => match[1] as string);
}

describe("canopyArgs", () => {
  // A translation test, not a build: it only needs a LoadedSite shape, not a
  // real site on disk, so it runs without spawning a process.
  const SITE_ROOT = path.join(tmpdir(), "canopy-page-build-args-site");
  const SEARCH_ASSETS = { tokensCssPath: "/work/tokens.css", scriptPath: "/work/script.js" };

  function siteWith(overrides: Partial<Settings>): LoadedSite {
    const settings: Settings = { ...overrides };
    const index = indexSite([]);
    return {
      root: SITE_ROOT,
      settings,
      index,
      nav: translateNav(settings, index),
      unusedExclusions: [],
    };
  }

  it("excludes a site's own tokens file from the published site", () => {
    const args = canopyArgs(siteWith({ tokens: "brand.css" }), "/out", undefined, SEARCH_ASSETS);
    // Configuration, not content: canopy would otherwise also copy it as an asset.
    // The file's content itself is folded into the assembled tokens CSS
    // upstream of canopyArgs (assembleTokensCss), not passed here directly.
    expect(args.join(" ")).toContain("--exclude brand.css");
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

  it("always wires the assembled tokens CSS and script, with no settings field", () => {
    // No `tokens` in settings — the point is that these ride unconditionally.
    const args = canopyArgs(siteWith({}), "/out", undefined, SEARCH_ASSETS);
    expect(args[args.indexOf("--tokens-css") + 1]).toBe(SEARCH_ASSETS.tokensCssPath);
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
        sections: [{ path: "release-notes", label: "Release notes", order: "desc" }],
        strings: { searchFailed: "Could not load search." },
      }),
      "index.md": "# Home\n\nSee [[guide/install]].\n",
      "guide/install.md": "# Install\n",
      "about.md": "# About\n",
      "release-notes/2026-04.md": "# April\n",
      "release-notes/2026-08.md": "# August\n",
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

  // The site names no `tokens` field, which is exactly the case the Wave 2
  // fix targets: canopy-page's own CSS (search, scrollspy) must still ride
  // via --tokens-css even though there is no user tokens file to append it to.
  it("ships its own CSS even when the site has no tokens file of its own", async () => {
    const tokensCss = await readFile(path.join(out, "tokens.css"), "utf8");
    expect(tokensCss).toContain(".canopy-search");
    expect(tokensCss).toContain(".canopy-outline");
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
