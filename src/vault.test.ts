import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  indexSite,
  listSiteFiles,
  matchesPattern,
  toPageKey,
  unusedExclusions,
} from "./vault.js";

describe("matchesPattern", () => {
  it("matches a directory, written with or without the suffix", () => {
    expect(matchesPattern("drafts/idea.md", "drafts")).toBe(true);
    expect(matchesPattern("drafts/idea.md", "drafts/**")).toBe(true);
    expect(matchesPattern("drafts/idea.md", "drafts/")).toBe(true);
    // A prefix that is not a path segment is a different directory.
    expect(matchesPattern("draftsy/idea.md", "drafts")).toBe(false);
  });

  it("matches an extension at any depth", () => {
    expect(matchesPattern("notes/deep/scratch.tmp", "*.tmp")).toBe(true);
    expect(matchesPattern("notes/scratch.md", "*.tmp")).toBe(false);
  });

  it("matches one exact path", () => {
    expect(matchesPattern("notes/scratch.md", "notes/scratch.md")).toBe(true);
    expect(matchesPattern("notes/other.md", "notes/scratch.md")).toBe(false);
  });

  it("compares case-insensitively, as canopy resolves paths", () => {
    expect(matchesPattern("Drafts/Idea.md", "drafts")).toBe(true);
  });
});

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
  const site = indexSite(["index.md", "guide/install.md", "assets/logo.png"]);

  it("separates pages from the files copied alongside them", () => {
    expect(site.pages).toEqual(["index.md", "guide/install.md"]);
    expect(site.assets).toEqual(["assets/logo.png"]);
  });

  it("resolves a reference however it is written", () => {
    expect(site.resolve("guide/install")).toBe("guide/install.md");
    expect(site.resolve("guide/install.html")).toBe("guide/install.md");
    expect(site.resolve("guide/missing")).toBeUndefined();
  });
});

describe("listSiteFiles", () => {
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
    await write(".obsidian/config.json");
    await write("node_modules/pkg/index.md");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("lists publishable files as sorted relative POSIX paths", async () => {
    expect(await listSiteFiles(root)).toEqual([
      "assets/logo.png",
      "drafts/wip.md",
      "guide/install.md",
      "index.md",
      "scratch.tmp",
    ]);
  });

  it("never publishes tooling state, whatever the settings say", async () => {
    const files = await listSiteFiles(root);
    expect(files.some((file) => file.startsWith(".obsidian/"))).toBe(false);
    expect(files.some((file) => file.startsWith("node_modules/"))).toBe(false);
  });

  // The settings file configures the site; it is not part of its content.
  it("leaves the settings file out of the site", async () => {
    expect(await listSiteFiles(root)).not.toContain("settings.json");
  });

  it("applies exclusion patterns to pages and assets alike", async () => {
    expect(await listSiteFiles(root, ["drafts", "*.tmp"])).toEqual([
      "assets/logo.png",
      "guide/install.md",
      "index.md",
    ]);
  });
});

describe("unusedExclusions", () => {
  it("names a pattern that excluded nothing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "canopy-page-vault-"));
    await mkdir(path.join(root, "docs/_archive"), { recursive: true });
    await writeFile(path.join(root, "docs/_archive/old.md"), "x");
    await writeFile(path.join(root, "index.md"), "x");

    // "_archive" reads like it names that folder, but patterns are relative to
    // the site root, so it matches nothing and the folder ships.
    expect(await unusedExclusions(root, ["_archive", "docs/_archive"])).toEqual(["_archive"]);
    await rm(root, { recursive: true, force: true });
  });

  // An extension pattern is defensive: "*.tmp" in a site with no scratch files
  // is a rule about what may never ship, not a claim that something is there.
  it("says nothing about an extension pattern that matched nothing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "canopy-page-vault-"));
    await writeFile(path.join(root, "index.md"), "x");

    expect(await unusedExclusions(root, ["*.tmp"])).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});
