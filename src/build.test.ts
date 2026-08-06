import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildSite } from "./build.js";

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
      }),
      "index.md": "# Home\n\nSee [[guide/install]].\n",
      "guide/install.md": "# Install\n",
      "about.md": "# About\n",
      "release-notes/2026-04.md": "# April\n",
      "release-notes/2026-08.md": "# August\n",
      "_drafts/wip.md": "# Work in progress\n",
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

  // The settings file configures the site; it is not part of its content.
  it("keeps the settings file out of the published site", () => {
    expect(published).not.toContain("settings.json");
  });

  it("publishes a page no section covers, and says that it did", () => {
    expect(published).toContain("about.html");
    expect(warnings).toContain("about.md");
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
