import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * `assets/theme-toggle.js` ships to the browser unmodified — this loads and
 * evaluates that exact file (no reimplementation to drift from) in a
 * sandbox with no `document`, the same technique search-ui.test.ts and
 * scrollspy-ui.test.ts use for their own asset files.
 */
function loadCanopyThemeToggle(): {
  effectiveTheme: (dataThemeAttr: string | null, systemPrefersDark: boolean) => "dark" | "light";
  nextTheme: (current: "dark" | "light") => "dark" | "light";
} {
  const source = readFileSync(path.join(import.meta.dirname, "assets/theme-toggle.js"), "utf8");
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.CanopyThemeToggle as ReturnType<typeof loadCanopyThemeToggle>;
}

describe("CanopyThemeToggle.effectiveTheme", () => {
  it("prefers an explicit data-theme attribute over system preference", () => {
    expect(loadCanopyThemeToggle().effectiveTheme("light", true)).toBe("light");
    expect(loadCanopyThemeToggle().effectiveTheme("dark", false)).toBe("dark");
  });

  it("falls back to system preference when no attribute is set", () => {
    expect(loadCanopyThemeToggle().effectiveTheme(null, true)).toBe("dark");
    expect(loadCanopyThemeToggle().effectiveTheme(null, false)).toBe("light");
  });

  it("ignores a garbage attribute value the same way as no attribute", () => {
    expect(loadCanopyThemeToggle().effectiveTheme("not-a-theme", true)).toBe("dark");
  });
});

describe("CanopyThemeToggle.nextTheme", () => {
  it("flips dark to light and back", () => {
    const { nextTheme } = loadCanopyThemeToggle();
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });
});
