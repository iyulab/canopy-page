import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serveStatic, WatchError } from "./watch.js";

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
});
