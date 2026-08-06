import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSite } from "./check.js";
import { initSite, InitError, titleFromDirectory } from "./init.js";
import { loadSite } from "./site.js";

const temporary: string[] = [];

async function folder(name: string, files: Record<string, string> = {}): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), "canopy-page-init-"));
  temporary.push(parent);
  const root = path.join(parent, name);
  await mkdir(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(root, rel), content, "utf8");
  }
  return root;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("titleFromDirectory", () => {
  it("reads a folder name as a title", () => {
    expect(titleFromDirectory("/x/product-help")).toBe("Product help");
    expect(titleFromDirectory("/x/user_guide")).toBe("User guide");
  });
});

describe("initSite", () => {
  it("writes a settings file naming the site after its folder", async () => {
    const root = await folder("product-help");
    const { settingsPath } = await initSite(root);

    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toEqual({ title: "Product help" });
  });

  // The first thing a new user does is run the next command. It has to work.
  it("leaves a folder that checks and builds", async () => {
    const root = await folder("handbook");
    await initSite(root);

    const site = await loadSite(root);
    expect(site.settings.title).toBe("Handbook");
    expect(await checkSite(root)).toBe(0);
  });

  it("writes a starter page when there is nothing to publish yet", async () => {
    const root = await folder("handbook");
    const { pagePath } = await initSite(root);

    expect(pagePath).toBeDefined();
    expect(await readFile(path.join(root, "index.md"), "utf8")).toContain("# Handbook");
  });

  // Existing markdown is a set of documents being adopted, not a new site.
  it("writes no page into a folder that already has one", async () => {
    const root = await folder("handbook", { "guide/install.md": "# Install\n" });
    const { pagePath } = await initSite(root);

    expect(pagePath).toBeUndefined();
    expect(await readdir(root)).not.toContain("index.md");
  });

  it("creates the folder when it is not there", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "canopy-page-init-"));
    temporary.push(parent);
    const root = path.join(parent, "new-site");

    await initSite(root);
    expect(await readdir(root)).toContain("settings.json");
  });

  // Running init twice is usually a mistake about which folder one is in, and
  // replacing a settings file costs far more than saying so.
  it("refuses to replace a settings file that is already there", async () => {
    const root = await folder("handbook", { "settings.json": '{"title":"Mine"}' });

    await expect(initSite(root)).rejects.toThrow(InitError);
    expect(JSON.parse(await readFile(path.join(root, "settings.json"), "utf8"))).toEqual({
      title: "Mine",
    });
  });
});
