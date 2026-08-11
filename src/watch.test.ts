import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serveStatic, watchSite, WatchError } from "./watch.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixtureOut(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canopy-page-watch-"));
  temporary.push(root);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(root, rel), content, "utf8");
  }
  return root;
}

describe("serveStatic", () => {
  it("serves a file at the site root", async () => {
    const out = await fixtureOut({ "index.html": "<h1>Home</h1>" });
    const server = await serveStatic(out, 0);
    try {
      const response = await fetch(`http://localhost:${server.port}/index.html`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("<h1>Home</h1>");
      expect(response.headers.get("content-type")).toContain("text/html");
    } finally {
      await server.close();
    }
  });

  it("serves a directory's index.html for a clean URL", async () => {
    const out = await fixtureOut({ "guide/index.html": "<h1>Guide</h1>" });
    const server = await serveStatic(out, 0);
    try {
      const response = await fetch(`http://localhost:${server.port}/guide/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("<h1>Guide</h1>");
    } finally {
      await server.close();
    }
  });

  it("404s on a missing file", async () => {
    const out = await fixtureOut({ "index.html": "<h1>Home</h1>" });
    const server = await serveStatic(out, 0);
    try {
      const response = await fetch(`http://localhost:${server.port}/missing.html`);
      expect(response.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  // A path that walks above the served root would let a request read anything
  // on disk the process can — the same class of bug as an unchecked file
  // download endpoint (OWASP path traversal). The segment is percent-encoded
  // because a plain "../" is normalized away before a real HTTP client ever
  // sends it — the server has to defend against the decoded form itself.
  it("refuses a path that walks outside the served directory", async () => {
    const out = await fixtureOut({ "index.html": "<h1>Home</h1>" });
    const server = await serveStatic(out, 0);
    try {
      const response = await fetch(
        `http://localhost:${server.port}/${encodeURIComponent("../../../../etc/passwd")}`,
      );
      expect(response.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  // watch's whole point is to fail loudly rather than silently move to
  // another port nobody asked for — this is the message main() in cli.ts
  // prints on its own, without a stack trace (see WatchError below).
  it("rejects clearly when the port is already in use", async () => {
    const out = await fixtureOut({ "index.html": "<h1>Home</h1>" });
    const first = await serveStatic(out, 0);
    try {
      await expect(serveStatic(out, first.port)).rejects.toBeInstanceOf(WatchError);
      await expect(serveStatic(out, first.port)).rejects.toThrow(/already in use/);
    } finally {
      await first.close();
    }
  });

  it("handles malformed percent-encoding without hanging", async () => {
    const out = await fixtureOut({ "index.html": "<h1>Home</h1>" });
    const server = await serveStatic(out, 0);
    try {
      // %zz is not valid percent-encoding, decodeURIComponent throws URIError
      const response = await fetch(`http://localhost:${server.port}/%zz`);
      expect(response.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("refuses a path with a dot-prefixed intermediate directory", async () => {
    // Create a fixture with a file inside a .git directory
    const out = await fixtureOut({
      "index.html": "<h1>Home</h1>",
      ".git/config": "secret",
    });
    const server = await serveStatic(out, 0);
    try {
      const response = await fetch(`http://localhost:${server.port}/.git/config`);
      expect(response.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

/**
 * A real canopy build, like build.test.ts — the same reasoning applies: only
 * evidence about published files is worth trusting, and a build is seconds
 * rather than milliseconds. Kept to a ceiling wide enough for a busy machine,
 * not for a healthy one.
 */
const SPAWNS_A_PROCESS = 300_000;

async function watchFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "canopy-page-watchsite-"));
  temporary.push(root);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(root, rel), content, "utf8");
  }
  return root;
}

describe("watchSite", () => {
  it(
    "builds once, then rebuilds when a source file changes",
    async () => {
      const dir = await watchFixture({ "settings.json": "{}", "index.md": "# One" });
      const out = path.join(dir, "site");
      const rebuilds: number[] = [];
      let notifyRebuild: (() => void) | undefined;
      const handle = await watchSite({
        dir,
        out,
        port: 0,
        onRebuild: (code) => {
          rebuilds.push(code);
          notifyRebuild?.();
        },
      });
      expect(handle).toBeDefined();
      try {
        const before = await readFile(path.join(out, "index.html"), "utf8");
        expect(before).toContain("One");

        const rebuilt = new Promise<void>((res) => {
          notifyRebuild = res;
        });
        await writeFile(path.join(dir, "index.md"), "# Two", "utf8");
        await rebuilt;

        expect(rebuilds).toEqual([0]);
        const after = await readFile(path.join(out, "index.html"), "utf8");
        expect(after).toContain("Two");
      } finally {
        await handle?.close();
      }
    },
    SPAWNS_A_PROCESS * 2,
  );

  it(
    "returns undefined and starts nothing when the initial build fails",
    async () => {
      const dir = await watchFixture({
        "settings.json": "{}",
        "index.md": "[[nowhere]]",
      });
      const out = path.join(dir, "site");
      const handle = await watchSite({ dir, out, port: 0 });
      expect(handle).toBeUndefined();
    },
    SPAWNS_A_PROCESS,
  );

  it(
    "keeps serving the last successful build when a rebuild fails",
    async () => {
      const dir = await watchFixture({ "settings.json": "{}", "index.md": "# One" });
      const out = path.join(dir, "site");
      let notifyRebuild: ((code: number) => void) | undefined;
      const handle = await watchSite({
        dir,
        out,
        port: 0,
        onRebuild: (code) => notifyRebuild?.(code),
      });
      expect(handle).toBeDefined();
      try {
        const rebuilt = new Promise<number>((res) => {
          notifyRebuild = res;
        });
        // A wikilink to nothing is a check error, so the rebuild fails without
        // touching `out` — see check.test.ts for the same rule exercised directly.
        await writeFile(path.join(dir, "index.md"), "[[nowhere]]", "utf8");
        const code = await rebuilt;
        expect(code).not.toBe(0);

        const stillServed = await readFile(path.join(out, "index.html"), "utf8");
        expect(stillServed).toContain("One");
      } finally {
        await handle?.close();
      }
    },
    SPAWNS_A_PROCESS * 2,
  );
});
