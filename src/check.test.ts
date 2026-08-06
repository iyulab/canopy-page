import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSite, referenceFindings } from "./check.js";
import { loadSite } from "./site.js";

/**
 * Checking never builds, so these are milliseconds: a folder, a read per page,
 * and string work. That is what lets a check sit at the front of a pipeline,
 * and what keeps this file from being the reason nobody runs the suite.
 */

const temporary: string[] = [];

async function site(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canopy-page-check-"));
  temporary.push(root);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(root, rel), content, "utf8");
  }
  return root;
}

async function findings(files: Record<string, string>): Promise<string[]> {
  const root = await site({ "settings.json": "{}", ...files });
  return (await referenceFindings(await loadSite(root))).map((finding) => finding.message);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("referenceFindings", () => {
  it("says nothing about a site whose references all resolve", async () => {
    expect(
      await findings({
        "index.md": "[install](guide/install.md) ![logo](assets/logo.png) [[guide/install]]",
        "guide/install.md": "# Install",
        "assets/logo.png": "binary",
      }),
    ).toEqual([]);
  });

  it("names the page and line of a link that points at nothing", async () => {
    const messages = await findings({ "index.md": "# Home\n\n[gone](guide/gone.md)\n" });
    expect(messages).toEqual(["index.md:3: link \"guide/gone.md\" points at nothing published"]);
  });

  it("catches an image that is not a published file", async () => {
    const messages = await findings({ "index.md": "![shot](assets/missing.png)" });
    expect(messages[0]).toContain('image "assets/missing.png" is not a published file');
  });

  // An unresolved wikilink is not left visibly broken — it renders as plain
  // text — so the message says that, or nobody knows what they are looking for.
  it("catches a wikilink that matches no page, and says how it will render", async () => {
    const messages = await findings({ "index.md": "See [[nowhere]]." });
    expect(messages[0]).toContain("will render as plain text");
  });

  it("resolves a link relative to the page holding it", async () => {
    expect(
      await findings({
        "guide/settings/api.md": "[install](../install.md)",
        "guide/install.md": "# Install",
      }),
    ).toEqual([]);
  });

  it("accepts a link written without its extension", async () => {
    expect(
      await findings({ "index.md": "[install](guide/install)", "guide/install.md": "# Install" }),
    ).toEqual([]);
  });

  it("accepts a wikilink to a note named anywhere in the tree", async () => {
    expect(
      await findings({ "index.md": "[[install]]", "guide/install.md": "# Install" }),
    ).toEqual([]);
  });

  it("ignores what the renderer leaves alone", async () => {
    expect(
      await findings({
        "index.md": [
          "[site](https://example.test)",
          "[mail](mailto:a@example.test)",
          "[deployed](/help/other.html)",
          "[here](#section)",
          "[outside](../beyond.md)",
        ].join("\n\n"),
      }),
    ).toEqual([]);
  });

  it("ignores a fragment on a target that exists", async () => {
    expect(
      await findings({
        "index.md": "[install](guide/install.md#requirements)",
        "guide/install.md": "# Install",
      }),
    ).toEqual([]);
  });

  // Excluded files are not published, so a link into them is dead in the site
  // even though the file is right there in the folder.
  it("reports a link into an excluded folder", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ exclude: ["_drafts"] }),
      "index.md": "[draft](_drafts/wip.md)",
      "_drafts/wip.md": "# Work in progress",
    });
    const messages = (await referenceFindings(await loadSite(root))).map((f) => f.message);
    expect(messages[0]).toContain("points at nothing published");
  });
});

describe("checkSite", () => {
  it("leaves with a success code and says what it checked", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const root = await site({ "settings.json": "{}", "index.md": "# Home" });

    expect(await checkSite(root)).toBe(0);
    expect(log.mock.calls.flat().join("")).toContain("1 page(s) checked");
  });

  it("leaves with a failure code when something is broken", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await site({ "settings.json": "{}", "index.md": "[gone](nope.md)" });

    expect(await checkSite(root)).toBe(1);
    expect(errors.mock.calls.flat().join("")).toContain("nope.md");
  });

  it("reports what the settings got wrong as well as what the pages did", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await site({
      "settings.json": JSON.stringify({ sections: [{ path: "guide", items: ["guide/nope"] }] }),
      "index.md": "[gone](nope.md)",
      "guide/install.md": "# Install",
    });

    expect(await checkSite(root)).toBe(1);
    const reported = errors.mock.calls.flat().join("\n");
    expect(reported).toContain('"guide/nope" matches no page');
    expect(reported).toContain("nope.md");
  });
});
