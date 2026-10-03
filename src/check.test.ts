import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkSite,
  dateFindings,
  descriptionFindings,
  filenameEncodingFindings,
  referenceFindings,
} from "./check.js";
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
  return referenceFindings(await loadSite(root)).map((finding) => finding.message);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// Loading a site asks canopy for its file listing (`canopy list`), a fresh Node
// process — the same hang-only ceiling reasoning as build.test.ts's
// SPAWNS_A_PROCESS.
const LOADS_A_SITE = 120_000;

describe("referenceFindings", { timeout: LOADS_A_SITE }, () => {
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

  // The renderer does not read a backslash as a directory separator, so it
  // leaves such a link as written and it breaks on the published site. The
  // check applies canopy's own resolution and says so, rather than quietly
  // resolving what the renderer will not.
  it("agrees with the renderer that a backslash is not a path separator", async () => {
    const messages = await findings({
      "index.md": "[install](guide\\install.md)",
      "guide/install.md": "# Install",
    });
    expect(messages).toEqual(['index.md:1: link "guide\\install.md" points at nothing published']);
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
    const [finding] = referenceFindings(await loadSite(root));

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
    expect(referenceFindings(await loadSite(root))).toEqual([]);
  });

  it("says nothing about a resolvable root-absolute path when siteUrl mounts at the domain root", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ siteUrl: "https://example.test/" }),
      "index.md": "[install](/guide/install)",
      "guide/install.md": "# Install",
    });
    expect(referenceFindings(await loadSite(root))).toEqual([]);
  });

  it("warns about a root-absolute path nothing in the site answers", async () => {
    const root = await site({
      "settings.json": "{}",
      "index.md": "![shot](/assets/orders.png)",
      "public/assets/orders.png": "binary",
    });
    const [finding] = referenceFindings(await loadSite(root));

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
    const messages = referenceFindings(await loadSite(root)).map((f) => f.message);
    expect(messages[0]).toContain("points at nothing published");
  });
});

describe("filenameEncodingFindings", { timeout: LOADS_A_SITE }, () => {
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

describe("checkSite", { timeout: LOADS_A_SITE }, () => {
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

describe("a target that names a directory", { timeout: LOADS_A_SITE }, () => {
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
    const [finding] = referenceFindings(await loadSite(root));
    expect(finding?.level).toBe("warning");
    expect(finding?.message).toContain("update-note/");
  });
});

describe("descriptionFindings", { timeout: LOADS_A_SITE }, () => {
  async function descriptions(files: Record<string, string>): Promise<string[]> {
    const root = await site(files);
    return descriptionFindings(await loadSite(root)).map((finding) => finding.message);
  }

  it("says nothing without a site URL — a site nobody searches has nothing to duplicate", async () => {
    expect(
      await descriptions({ "settings.json": "{}", "index.md": "# Home\n", "guide/a.md": "# A\n" }),
    ).toEqual([]);
  });

  it("names every page with no description of its own, in one warning, once siteUrl is set", async () => {
    const messages = await descriptions({
      "settings.json": JSON.stringify({ siteUrl: "https://example.test" }),
      "index.md": "---\ndescription: The front page\n---\n# Home\n",
      "guide/a.md": "# A\n",
      "guide/b.md": "---\ndescription: \"  \"\n---\n# B\n",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('2 page(s) have no "description:"');
    expect(messages[0]).toContain("\n  guide/a.md");
    expect(messages[0]).toContain("\n  guide/b.md");
    expect(messages[0]).not.toContain("index.md");
  });

  it("says nothing when every page describes itself", async () => {
    expect(
      await descriptions({
        "settings.json": JSON.stringify({ siteUrl: "https://example.test" }),
        "index.md": "---\ndescription: The front page\n---\n# Home\n",
      }),
    ).toEqual([]);
  });

  it("is a warning, so checkSite still leaves with a success code", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ siteUrl: "https://example.test" }),
      "index.md": "# Home\n",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await checkSite(root)).toBe(0);
    expect(warn.mock.calls.flat().join("\n")).toContain('no "description:"');
  });
});

