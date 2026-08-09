import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

// exec (a full command string through a shell), not execFile with a shell
// option: the latter combination is a documented Node.js deprecation
// (DEP0190) even with fully static args like these.
const execAsync = promisify(exec);
const root = path.join(import.meta.dirname, "..");

/**
 * Guards the actual shipped contents. `dist/*.js` compiles from `src/**\/*.ts`
 * under `tsc`, but `dist/assets/*` is plain files `copy-assets.mjs` copies
 * separately (`tsc` only touches `.ts`) — a feature that adds a static asset
 * ships nothing to consumers until this list is updated too, which is
 * exactly what a missing search UI in production would look like (this
 * project shipped that gap once; see cycle-30/31).
 *
 * Requires `npm run build` to have already run: CI does this before `npm
 * test` (see ci.yml / release.yml), and this checks the real `dist/`
 * rather than re-building, so it fails loudly with a clear message instead
 * of silently skipping when run out of order.
 */
describe("npm pack contents", () => {
  it("ships every static asset canopy-page's build wires into a site", async () => {
    expect(existsSync(path.join(root, "dist")), "dist/ missing — run `npm run build` first").toBe(
      true,
    );

    const { stdout } = await execAsync("npm pack --dry-run --json", { cwd: root });
    const packed = JSON.parse(stdout) as { files: { path: string }[] }[];
    const entry = packed[0];
    expect(entry, "npm pack --dry-run --json returned no entries").toBeDefined();
    const paths = (entry?.files ?? []).map((file) => file.path.replace(/\\/g, "/"));

    for (const asset of [
      "dist/assets/search.js",
      "dist/assets/search.css",
      "dist/assets/scrollspy.js",
      "dist/assets/scrollspy.css",
    ]) {
      expect(paths).toContain(asset);
    }
  });
});
