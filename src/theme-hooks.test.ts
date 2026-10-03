import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { THEME_HOOKS } from "@iyulab/canopy";
import { describe, expect, it } from "vitest";

/**
 * canopy-page's scripts find their place in a page by canopy's class names.
 * Those have to be names canopy promises to keep (THEME_HOOKS); a script that
 * queried an internal class would break on a canopy release that changed
 * nothing it announced.
 */
const ASSETS = path.join(import.meta.dirname, "assets");

/** The canopy class names canopy-page's scripts select on. */
async function queriedClasses(): Promise<Set<string>> {
  const queried = new Set<string>();
  for (const file of (await readdir(ASSETS)).filter((name) => name.endsWith(".js"))) {
    const source = await readFile(path.join(ASSETS, file), "utf8");
    for (const call of source.matchAll(/querySelector(?:All)?\(\s*["'`]([^"'`]+)["'`]/g)) {
      for (const cls of (call[1] as string).matchAll(/\.((?:canopy|callout)[a-z0-9-]*)/g)) {
        queried.add(cls[1] as string);
      }
    }
  }
  return queried;
}

describe("canopy-page's scripts", () => {
  it("query canopy's markup only through its public hooks", async () => {
    const queried = await queriedClasses();
    expect(queried.size).toBeGreaterThan(0);
    expect([...queried].filter((name) => !THEME_HOOKS.includes(name))).toEqual([]);
  });
});
