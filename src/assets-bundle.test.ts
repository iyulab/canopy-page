import { describe, expect, it } from "vitest";
import { assembleScript, assembleStylesheet } from "./assets-bundle.js";

describe("assembleScript", () => {
  it("concatenates every UI script canopy-page ships, in one file", async () => {
    const script = await assembleScript();
    expect(script).toContain("CanopySearch");
    expect(script).toContain("CanopyScrollspy");
    expect(script).toContain("CanopyThemeToggle");
    expect(script).toContain("CanopyMobileNav");
    expect(script).toContain("CanopyImageLightbox");
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

describe("assembleStylesheet", () => {
  it("carries every piece of canopy-page's own CSS", async () => {
    const css = await assembleStylesheet();
    expect(css).toContain(".canopy-search");
    expect(css).toContain(".canopy-outline");
    expect(css).toContain(".canopy-lightbox-overlay");
  });

  // Above canopy's layer (it is linked later, so its layer is declared later),
  // below a site's own unlayered styles — which is what lets a site restyle
  // search or the lightbox the same way it restyles anything else.
  it("sits in its own cascade layer", async () => {
    const css = await assembleStylesheet();
    expect(css.startsWith("@layer canopy-page {\n")).toBe(true);
    expect(css.trimEnd().endsWith("}")).toBe(true);
    expect(css).not.toMatch(/@import|@charset/);
  });

  // Now that canopy-page's layer outranks canopy's, this reservation actually
  // applies — so it must not reach the narrow layout, where canopy collapses
  // the input to an icon-sized box with no badge to make room for.
  it("reserves room for the shortcut badge only where the badge is shown", async () => {
    const css = await assembleStylesheet();
    const reservation = css.indexOf("padding-right: 3rem");
    const wideOnly = css.lastIndexOf("@media not all and (max-width: 40rem)", reservation);
    expect(reservation).toBeGreaterThan(-1);
    expect(wideOnly).toBeGreaterThan(-1);
    expect(css.slice(wideOnly, reservation)).not.toContain("}\n}");
  });
});
