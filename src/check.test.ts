import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkSite,
  dateFindings,
  descriptionFindings,
  filenameEncodingFindings,
  imageFindings,
  referenceFindings,
  regionFindings,
} from "./check.js";
import { feedDirs } from "./layout.js";
import { featuredFindings, loadSite, readNextFindings, settingsFindings, tagFindings } from "./site.js";

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

  // A file the renderer does not match keeps the letter case it was written in,
  // and most hosts tell "Guide" from "guide" apart — so such a link leads
  // nowhere once deployed. A link the renderer matches to a page (a `.md`, an
  // `.html` or an extension-less path naming a page, a folder with an index
  // page, or a wikilink) is written in the page's own spelling, so it is not
  // one of them.
  it("names a link or image that reaches its file only by ignoring letter case", async () => {
    const messages = await findings({
      "index.md":
        "# Home\n\n[a](Guide/Install.md) [b](guide/INSTALL.html) [c](Guide/) ![d](IMG/logo.png) [e](IMG/Logo.png)\n",
      "guide/index.md": "# Guide",
      "guide/install.md": "# Install",
      "img/logo.png": "binary",
    });
    const differs = (kind: string, target: string, file: string) =>
      `index.md:3: ${kind} "${target}" reaches "${file}" only by ignoring letter case — the built page keeps ` +
      `"${target}" as written, which leads nowhere on a host that tells letter case apart`;
    expect(messages).toEqual([
      differs("image", "IMG/logo.png", "img/logo.png"),
      differs("link", "IMG/Logo.png", "img/logo.png"),
    ]);
  });

  it("says nothing about a page link the renderer writes in the page's own spelling", async () => {
    expect(
      await findings({
        "index.md":
          "[a](Guide/Install.md) [b](guide/INSTALL.html) [c](GUIDE/install) [d][r] [e](Guide/) [[Guide/Install]]\n\n[r]: Guide/Install.md#top\n",
        "guide/index.md": "# Guide",
        "guide/install.md": "# Install",
      }),
    ).toEqual([]);
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
  it("warns about a root-absolute path outside a sub-path mount that the site publishes at its own root", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ siteUrl: "https://example.test/help/" }),
      "index.md": "[install](/guide/install)",
      "guide/install.md": "# Install",
    });
    const [finding] = referenceFindings(await loadSite(root));

    expect(finding?.level).toBe("warning");
    expect(finding?.message).toBe(
      'index.md:1: link "/guide/install" leaves this site — it is outside settings.siteUrl\'s ' +
        'path "/help/" — though this site publishes "guide/install"; if that page is meant, write ' +
        '"/help/guide/install" or a relative link',
    );
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
  it("finds the index page canopy writes for a stream folder", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ sections: [{ path: "blog", profile: "stream" }] }),
      "index.md": "[blog](blog/) and [its index](blog/index.html)\n",
      "blog/a.md": "---\ndate: 2026-10-01\n---\n# A\n",
    });
    expect(referenceFindings(await loadSite(root))).toEqual([]);
  });

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

  it("names the pages of a stream section with no date, which the stream lists last", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ sections: [{ path: "blog", profile: "stream" }] }),
      "blog/index.md": "# Blog\n",
      "blog/a.md": "---\ndate: 2026-10-01\n---\n# A\n",
      "blog/b.md": "# B\n",
    });
    expect(dateFindings(await loadSite(root)).map((finding) => finding.message)).toEqual([
      '1 page(s) in a stream section have no "date:" (nor a day in their file name), so the stream lists them last, after every dated page:\n  blog/b.md',
    ]);
  });

  it("warns once about an undated page in a stream section that also has a feed", async () => {
    const messages = await dates({
      "settings.json": JSON.stringify({
        siteUrl: "https://example.test",
        sections: [{ path: "blog", profile: "stream", feed: true }],
      }),
      "blog/index.md": "# Blog\n",
      "blog/b.md": "# B\n",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^1 page\(s\) in a stream section have no "date:"/);
  });

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

  it("dates a page by its file name, and names one whose date: says another day", async () => {
    const messages = await dates({
      "settings.json": JSON.stringify({ sections: [{ path: "blog", profile: "stream" }] }),
      "blog/index.md": "# Blog\n",
      "blog/2026-10-01-named.md": "# Named only\n",
      "blog/2026-10-02-same.md": "---\ndate: 2026-10-02T09:00:00+09:00\n---\n# Same day\n",
      "blog/2026-10-03-launch.md": "---\ndate: 2026-10-05\n---\n# Moved\n",
    });
    expect(messages).toEqual([
      '1 page(s) say a different day in "date:" than their file name does; "date:" wins, so each page\'s URL ' +
        "and its date disagree:\n  blog/2026-10-03-launch.md (date: 2026-10-05)",
    ]);
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
      '1 page(s) in a feed section have no "date:" (nor a day in their file name), so the feed leaves them out:\n  log/notes.md',
    ]);
  });
});

