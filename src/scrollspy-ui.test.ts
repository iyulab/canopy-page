import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * `assets/scrollspy.js` ships to the browser unmodified — this loads and
 * evaluates that exact file (no reimplementation to drift from) in a
 * sandbox with no `document`, the same technique search-ui.test.ts uses for
 * `assets/search.js`.
 */
function loadCanopyScrollspy(): {
  pickActive: (orderedIds: string[], visibleIds: string[]) => string | null;
} {
  const source = readFileSync(path.join(import.meta.dirname, "assets/scrollspy.js"), "utf8");
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.CanopyScrollspy as ReturnType<typeof loadCanopyScrollspy>;
}

describe("CanopyScrollspy.pickActive", () => {
  const order = ["intro", "install", "usage", "faq"];

  it("returns null when nothing is visible", () => {
    expect(loadCanopyScrollspy().pickActive(order, [])).toBeNull();
  });

  it("picks the only visible heading", () => {
    expect(loadCanopyScrollspy().pickActive(order, ["usage"])).toBe("usage");
  });

  it("prefers the topmost of several simultaneously visible headings", () => {
    // "usage" and "faq" both intersect (e.g. a short faq section right below
    // a tall usage section) — the reader's eye is on "usage", the one closer
    // to the top of the viewport, not "faq".
    expect(loadCanopyScrollspy().pickActive(order, ["faq", "usage"])).toBe("usage");
  });

  it("ignores a visible id that is not in the outline's order", () => {
    expect(loadCanopyScrollspy().pickActive(order, ["not-an-outline-heading"])).toBeNull();
  });
});
