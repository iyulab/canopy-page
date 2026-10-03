import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isShallowClone, resolveLastmods } from "./lastmod.js";

const execFileAsync = promisify(execFile);

const temporary: string[] = [];

// Each case runs several git processes (init, commits, a clone). Measured past
// vitest's 5s default on a machine scanning every process it starts — the same
// reason, and the same hang-only ceiling, as build.test.ts's SPAWNS_A_PROCESS.
const RUNS_GIT = 120_000;

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A fresh git repo, seeded with `files`, each committed with its own date. */
async function repoWith(commits: { files: Record<string, string>; date: string }[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canopy-page-lastmod-"));
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
    await git(["commit", "--quiet", "-m", "commit"], {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    });
  }
  return root;
}

describe("resolveLastmods", { timeout: RUNS_GIT }, () => {
  it("dates a page by its source markdown's last commit", async () => {
    const root = await repoWith([
      { files: { "index.md": "# Home\n" }, date: "2026-01-05T00:00:00Z" },
    ]);
    const { byPath, shallowClone } = await resolveLastmods(root, ["index.html"]);
    expect(shallowClone).toBe(false);
    expect(byPath["index.html"]).toBe("2026-01-05");
  });

  it("re-dates a page to its most recent commit, not its first", async () => {
    const root = await repoWith([
      { files: { "index.md": "# Home\n" }, date: "2026-01-05T00:00:00Z" },
      { files: { "index.md": "# Home, updated\n" }, date: "2026-03-09T00:00:00Z" },
    ]);
    const { byPath } = await resolveLastmods(root, ["index.html"]);
    expect(byPath["index.html"]).toBe("2026-03-09");
  });

  it("prefers a page's own frontmatter updated: date over git history", async () => {
    const root = await repoWith([
      {
        files: { "index.md": "---\nupdated: 2020-06-01\n---\n# Home\n" },
        date: "2026-01-05T00:00:00Z",
      },
    ]);
    const { byPath } = await resolveLastmods(root, ["index.html"]);
    expect(byPath["index.html"]).toBe("2020-06-01");
  });

  it("falls back to git when updated: is not a date canopy recognizes", async () => {
    const root = await repoWith([
      {
        files: { "index.md": "---\nupdated: 2020-02-30\n---\n# Home\n" },
        date: "2026-01-05T00:00:00Z",
      },
    ]);
    const { byPath } = await resolveLastmods(root, ["index.html"]);
    expect(byPath["index.html"]).toBe("2026-01-05");
  });

  it("names the day of an updated: date-time", async () => {
    const root = await repoWith([
      {
        files: { "index.md": "---\nupdated: 2020-06-01T09:30:00+09:00\n---\n# Home\n" },
        date: "2026-01-05T00:00:00Z",
      },
    ]);
    const { byPath } = await resolveLastmods(root, ["index.html"]);
    expect(byPath["index.html"]).toBe("2020-06-01");
  });

  it("omits a page with no corresponding source file", async () => {
    const root = await repoWith([{ files: { "index.md": "# Home\n" }, date: "2026-01-05T00:00:00Z" }]);
    // canopy's synthetic root index.html, when a site names none of its own.
    const { byPath } = await resolveLastmods(root, ["index.html", "synthetic-root.html"]);
    expect(Object.keys(byPath)).toEqual(["index.html"]);
  });

  it("omits every page, without erroring, outside a git repository", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "canopy-page-lastmod-nogit-"));
    temporary.push(root);
    await writeFile(path.join(root, "index.md"), "# Home\n", "utf8");
    const { byPath, shallowClone } = await resolveLastmods(root, ["index.html"]);
    expect(byPath).toEqual({});
    expect(shallowClone).toBe(false);
  });
});

describe("isShallowClone", { timeout: RUNS_GIT }, () => {
  it("is false for an ordinary repository", async () => {
    const root = await repoWith([{ files: { "a.md": "# A\n" }, date: "2026-01-01T00:00:00Z" }]);
    expect(await isShallowClone(root)).toBe(false);
  });

  it("is true for a --depth 1 clone, and resolveLastmods withholds every date", async () => {
    const origin = await repoWith([
      { files: { "index.md": "# v1\n" }, date: "2026-01-01T00:00:00Z" },
      { files: { "index.md": "# v2\n" }, date: "2026-02-01T00:00:00Z" },
    ]);
    const shallow = await mkdtemp(path.join(tmpdir(), "canopy-page-lastmod-shallow-"));
    temporary.push(shallow);
    // A plain local path clone silently ignores --depth; the file:// transport
    // is what actually produces a shallow clone.
    await execFileAsync("git", [
      "clone",
      "--quiet",
      "--depth",
      "1",
      pathToFileURL(origin).href,
      shallow,
    ]);

    expect(await isShallowClone(shallow)).toBe(true);
    const { byPath, shallowClone } = await resolveLastmods(shallow, ["index.html"]);
    expect(shallowClone).toBe(true);
    expect(byPath).toEqual({});
  });
});