describe("settingsFindings — styles", { timeout: LOADS_A_SITE }, () => {
  it("refuses a site file where canopy-page writes its own stylesheet", async () => {
    const root = await site({ "settings.json": "{}", "index.md": "# Home\n", "assets/stylesheet-1.css": "a{}" });
    expect(settingsFindings(await loadSite(root)).map((finding) => finding.message)).toEqual([
      "assets/stylesheet-1.css: the build writes canopy-page's own stylesheet at this path, so the site cannot " +
        "publish a file there — rename or move it",
    ]);
  });

  it("refuses a styles file named like one of canopy's own, and every other path the build writes", async () => {
    const root = await site({
      "settings.json": JSON.stringify({
        siteUrl: "https://example.org/docs",
        styles: ["tokens.css"],
        sections: [{ path: "log", feed: true }],
      }),
      "index.md": "# Home\n",
      "index.html": "<p>hand-written</p>",
      "tokens.css": ":root {}",
      "search-index.json": "[]",
      "sitemap.xml": "<urlset/>",
      "robots.txt": "User-agent: *",
      "log/2026-09-28.md": "# Dated\n",
      "log/feed.xml": "<feed/>",
    });
    const messages = settingsFindings(await loadSite(root)).map((finding) => finding.message);
    const wrote = (file: string, what: string) =>
      `${file}: the build writes ${what} at this path, so the site cannot publish a file there — rename or move it`;
    expect(messages).toEqual([
      wrote("index.html", "the page rendered from index.md"),
      wrote("log/feed.xml", 'the feed of section "log"'),
      wrote("search-index.json", "the search index"),
      wrote("tokens.css", "canopy's design tokens"),
      wrote("sitemap.xml", "the sitemap"),
    ]);
  });

  // A stream section with no index page of its own gets one written, so a
  // hand-written index.html there would be replaced by it, or replace it.
  it("refuses a site file where the build writes a stream section's index page", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ sections: [{ path: "blog", profile: "stream" }] }),
      "index.md": "# Home\n",
      "blog/a.md": "---\ndate: 2026-10-01\n---\n# A\n",
      "blog/index.html": "<p>hand-written</p>",
    });
    const messages = settingsFindings(await loadSite(root)).map((finding) => finding.message);
    expect(messages).toEqual([
      'blog/index.html: the build writes the index page of stream section "blog" at this path, so the site cannot ' +
        "publish a file there — rename or move it",
    ]);
  });

  it("reports a styles path with no file behind it, without building", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ styles: ["brand.css", "theme/missing.css"] }),
      "brand.css": ":root {}",
      "index.md": "# Home\n",
    });
    const found = settingsFindings(await loadSite(root));
    expect(found).toEqual([
      {
        kind: "a-stylesheet-is-not-published",
        level: "error",
        message:
          'settings: styles "theme/missing.css" is not a published file (missing, or excluded). ' +
          "Paths are relative to the settings file",
      },
    ]);
  });

  // A stylesheet is linked where it is published, so one the site leaves
  // unpublished would be a link to nothing.
  it("reports a styles path that an exclude pattern leaves unpublished", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ styles: "_drafts/brand.css", exclude: ["_drafts"] }),
      "_drafts/brand.css": ":root {}",
      "index.md": "# Home\n",
    });
    const messages = settingsFindings(await loadSite(root)).map((finding) => finding.message);
    expect(messages).toContain(
      'settings: styles "_drafts/brand.css" is not a published file (missing, or excluded). ' +
        "Paths are relative to the settings file",
    );
  });
});

