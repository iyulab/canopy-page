import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * `assets/image-lightbox.js` ships to the browser unmodified — this loads
 * and evaluates that exact file (no reimplementation to drift from) in a
 * sandbox with no `document`, the same technique theme-toggle-ui.test.ts and
 * mobile-nav-ui.test.ts use for their own asset files.
 */
function loadCanopyImageLightbox(): {
  shouldIntercept: (event: {
    button: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }) => boolean;
} {
  const source = readFileSync(path.join(import.meta.dirname, "assets/image-lightbox.js"), "utf8");
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.CanopyImageLightbox as ReturnType<typeof loadCanopyImageLightbox>;
}

function clickEvent(overrides: Partial<Parameters<ReturnType<typeof loadCanopyImageLightbox>["shouldIntercept"]>[0]> = {}) {
  return { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...overrides };
}

describe("CanopyImageLightbox.shouldIntercept", () => {
  it("intercepts a plain left click", () => {
    expect(loadCanopyImageLightbox().shouldIntercept(clickEvent())).toBe(true);
  });

  it("leaves a middle click alone, so an ancestor link can still open a new tab", () => {
    expect(loadCanopyImageLightbox().shouldIntercept(clickEvent({ button: 1 }))).toBe(false);
  });

  it("leaves a modifier-held click alone, for the same reason", () => {
    expect(loadCanopyImageLightbox().shouldIntercept(clickEvent({ ctrlKey: true }))).toBe(false);
    expect(loadCanopyImageLightbox().shouldIntercept(clickEvent({ metaKey: true }))).toBe(false);
    expect(loadCanopyImageLightbox().shouldIntercept(clickEvent({ shiftKey: true }))).toBe(false);
    expect(loadCanopyImageLightbox().shouldIntercept(clickEvent({ altKey: true }))).toBe(false);
  });
});
