import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { indexSite, listSite, publishingExcludes, toPageKey } from "./vault.js";

// listSite spawns canopy (`canopy list`), a fresh Node process per call — the
// same hang-only ceiling reasoning as build.test.ts's SPAWNS_A_PROCESS.
const SPAWNS_CANOPY = 120_000;

describe("toPageKey", () => {
  it("reduces every way of writing a page to one key", () => {
    const key = toPageKey("guide/install.md");
    expect(toPageKey("guide/install")).toBe(key);
    expect(toPageKey("guide/install.html")).toBe(key);
    expect(toPageKey("guide\\install.md")).toBe(key);
    expect(toPageKey("/guide/install.md")).toBe(key);
    expect(toPageKey("./guide/install.md")).toBe(key);
    expect(toPageKey("Guide/Install.MD")).toBe(key);
  });
});

describe("indexSite", () => {
  const site = indexSite({ pages: ["guide/install.md", "index.md"], assets: ["assets/logo.png"] });

  it("keeps canopy's split between pages and the files copied alongside them", () => {
    expect(site.pages).toEqual(["guide/install.md", "index.md"]);
    expect(site.assets).toEqual(["assets/logo.png"]);
  });

  it("resolves a reference however it is written", () => {
    expect(site.resolve("guide/install")).toBe("guide/install.md");
    expect(site.resolve("guide/install.html")).toBe("guide/install.md");
    expect(site.resolve("guide/missing")).toBeUndefined();
  });
});

describe("publishingExcludes", () => {
  it("always leaves the settings file out, then the styles files, then the author's own", () => {
    expect(publishingExcludes({})).toEqual(["settings.json"]);
    expect(publishingExcludes({ styles: ["brand.css", "theme/layout.css"], exclude: ["drafts"] })).toEqual([
      "settings.json",
      "brand.css",
      "theme/layout.css",
      "drafts",
    ]);
  });
});

describe("listSite", { timeout: SPAWNS_CANOPY }, () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "canopy-page-vault-"));
    const write = async (rel: string) => {
      await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
      await writeFile(path.join(root, rel), "x");
    };
    await write("settings.json");
    await write("index.md");
    await write("guide/install.md");
    await write("assets/logo.png");
    await write("drafts/wip.md");
    await write("scratch.tmp");
    await write(".env");
    await write(".obsidian/config.json");
    await write("node_modules/pkg/index.md");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // The listing is canopy's answer, not a restatement of its rules: hidden
  // files (.env) and directories and node_modules are left out because canopy
  // leaves them out of a build.
  it("returns what canopy would publish, split into pages and assets", async () => {
    expect(await listSite(root, publishingExcludes({ exclude: ["drafts", "*.tmp"] }))).toEqual({
      pages: ["guide/install.md", "index.md"],
      assets: ["assets/logo.png"],
      unusedExcludes: [],
    });
  });

  it("reports a place-naming exclusion that matched nothing", async () => {
    const listing = await listSite(root, ["_archive", "*.bak"]);
    expect(listing.unusedExcludes).toEqual(["_archive"]);
  });
});
