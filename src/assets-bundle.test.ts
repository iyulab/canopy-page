import { describe, expect, it } from "vitest";
import { assembleScript, assembleTokensCss } from "./assets-bundle.js";

describe("assembleScript", () => {
  it("concatenates every UI script canopy-page ships, in one file", async () => {
    const script = await assembleScript();
    expect(script).toContain("CanopySearch");
    expect(script).toContain("CanopyScrollspy");
    expect(script).toContain("CanopyThemeToggle");
  });
});

describe("assembleTokensCss", () => {
  it("carries canopy-page's own CSS even with no user tokens file", async () => {
    const css = await assembleTokensCss(undefined);
    expect(css).toContain(".canopy-search");
    expect(css).toContain(".canopy-outline");
  });

  it("appends its own CSS after a user's tokens, rather than replacing it", async () => {
    const css = await assembleTokensCss(":root { --accent: #ff0000; }");
    expect(css.indexOf("--accent: #ff0000")).toBeLessThan(css.indexOf(".canopy-search"));
  });
});