describe("knownBroken", { timeout: LOADS_A_SITE }, () => {
  const brokenSite = (knownBroken: unknown[]) => ({
    "settings.json": JSON.stringify({ knownBroken }),
    "index.md": "# Home\n",
    "help/kpi/a.md": "# A\n\n![shot](a.assets/1.png)\n",
    "help/kpi/deep/b.md": "# B\n\n[gone](nowhere.md)\n",
    "help/other.md": "# Other\n\n![shot](other.assets/1.png)\n",
  });
  async function run(files: Record<string, string>): Promise<{ code: number; errors: string; warnings: string }> {
    const root = await site(files);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await checkSite(root);
    return { code, errors: error.mock.calls.flat().join("\n"), warnings: warn.mock.calls.flat().join("\n") };
  }

  it("publishes an excused page's broken references as one warning naming the reason", async () => {
    const result = await run(brokenSite([{ path: "help/kpi/**", reason: "Screenshots being retaken" }]));
    expect(result.errors).toContain('help/other.md:3: image "other.assets/1.png" is not a published file');
    expect(result.errors).not.toContain("help/kpi");
    expect(result.warnings).toContain(
      'settings.knownBroken "help/kpi/**" (Screenshots being retaken): 2 broken reference(s) published anyway:',
    );
    expect(result.warnings).toContain('\n  help/kpi/a.md:3: image "a.assets/1.png" is not a published file');
    // Something broken outside the baseline still fails the check.
    expect(result.code).toBe(1);
  });

  it("passes once everything broken is excused", async () => {
    const result = await run(
      brokenSite([
        { path: "help/kpi/**", reason: "Screenshots being retaken" },
        { path: "help/other", reason: "Page being rewritten" },
      ]),
    );
    expect(result.code).toBe(0);
    expect(result.errors).toBe("");
  });

  it("excuses only the shape a pattern names", async () => {
    // `help/kpi/*` is the pages directly in help/kpi — not deep/b.md.
    const result = await run(brokenSite([{ path: "help/kpi/*", reason: "r" }]));
    expect(result.errors).toContain("help/kpi/deep/b.md:3");
    expect(result.errors).not.toContain("help/kpi/a.md");
  });

  it("asks for an entry to be removed once it excuses nothing", async () => {
    const result = await run({
      "settings.json": JSON.stringify({
        knownBroken: [
          { path: "help/fixed.md", reason: "was missing screenshots" },
          { path: "gone/**", reason: "folder since deleted" },
        ],
      }),
      "index.md": "# Home\n",
      "help/fixed.md": "# Fixed\n",
    });
    expect(result.code).toBe(0);
    expect(result.warnings).toContain(
      'settings.knownBroken "help/fixed.md": nothing there is broken any more — remove the entry',
    );
    expect(result.warnings).toContain('settings.knownBroken "gone/**" matches no page — remove the entry');
  });
});

describe("dateFindings", { timeout: LOADS_A_SITE }, () => {
  async function dates(files: Record<string, string>): Promise<string[]> {
    const root = await site(files);
    return dateFindings(await loadSite(root)).map((finding) => finding.message);
  }

  it("says nothing about a site whose dates are all dates", async () => {
    expect(
      await dates({
        "settings.json": "{}",
        "index.md": "---\ndate: 2026-09-28\nupdated: 2026-10-01T09:30+09:00\n---\n# Home\n",
        "guide/a.md": "# A\n",
      }),
    ).toEqual([]);
  });

  it("names every date canopy will not read as one", async () => {
    const messages = await dates({
      "settings.json": "{}",
      "a.md": "---\ndate: 2026-02-30\n---\n# A\n",
      "b.md": "---\nupdated: 28/09/2026\n---\n# B\n",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("2 frontmatter date(s) are not dates");
    expect(messages[0]).toContain("\n  a.md (date: 2026-02-30)");
    expect(messages[0]).toContain("\n  b.md (updated: 28/09/2026)");
  });

  it("names pages a feed section leaves out for having no date, but not the section's index", async () => {
    const messages = await dates({
      "settings.json": JSON.stringify({
        siteUrl: "https://example.test",
        sections: [{ path: "log", order: "desc", feed: true }, { path: "guide" }],
      }),
      "log/index.md": "# Changes\n",
      "log/2026-09-28.md": "---\ndate: 2026-09-28\n---\n# Dated\n",
      "log/notes.md": "# Undated\n",
      "guide/a.md": "# Not in a feed\n",
    });
    expect(messages).toEqual([
      '1 page(s) in a feed section have no "date:", so the feed leaves them out:\n  log/notes.md',
    ]);
  });
});