describe("regionFindings", { timeout: LOADS_A_SITE }, () => {
  async function regionMessages(settings: unknown, files: Record<string, string>): Promise<string[]> {
    const root = await site({ "settings.json": JSON.stringify(settings), "index.md": "# Home\n", ...files });
    return regionFindings(await loadSite(root)).map((finding) => `${finding.level}: ${finding.message}`);
  }

  const settings = {
    regions: { header: "partials/header.html" },
    sections: [{ path: "blog", profile: "stream", regions: { afterArticle: "partials/cta.html" } }],
  };

  it("says nothing when every fragment, slot and link is sound", async () => {
    expect(
      await regionMessages(settings, {
        "partials/header.html":
          '<header><a href="blog/">Blog</a><img src="assets/logo.svg" alt=""><a href="index.html">Home</a>' +
          '<canopy-slot name="search"></canopy-slot></header>',
        "partials/cta.html": '<p><canopy-slot name="page:cta">Try it</canopy-slot></p>',
        "blog/a.md": "---\ndate: 2026-10-01\ncta: Get it\n---\n# A\n",
        "assets/logo.svg": "<svg></svg>",
      }),
    ).toEqual([]);
  });

  // Without a path in siteUrl there is no telling where "/" is, so a
  // root-absolute link to nothing the site publishes is a warning, not an error.
  it("warns about a root-absolute fragment link when siteUrl has no path to check it against", async () => {
    expect(
      await regionMessages({ regions: { footer: "partials/footer.html" } }, {
        "partials/footer.html": '<footer><a href="/pricing">Pricing</a></footer>',
      }),
    ).toEqual([
      'warning: partials/footer.html: link "/pricing" — nothing is published at "pricing". A root-absolute path ' +
        "resolves against wherever the site is served from, so this is right only if something else answers it there",
    ]);
  });

  it("reports a fragment link that reaches its file only by ignoring letter case", async () => {
    expect(
      await regionMessages({ regions: { footer: "partials/footer.html" } }, {
        "partials/footer.html": '<footer><a href="Guide/Install.html">Install</a><img src="img/Logo.svg" alt=""></footer>',
        "guide/install.md": "# Install",
        "img/logo.svg": "<svg></svg>",
      }),
    ).toEqual([
      'error: partials/footer.html: link "Guide/Install.html" reaches "guide/install.md" only by ignoring letter case — ' +
        'the built page keeps "Guide/Install.html" as written, which leads nowhere on a host that tells letter case apart',
      'error: partials/footer.html: link "img/Logo.svg" reaches "img/logo.svg" only by ignoring letter case — ' +
        'the built page keeps "img/Logo.svg" as written, which leads nowhere on a host that tells letter case apart',
    ]);
  });

  it("reports a slot problem once for each region a fragment fills", async () => {
    expect(
      await regionMessages({ regions: { head: "partials/both.html", footer: "partials/both.html" } }, {
        "partials/both.html": '<canopy-slot name="search"></canopy-slot>',
      }),
    ).toEqual([
      expect.stringMatching(/^error: partials\/both\.html \(head\): <canopy-slot name="search"> cannot sit in the head region/),
    ]);
  });

  it("reports a fragment that is not there", async () => {
    expect(await regionMessages({ regions: { footer: "partials/footer.html" } }, {})).toEqual([
      'error: settings: region fragment "partials/footer.html" is not a file in the site (footer)',
    ]);
  });

  it("reports a slot the build would refuse, before the build does", async () => {
    const messages = await regionMessages(
      { regions: { header: "partials/header.html" } },
      { "partials/header.html": '<nav><canopy-slot name="search"/><a href="index.html">Home</a></nav>' },
    );
    expect(messages).toEqual([
      'error: partials/header.html (header): <canopy-slot name="search"> must be empty — write it as ' +
        '<canopy-slot name="search"></canopy-slot>; HTML does not close a self-closing custom tag, so it takes in what follows',
    ]);
  });

  it("checks fragment links from the site root, and leaves the host's own links alone", async () => {
    const messages = await regionMessages(
      { siteUrl: "https://example.test/blog", regions: { header: "partials/header.html" } },
      {
        "partials/header.html":
          '<a href="guide/">Guide</a><a href="/pricing">Pricing</a><a href="/blog/missing.html">Missing</a>' +
          '<a href="https://example.com/">Elsewhere</a>',
      },
    );
    expect(messages).toEqual([
      'error: partials/header.html: link "guide/" points at nothing published (fragment links are written from the site root)',
      'error: partials/header.html: link "/blog/missing.html" points at nothing published — under ' +
        'settings.siteUrl\'s path "/blog/" it addresses "missing.html"',
    ]);
  });

  it("warns when home or logo is set but no page shows it, every header having left its slot out", async () => {
    const messages = await regionMessages(
      {
        home: { url: "https://example.com/", label: "Example" },
        logo: "assets/icon.svg",
        regions: { header: "partials/header.html", footer: "partials/footer.html" },
        sections: [{ path: "news", regions: { header: "partials/news-header.html", footer: "" } }],
      },
      {
        "assets/icon.svg": "<svg></svg>",
        "partials/header.html": '<header><canopy-slot name="search"></canopy-slot></header>',
        // A slot in another region of the same page is an outlet too.
        "partials/footer.html": '<footer><canopy-slot name="home"></canopy-slot></footer>',
        "partials/news-header.html": '<header><canopy-slot name="search"></canopy-slot></header>',
        "news/b.md": "# B\n",
      },
    );
    // home shows on the root page through its footer; the logo shows nowhere.
    expect(messages).toEqual([
      "warning: settings: logo is set, but the logo shows on no page — every page has a header region " +
        '("partials/header.html", "partials/news-header.html") and no fragment of it places <canopy-slot name="site-title">',
    ]);
  });

  it("warns about a theme-toggle slot on a site with one colour scheme, which has no toggle", async () => {
    const messages = await regionMessages(
      { colorScheme: "dark", regions: { header: "partials/header.html" } },
      { "partials/header.html": '<header><canopy-slot name="theme-toggle"></canopy-slot></header>' },
    );
    expect(messages).toEqual([
      'warning: partials/header.html: places <canopy-slot name="theme-toggle">, but settings.colorScheme gives ' +
        "the site one scheme, so there is no toggle — the slot shows nothing",
    ]);
  });

  it("says nothing when some pages show the setting, though a section's own header leaves it out", async () => {
    const messages = await regionMessages(
      {
        logo: "assets/icon.svg",
        sections: [{ path: "blog", regions: { header: "partials/blog-header.html" } }],
      },
      {
        "assets/icon.svg": "<svg></svg>",
        "partials/blog-header.html": "<header>Product</header>",
        "blog/a.md": "# A\n",
      },
    );
    expect(messages).toEqual([]);
  });

  it("reports a page whose frontmatter cannot fill a page slot that reaches it", async () => {
    const messages = await regionMessages(settings, {
      "partials/header.html": "<header></header>",
      "partials/cta.html": '<canopy-slot name="page:cta">Try it</canopy-slot>',
      "blog/a.md": "---\ncta:\n  - one\n  - two\n---\n# A\n",
      "guide/b.md": "---\ncta: 3\n---\n# B\n",
    });
    expect(messages).toEqual([
      'error: blog/a.md: frontmatter "cta" must be text to fill <canopy-slot name="page:cta">, not a list',
    ]);
  });

  it("keeps fragments off the published site", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ regions: { header: "partials/header.html" } }),
      "index.md": "# Home\n",
      "partials/header.html": "<header></header>",
    });
    expect((await loadSite(root)).index.assets).not.toContain("partials/header.html");
  });
});

