import { describe, expect, it } from "vitest";
import { assembleScript, assembleTokensCss } from "./assets-bundle.js";

describe("assembleScript", () => {
  it("concatenates every UI script canopy-page ships, in one file", async () => {
    const script = await assembleScript();
    expect(script).toContain("CanopySearch");
    expect(script).toContain("CanopyScrollspy");
    expect(script).toContain("CanopyThemeToggle");
    expect(script).toContain("CanopyMobileNav");
  });

  it("keeps the default search-failed message when no override is given", async () => {
    const script = await assembleScript();
    expect(script).toContain('"Search failed to load."');
  });

  it("substitutes a caller-supplied search-failed message", async () => {
    const script = await assembleScript("검색을 불러오지 못했습니다.");
    expect(script).toContain('"검색을 불러오지 못했습니다."');
    expect(script).not.toContain("Search failed to load.");
  });

  // String.replace treats "$&"/"$$"/etc. in a *replacement string* as patterns
  // — a naive `search.replace(target, JSON.stringify(searchFailed))` would
  // corrupt any message containing a literal "$". A function replacer sidesteps it.
  it("carries a literal $ in the override through unmangled", async () => {
    const script = await assembleScript("$& costs $$5");
    expect(script).toContain('"$& costs $$5"');
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
