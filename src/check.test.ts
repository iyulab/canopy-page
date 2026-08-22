import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSite, filenameEncodingFindings, referenceFindings } from "./check.js";
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
          "[here](#section)",
          "[outside](../beyond.md)",
        ].join("\n\n"),
      }),
    ).toEqual([]);
  });

  // A root-absolute path resolves against wherever the site is mounted, which
  // this cannot know — but it can say whether the site holds anything at that
  // path at all, and a site served from the root is the common case.
  it("says nothing about a root-absolute path the site can answer", async () => {
    expect(
      await findings({
        "index.md": "[install](/guide/install) ![logo](/assets/logo.png)",
        "guide/install.md": "# Install",
        "assets/logo.png": "binary",
      }),
    ).toEqual([]);
  });

  // siteUrl carrying a path is the one place settings already say where the
  // site is mounted — a root-absolute reference that resolves today would
  // still break there, so silence would be wrong precisely because it looks
  // safe.
  it("warns about a resolvable root-absolute path when siteUrl declares a sub-path mount", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ siteUrl: "https://example.test/help/" }),
      "index.md": "[install](/guide/install)",
      "guide/install.md": "# Install",
    });
    const [finding] = await referenceFindings(await loadSite(root));

    expect(finding?.level).toBe("warning");
    expect(finding?.message).toContain('"/guide/install"');
    expect(finding?.message).toContain("/help/");
  });

  // settings.ts only checks that siteUrl starts with "http(s)://" — "http://"
  // itself passes that check but has no host, so `new URL` throws on it. The
  // checker has to survive a value this malformed rather than crash the run.
  it("does not crash on a siteUrl that passes settings validation but has no host", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ siteUrl: "http://" }),
      "index.md": "[install](/guide/install)",
      "guide/install.md": "# Install",
    });
    await expect(referenceFindings(await loadSite(root))).resolves.toEqual([]);
  });

  it("says nothing about a resolvable root-absolute path when siteUrl mounts at the domain root", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ siteUrl: "https://example.test/" }),
      "index.md": "[install](/guide/install)",
      "guide/install.md": "# Install",
    });
    expect(await referenceFindings(await loadSite(root))).toEqual([]);
  });

  it("warns about a root-absolute path nothing in the site answers", async () => {
    const root = await site({
      "settings.json": "{}",
      "index.md": "![shot](/assets/orders.png)",
      "public/assets/orders.png": "binary",
    });
    const [finding] = await referenceFindings(await loadSite(root));

    // A warning, not an error: mounting the site under a prefix would make it
    // right, and a checker has no standing to call that a mistake.
    expect(finding?.level).toBe("warning");
    expect(finding?.message).toContain('"/assets/orders.png"');
    expect(finding?.message).toContain("assets/orders.png");
  });

  // The destination of an unbracketed link ends at the first space, so a path
  // written with a raw space is cut short. That is what the renderer does too,
  // which is why the message has to name the cause: the target reported is not
  // the one the author wrote, and nothing else in the line says why.
  it("says why a link destination stopped at a space", async () => {
    const messages = await findings({
      "guide/install.md": "[report](../reports 2026/summary.md)",
      "reports 2026/summary.md": "# Summary",
    });
    expect(messages[0]).toContain("space");
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

describe("filenameEncodingFindings", () => {
  it("warns about a page whose filename needs percent-encoding in its URL", async () => {
    const root = await site({
      "settings.json": "{}",
      "index.md": "# Home",
      "guide/error messages.md": "# Error messages",
    });
    const messages = filenameEncodingFindings(await loadSite(root)).map((f) => f.message);
    expect(messages).toEqual([
      'guide/error messages.md: published URL is "guide/error%20messages.html" ' +
        "(rename to avoid the encoding, or ignore if intentional)",
    ]);
  });

  it("warns about an asset with the same problem, unchanged extension", async () => {
    const root = await site({
      "settings.json": "{}",
      "index.md": "# Home",
      "assets/team photo.png": "not a real png",
    });
    const messages = filenameEncodingFindings(await loadSite(root)).map((f) => f.message);
    expect(messages).toEqual([
      'assets/team photo.png: published URL is "assets/team%20photo.png" ' +
        "(rename to avoid the encoding, or ignore if intentional)",
    ]);
  });

  it("says nothing about filenames that already round-trip through encodeURIComponent", async () => {
    const root = await site({
      "settings.json": "{}",
      "index.md": "# Home",
      "guide/install.md": "# Install",
      "assets/logo.png": "not a real png",
    });
    expect(filenameEncodingFindings(await loadSite(root))).toEqual([]);
  });

  it("says nothing about a non-ASCII filename — every character in it needs encoding, but that's the language, not a mistake", async () => {
    const root = await site({
      "settings.json": "{}",
      "index.md": "# Home",
      "guide/한국어-예시/index.md": "# 한국어 예시",
    });
    expect(filenameEncodingFindings(await loadSite(root))).toEqual([]);
  });

  it("still warns when an ASCII mistake sits alongside non-ASCII content", async () => {
    const root = await site({
      "settings.json": "{}",
      "index.md": "# Home",
      "guide/오류 목록.md": "# 오류 목록",
    });
    const messages = filenameEncodingFindings(await loadSite(root)).map((f) => f.message);
    expect(messages).toEqual([
      'guide/오류 목록.md: published URL is "guide/%EC%98%A4%EB%A5%98%20%EB%AA%A9%EB%A1%9D.html" ' +
        "(rename to avoid the encoding, or ignore if intentional)",
    ]);
  });

  it("is a warning, so checkSite still leaves with a success code", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const root = await site({
      "settings.json": "{}",
      "guide/error messages.md": "# Error messages",
    });

    expect(await checkSite(root)).toBe(0);
    expect(log.mock.calls.flat().join("")).toContain("1 warning(s)");
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

  it("warns, but still succeeds, when a section's sidebar heading falls back to a raw directory name", async () => {
    // No "label" and no guide/index.md — nothing left to name the section but
    // its own directory, which is a filesystem detail rather than a name an
    // author chose. Publishable either way (warning, not error): the build is
    // not wrong to fall back, only silent about having done so.
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = await site({
      "settings.json": JSON.stringify({ sections: [{ path: "guide" }] }),
      "index.md": "# Home",
      "guide/install.md": "# Install",
    });

    expect(await checkSite(root)).toBe(0);
    const reported = warnings.mock.calls.flat().join("\n");
    expect(reported).toContain('section "guide" has no "label" and no index page');
    expect(reported).toContain('falls back to the directory name "guide"');
  });

  it("does not warn about a raw slug label when the section has its own label or index page", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = await site({
      "settings.json": JSON.stringify({ sections: [{ path: "guide", label: "Guide" }] }),
      "index.md": "# Home",
      "guide/install.md": "# Install",
    });

    expect(await checkSite(root)).toBe(0);
    expect(warnings.mock.calls.flat().join("\n")).not.toContain("falls back to the directory name");
  });
});

describe("a target that names a directory", () => {
  // A directory is served by its index page, so a trailing slash is a working
  // link — reading it as a missing file reports a sound site as broken.
  it("resolves to the page the directory is entered by", async () => {
    expect(
      await findings({
        "index.md": "[notes](/update-note/) [guide](guide/)",
        "update-note/index.md": "# Notes",
        "guide/index.md": "# Guide",
      }),
    ).toEqual([]);
  });

  it("still reports a directory with no index page", async () => {
    const root = await site({
      "settings.json": "{}",
      "index.md": "[notes](/update-note/)",
      "update-note/2026-04.md": "# April",
    });
    const [finding] = await referenceFindings(await loadSite(root));
    expect(finding?.level).toBe("warning");
    expect(finding?.message).toContain("update-note/");
  });
});