describe("root-absolute links and siteUrl's path", { timeout: LOADS_A_SITE }, () => {
  async function messagesFor(link: string): Promise<string[]> {
    const root = await site({
      "settings.json": JSON.stringify({ siteUrl: "https://example.test/help" }),
      "index.md": `[x](${link})\n`,
      "guide/install.md": "# Install\n",
    });
    return referenceFindings(await loadSite(root)).map((finding) => `${finding.level}: ${finding.message}`);
  }

  it("checks a link under the site's own path against the site", async () => {
    expect(await messagesFor("/help/guide/install.md")).toEqual([]);
    expect(await messagesFor("/help/guide/gone.md")).toEqual([
      'error: index.md:1: link "/help/guide/gone.md" points at nothing published — under ' +
        'settings.siteUrl\'s path "/help/" it addresses "guide/gone.md"',
    ]);
  });

  it("leaves a link outside the site's path to the host it belongs to", async () => {
    expect(await messagesFor("/pricing")).toEqual([]);
  });

  it("warns when a link outside the path names a page this site publishes at its own root", async () => {
    expect(await messagesFor("/guide/install.md")).toEqual([
      'warning: index.md:1: link "/guide/install.md" leaves this site — it is outside settings.siteUrl\'s ' +
        'path "/help/" — though this site publishes "guide/install.md"; if that page is meant, write ' +
        '"/help/guide/install.md" or a relative link',
    ]);
  });
});

