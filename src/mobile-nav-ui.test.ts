import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * `assets/mobile-nav.js` ships to the browser unmodified — this loads and
 * evaluates that exact file (no reimplementation to drift from) in a
 * sandbox with no `document`, the same technique search-ui.test.ts,
 * scrollspy-ui.test.ts, and theme-toggle-ui.test.ts use for their own asset
 * files.
 */
function loadCanopyMobileNav(): {
  shouldOpenOnLoad: (isNarrowViewport: boolean, storedChoice: string | undefined) => boolean;
} {
  const source = readFileSync(path.join(import.meta.dirname, "assets/mobile-nav.js"), "utf8");
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.CanopyMobileNav as ReturnType<typeof loadCanopyMobileNav>;
}

describe("CanopyMobileNav.shouldOpenOnLoad", () => {
  it("always opens on a wide viewport, regardless of any stored choice", () => {
    const { shouldOpenOnLoad } = loadCanopyMobileNav();
    expect(shouldOpenOnLoad(false, undefined)).toBe(true);
    expect(shouldOpenOnLoad(false, "closed")).toBe(true);
    expect(shouldOpenOnLoad(false, "open")).toBe(true);
  });

  it("starts closed on a narrow viewport with no prior choice", () => {
    expect(loadCanopyMobileNav().shouldOpenOnLoad(true, undefined)).toBe(false);
  });

  it("respects a reader's own choice to leave it open on a narrow viewport", () => {
    expect(loadCanopyMobileNav().shouldOpenOnLoad(true, "open")).toBe(true);
  });

  it("stays closed on a narrow viewport once a reader has closed it", () => {
    expect(loadCanopyMobileNav().shouldOpenOnLoad(true, "closed")).toBe(false);
  });

  it("treats a garbage stored value the same as no stored value", () => {
    expect(loadCanopyMobileNav().shouldOpenOnLoad(true, "not-a-choice")).toBe(false);
  });
});
