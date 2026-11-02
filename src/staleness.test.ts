import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { siteFindings } from "./check.js";
import { loadSite } from "./site.js";
import { readSourceFreshness, sourceFreshnessFindings } from "./staleness.js";

const execFileAsync = promisify(execFile);

const temporary: string[] = [];

// Each case runs several git processes; the same hang-only ceiling as lastmod.test.ts.
const RUNS_GIT = 120_000;

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A fresh git repo, seeded with `files`, each batch committed at its own date. */
async function repoWith(commits: { files: Record<string, string>; date: string }[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canopy-page-staleness-"));
  temporary.push(root);
  const git = (args: string[], env?: NodeJS.ProcessEnv) =>
    execFileAsync("git", args, { cwd: root, env: { ...process.env, ...env } });
  await git(["init", "--quiet"]);
  await git(["config", "user.email", "test@example.test"]);
  await git(["config", "user.name", "Test"]);
  for (const { files, date } of commits) {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
      await writeFile(path.join(root, rel), content, "utf8");
    }
    await git(["add", "."]);
    await git(["commit", "--quiet", "-m", "commit"], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  }
  return root;
}

/** The pages as `loadSite` hands them over: path → markdown. */
function pages(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

const doc = (globs: string) => `---\nsourceGlobs: ${globs}\n---\n# Doc\n`;

async function findingsFor(root: string, site: ReadonlyMap<string, string>, observe?: (args: readonly string[]) => void) {
  return sourceFreshnessFindings(await readSourceFreshness(root, site, observe));
}

describe("sourceGlobs: a page older than the sources it documents", { timeout: RUNS_GIT }, () => {
  it("warns when a source changed after the page did", async () => {
    const root = await repoWith([
      { files: { "guide.md": doc("src/*.ts"), "src/a.ts": "1" }, date: "2026-01-05T00:00:00Z" },
      { files: { "src/a.ts": "2" }, date: "2026-03-09T00:00:00Z" },
    ]);
    const findings = await findingsFor(root, pages({ "guide.md": doc("src/*.ts") }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "a-page-is-older-than-the-sources-it-documents",
      level: "warning",
      page: "guide.md",
    });
    expect(findings[0]?.message).toContain("guide.md");
    expect(findings[0]?.message).toContain("src/*.ts");
    expect(findings[0]?.message).toContain("2026-01-05");
    expect(findings[0]?.message).toContain("2026-03-09");
  });

  it("warns when a source change merged in from a branch is one the page was never shown", async () => {
    // The branch's change is dated before the page edit on main, so a comparison of dates passes it.
    const root = await repoWith([
      { files: { "guide.md": doc("src/*.ts"), "src/a.ts": "1" }, date: "2026-01-05T00:00:00Z" },
    ]);
    const git = (args: string[], date: string) =>
      execFileAsync("git", args, { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    const main = (await execFileAsync("git", ["branch", "--show-current"], { cwd: root })).stdout.trim();
    await git(["checkout", "--quiet", "-b", "feature"], "2026-02-01T00:00:00Z");
    await writeFile(path.join(root, "src/a.ts"), "2", "utf8");
    await git(["commit", "--quiet", "-am", "source"], "2026-02-01T00:00:00Z");
    await git(["checkout", "--quiet", main], "2026-02-01T00:00:00Z");
    await writeFile(path.join(root, "guide.md"), `${doc("src/*.ts")}More.\n`, "utf8");
    await git(["commit", "--quiet", "-am", "page"], "2026-03-01T00:00:00Z");
    await git(["merge", "--quiet", "--no-ff", "-m", "merge", "feature"], "2026-04-01T00:00:00Z");
    const findings = await findingsFor(root, pages({ "guide.md": doc("src/*.ts") }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("a-page-is-older-than-the-sources-it-documents");
    expect(findings[0]?.message).toContain("2026-03-01");
    expect(findings[0]?.message).toContain("src/*.ts (2026-02-01)");
  });

  it("warns when a source changed in a later commit of the same second", async () => {
    const root = await repoWith([
      { files: { "guide.md": doc("src/*.ts"), "src/a.ts": "1" }, date: "2026-01-05T00:00:00Z" },
      { files: { "src/a.ts": "2" }, date: "2026-01-05T00:00:00Z" },
    ]);
    const findings = await findingsFor(root, pages({ "guide.md": doc("src/*.ts") }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("a-page-is-older-than-the-sources-it-documents");
  });

  it("is quiet when the page was edited after a branch with the source change was merged", async () => {
    const root = await repoWith([
      { files: { "guide.md": doc("src/*.ts"), "src/a.ts": "1" }, date: "2026-01-05T00:00:00Z" },
    ]);
    const git = (args: string[], date: string) =>
      execFileAsync("git", args, { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    const main = (await execFileAsync("git", ["branch", "--show-current"], { cwd: root })).stdout.trim();
    await git(["checkout", "--quiet", "-b", "feature"], "2026-02-01T00:00:00Z");
    await writeFile(path.join(root, "src/a.ts"), "2", "utf8");
    await git(["commit", "--quiet", "-am", "source"], "2026-02-01T00:00:00Z");
    await git(["checkout", "--quiet", main], "2026-02-01T00:00:00Z");
    await git(["merge", "--quiet", "--no-ff", "-m", "merge", "feature"], "2026-03-01T00:00:00Z");
    await writeFile(path.join(root, "guide.md"), `${doc("src/*.ts")}More.\n`, "utf8");
    await git(["commit", "--quiet", "-am", "page"], "2026-04-01T00:00:00Z");
    expect(await findingsFor(root, pages({ "guide.md": doc("src/*.ts") }))).toEqual([]);
  });

  it("is quiet when the page was committed after its sources", async () => {
    const root = await repoWith([
      { files: { "src/a.ts": "1" }, date: "2026-01-05T00:00:00Z" },
      { files: { "guide.md": doc("src/*.ts") }, date: "2026-02-01T00:00:00Z" },
    ]);
    expect(await findingsFor(root, pages({ "guide.md": doc("src/*.ts") }))).toEqual([]);
  });

  it("is quiet when page and sources were committed together", async () => {
    const root = await repoWith([
      { files: { "guide.md": doc("src/*.ts"), "src/a.ts": "1" }, date: "2026-01-05T00:00:00Z" },
    ]);
    expect(await findingsFor(root, pages({ "guide.md": doc("src/*.ts") }))).toEqual([]);
  });

  it("looks only at the files the patterns name", async () => {
    const root = await repoWith([
      { files: { "guide.md": doc("src/a.ts"), "src/a.ts": "1", "src/b.ts": "1" }, date: "2026-01-05T00:00:00Z" },
      { files: { "src/b.ts": "2" }, date: "2026-03-09T00:00:00Z" },
    ]);
    expect(await findingsFor(root, pages({ "guide.md": doc("src/a.ts") }))).toEqual([]);
  });

  it("takes a list of patterns, and names each one that changed", async () => {
    const list = "\n  - src/a.ts\n  - lib/**/*.ts\n  - src/c.ts";
    const root = await repoWith([
      {
        files: { "guide.md": doc(list), "src/a.ts": "1", "lib/deep/b.ts": "1", "src/c.ts": "1" },
        date: "2026-01-05T00:00:00Z",
      },
      { files: { "lib/deep/b.ts": "2" }, date: "2026-03-09T00:00:00Z" },
    ]);
    const findings = await findingsFor(root, pages({ "guide.md": doc(list) }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("lib/**/*.ts");
    expect(findings[0]?.message).not.toContain("src/a.ts");
  });

  it("reads patterns from the site folder, and may reach out of it", async () => {
    const root = await repoWith([
      { files: { "site/guide.md": doc("../src/**/*.ts"), "src/x/a.ts": "1" }, date: "2026-01-05T00:00:00Z" },
      { files: { "src/x/a.ts": "2" }, date: "2026-03-09T00:00:00Z" },
    ]);
    const findings = await findingsFor(path.join(root, "site"), pages({ "guide.md": doc("../src/**/*.ts") }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("a-page-is-older-than-the-sources-it-documents");
  });

  it("counts another page a pattern names as a source like any other file", async () => {
    // A pattern that starts with "*" has to be quoted in YAML, where a bare * opens an alias.
    const quoted = doc('"*.md"');
    const root = await repoWith([
      { files: { "guide.md": quoted }, date: "2026-01-05T00:00:00Z" },
      { files: { "other.md": "# O\n" }, date: "2026-02-01T00:00:00Z" },
    ]);
    const findings = await findingsFor(root, pages({ "guide.md": quoted }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("a-page-is-older-than-the-sources-it-documents");
  });

  it("leaves a page whose frontmatter does not parse to the renderer, which reports it", async () => {
    const root = await repoWith([{ files: { "a.md": "# A\n" }, date: "2026-01-05T00:00:00Z" }]);
    const broken = "---\nsourceGlobs: *.md\n---\n# Doc\n";
    expect(await readSourceFreshness(root, pages({ "a.md": broken }))).toBeUndefined();
  });
});

describe("sourceGlobs: what cannot be judged", { timeout: RUNS_GIT }, () => {
  it("says so when a pattern matches no file git knows", async () => {
    const root = await repoWith([{ files: { "guide.md": doc("src/nothing/*.ts") }, date: "2026-01-05T00:00:00Z" }]);
    const findings = await findingsFor(root, pages({ "guide.md": doc("src/nothing/*.ts") }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "a-sourceglobs-entry-cannot-be-judged", level: "warning", page: "guide.md" });
    expect(findings[0]?.message).toContain("src/nothing/*.ts");
  });

  it("refuses a value that is not a pattern or a list of them", async () => {
    const root = await repoWith([{ files: { "guide.md": "# G\n" }, date: "2026-01-05T00:00:00Z" }]);
    for (const value of ["42", "true", "[1, 2]", '""', "{ a: b }"]) {
      const findings = await findingsFor(root, pages({ "guide.md": doc(value) }));
      expect(findings, value).toHaveLength(1);
      expect(findings[0]?.kind, value).toBe("a-sourceglobs-entry-cannot-be-judged");
    }
  });

  it("refuses an absolute pattern or git's own pathspec magic", async () => {
    const root = await repoWith([{ files: { "guide.md": "# G\n", "a.ts": "1" }, date: "2026-01-05T00:00:00Z" }]);
    for (const value of ["/etc/passwd", "':(top)a.ts'", "'C:/a.ts'"]) {
      const findings = await findingsFor(root, pages({ "guide.md": doc(value) }));
      expect(findings, value).toHaveLength(1);
      expect(findings[0]?.kind, value).toBe("a-sourceglobs-entry-cannot-be-judged");
    }
  });

  it("says once, not once per page, that a folder is not a git repository", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "canopy-page-staleness-nogit-"));
    temporary.push(root);
    const findings = await findingsFor(root, pages({ "a.md": doc("x.ts"), "b.md": doc("y.ts") }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("a-sourceglobs-entry-cannot-be-judged");
    expect(findings[0]?.message).toMatch(/git repository/);
  });

  it("withholds judgement in a shallow clone, whose history stops at an arbitrary commit", async () => {
    const origin = await repoWith([
      { files: { "guide.md": doc("src/a.ts"), "src/a.ts": "1" }, date: "2026-01-05T00:00:00Z" },
      { files: { "src/a.ts": "2" }, date: "2026-03-09T00:00:00Z" },
    ]);
    const shallow = await mkdtemp(path.join(tmpdir(), "canopy-page-staleness-shallow-"));
    temporary.push(shallow);
    await execFileAsync("git", ["clone", "--quiet", "--depth", "1", pathToFileURL(origin).href, shallow]);
    const findings = await findingsFor(shallow, pages({ "guide.md": doc("src/a.ts") }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("a-sourceglobs-entry-cannot-be-judged");
    expect(findings[0]?.message).toMatch(/shallow/);
  });

  it("is quiet about a page git has no commit for yet", async () => {
    const root = await repoWith([{ files: { "src/a.ts": "1" }, date: "2026-01-05T00:00:00Z" }]);
    await writeFile(path.join(root, "new.md"), doc("src/a.ts"), "utf8");
    expect(await findingsFor(root, pages({ "new.md": doc("src/a.ts") }))).toEqual([]);
  });
});

describe("sourceGlobs: the cost of looking", { timeout: RUNS_GIT }, () => {
  it("starts no git process for a site no page of which uses the key", async () => {
    const root = await repoWith([{ files: { "a.md": "# A\n" }, date: "2026-01-05T00:00:00Z" }]);
    const calls: (readonly string[])[] = [];
    const freshness = await readSourceFreshness(root, pages({ "a.md": "# A\n" }), (args) => calls.push(args));
    expect(freshness).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("starts a bounded number of git processes however many pages name their sources", async () => {
    const files: Record<string, string> = { "src/a.ts": "1" };
    const site: Record<string, string> = {};
    for (let i = 0; i < 40; i++) {
      files[`p${i}.md`] = doc("src/*.ts");
      site[`p${i}.md`] = doc("src/*.ts");
    }
    const root = await repoWith([{ files, date: "2026-01-05T00:00:00Z" }]);
    const calls: (readonly string[])[] = [];
    const freshness = await readSourceFreshness(root, pages(site), (args) => calls.push(args));
    expect(freshness?.pages.size).toBe(40);
    // The work-tree probe, the shallow probe, one pattern, one pass over the history for every page.
    expect(calls.length).toBeLessThanOrEqual(5);
  });

  it("asks about a pattern once, and once more per commit its pages were last committed in", async () => {
    const files: Record<string, string> = { "src/a.ts": "1" };
    const site: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      files[`p${i}.md`] = doc("src/*.ts");
      site[`p${i}.md`] = doc("src/*.ts");
    }
    const root = await repoWith([{ files, date: "2026-01-05T00:00:00Z" }]);
    const calls: (readonly string[])[] = [];
    await readSourceFreshness(root, pages(site), (args) => calls.push(args));
    const patternCalls = calls.filter((args) => args.some((arg) => arg.startsWith(":(glob)")));
    // Whether git has committed anything it matches, and what the one commit all twelve share has not seen.
    expect(patternCalls).toHaveLength(2);
  });
});

describe("sourceGlobs through check", { timeout: RUNS_GIT }, () => {
  it("is part of what check reports for a site in a git repository", async () => {
    const root = await repoWith([
      {
        files: {
          "docs/settings.json": '{ "title": "T" }',
          "docs/index.md": "# Home\n",
          "docs/install.md": doc("../src/*.ts"),
          "src/a.ts": "1",
        },
        date: "2026-01-05T00:00:00Z",
      },
      { files: { "src/a.ts": "2" }, date: "2026-03-09T00:00:00Z" },
    ]);
    const findings = siteFindings(await loadSite(path.join(root, "docs")));
    const stale = findings.filter((finding) => finding.kind === "a-page-is-older-than-the-sources-it-documents");
    expect(stale).toHaveLength(1);
    expect(stale[0]?.level).toBe("warning");
    expect(stale[0]?.page).toBe("install.md");
  });

  it("changes nothing for a site that names no sourceGlobs", async () => {
    const root = await repoWith([
      { files: { "settings.json": '{ "title": "T" }', "index.md": "# Home\n" }, date: "2026-01-05T00:00:00Z" },
    ]);
    const site = await loadSite(root);
    expect(site.sourceFreshness).toBeUndefined();
    expect(siteFindings(site).filter((finding) => finding.kind.includes("sourceglobs"))).toEqual([]);
  });
});