// A section's path is matched ignoring case, like every path in a site; what the
// build writes from it — a feed, a sidebar heading — has to follow the folder
// as it is, or it leads nowhere on a host that tells the two spellings apart.
describe("loadSite: a section named in another spelling than its folder", { timeout: LOADS_A_SITE }, () => {
  it("takes the folder's own spelling", async () => {
    const root = await site({
      "settings.json": JSON.stringify({
        siteUrl: "https://example.test",
        sections: [{ path: "BLOG", profile: "stream" }, { path: "Missing" }],
      }),
      "index.md": "# Home\n",
      "blog/a.md": "---\ndate: 2026-10-01\n---\n# A\n",
    });
    const loaded = await loadSite(root);
    expect(loaded.settings.sections?.map((section) => section.path)).toEqual(["blog", "Missing"]);
    expect(feedDirs(loaded.settings)).toEqual(["blog"]);
    expect(Object.keys(loaded.layout?.dirs ?? {})).toEqual(["blog"]);
  });
});

describe("loadSite", { timeout: LOADS_A_SITE }, () => {
  // `canopy-page build` from inside the site folder writes ./site there; the
  // next build's view of the site must not include the previous output.
  it("leaves the build's output directory out of the site, given where the build writes", async () => {
    const root = await site({ "settings.json": "{}", "index.md": "# Home", "site/index.html": "<p>a previous build</p>" });
    expect((await loadSite(root)).index.assets).toEqual(["site/index.html"]);
    expect((await loadSite(root, path.join(root, "site"))).index.assets).toEqual([]);
  });
});

describe("imageFindings", { timeout: LOADS_A_SITE }, () => {
  async function imageMessages(files: Record<string, string>): Promise<string[]> {
    const root = await site({ "settings.json": "{}", ...files });
    return imageFindings(await loadSite(root)).map((finding) => `${finding.level}: ${finding.message}`);
  }

  // A page's `image:` is its cover on a stream page and its link-preview image
  // everywhere: a site path that is not published is a broken image a reader sees.
  it("says nothing about an image that is published, or one at an absolute URL", async () => {
    expect(
      await imageMessages({
        "index.md": "---\nimage: img/cover.png\n---\n# Home",
        "guide/a.md": "---\nimage: https://cdn.example.com/c.png\n---\n# A",
        "img/cover.png": "binary",
      }),
    ).toEqual([]);
  });

  it("names a page whose image is not a published file", async () => {
    expect(await imageMessages({ "guide/a.md": "---\nimage: img/gone.png\n---\n# A" })).toEqual([
      'error: guide/a.md: image: "img/gone.png" is not a published file (it is a path from the site root)',
    ]);
  });

  it("names an image that reaches its file only by ignoring letter case", async () => {
    expect(
      await imageMessages({ "index.md": "---\nimage: IMG/Cover.png\n---\n# Home", "img/cover.png": "binary" }),
    ).toEqual([
      'error: index.md: image: "IMG/Cover.png" reaches "img/cover.png" only by ignoring letter case — the built page ' +
        'keeps "IMG/Cover.png" as written, which leads nowhere on a host that tells letter case apart',
    ]);
  });
});

describe("a stream section's tags", { timeout: LOADS_A_SITE }, () => {
  const stream = JSON.stringify({ sections: [{ path: "blog", profile: "stream" }] });

  it("names a tag that can have no page, by the post's source", async () => {
    const root = await site({ "settings.json": stream, "blog/a.md": "---\ntags: [ok, Index]\n---\n# A" });
    expect(tagFindings(await loadSite(root)).map((finding) => finding.message)).toEqual([
      'blog/a.md: tag "Index" would be written at blog/tags/index.html, the list of all tags',
    ]);
  });

  it("refuses a page of the site's own at a tag page's path", async () => {
    const root = await site({
      "settings.json": stream,
      "blog/a.md": "---\ntags: [notes]\n---\n# A",
      "blog/tags/notes.md": "# Not a tag page",
    });
    expect(settingsFindings(await loadSite(root)).map((finding) => finding.message)).toContain(
      "blog/tags/notes.md: the build writes the tag page blog/tags/notes.html at this path, so the site cannot " +
        "publish a file there — rename or move it",
    );
  });

  it("knows a link to a tag page is not broken", async () => {
    const root = await site({
      "settings.json": stream,
      "blog/a.md": "---\ntags: [notes]\n---\n# A\n\n[more](tags/notes.html) [all](tags/index.html)",
    });
    expect(referenceFindings(await loadSite(root))).toEqual([]);
  });
});

describe("what to read next", { timeout: LOADS_A_SITE }, () => {
  it("names a readNext: value that names no page, by the page — resolved as canopy resolves it", async () => {
    const root = await site({
      "settings.json": JSON.stringify({ sections: [{ path: "blog", profile: "stream" }] }),
      "guide/start.md": '---\nreadNext: [install.md, "[[Post]]", "../blog/", gone.md, "[[nowhere]]"]\n---\n# Start',
      "guide/install.md": "# Install",
      "blog/post.md": "# Post",
    });
    // `../blog/` is the index canopy writes for the stream section.
    expect(readNextFindings(await loadSite(root)).map((finding) => finding.message)).toEqual([
      'guide/start.md: readNext "gone.md" names no page of this site',
      'guide/start.md: readNext "[[nowhere]]" names no page of this site',
    ]);
  });

  it("names a featured entry that is no post of its section, by the setting", async () => {
    const root = await site({
      "settings.json": JSON.stringify({
        sections: [
          { path: "guide" },
          { path: "Blog", profile: "stream", featured: ["blog/a", "blog/gone", "guide/x"] },
        ],
      }),
      "blog/a.md": "# A",
      "guide/x.md": "# X",
    });
    expect(featuredFindings(await loadSite(root)).map((finding) => finding.message)).toEqual([
      'settings.sections[1].featured: "blog/gone.md" is not a page this site publishes. Paths are relative to the settings file',
      'settings.sections[1].featured: "guide/x.md" is not a post of this stream. Paths are relative to the settings file',
    ]);
  });
});
