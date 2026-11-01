import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ASSET_STRING_KEYS, ASSET_STRINGS, assembleScript, assembleStylesheet } from "./assets-bundle.js";
import { STRINGS_KEYS } from "./settings.js";

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
    const script = await assembleScript({ searchFailed: "검색을 불러오지 못했습니다." });
    expect(script).toContain('"검색을 불러오지 못했습니다."');
    expect(script).not.toContain("Search failed to load.");
  });

  // String.replace treats "$&"/"$$"/etc. in a *replacement string* as patterns
  // — a naive `search.replace(target, JSON.stringify(searchFailed))` would
  // corrupt any message containing a literal "$". A function replacer sidesteps it.
  it("carries a literal $ in the override through unmangled", async () => {
    const script = await assembleScript({ searchFailed: "$& costs $$5" });
    expect(script).toContain('"$& costs $$5"');
  });
});

describe("the sentences canopy-page's own scripts show a reader", () => {
  const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

  it("keeps the lightbox's default close label when no override is given", async () => {
    const script = await assembleScript();
    expect(script).toContain('setAttribute("aria-label", "Close")');
  });

  it("substitutes a caller-supplied lightbox close label", async () => {
    const script = await assembleScript({ lightboxClose: "닫기" });
    expect(script).toContain('setAttribute("aria-label", "닫기")');
    expect(script).not.toContain('"Close"');
  });

  it("applies every override in the same script", async () => {
    const script = await assembleScript({ searchFailed: "검색 실패", lightboxClose: "닫기" });
    expect(script).toContain('"검색 실패"');
    expect(script).toContain('"닫기"');
    expect(script).not.toContain("Search failed to load.");
    expect(script).not.toContain('"Close"');
  });

  // A default that is absent from its file, or present twice, would make the
  // override a silent no-op or a half-applied one.
  it("finds each default exactly once in the asset that carries it", async () => {
    for (const key of ASSET_STRING_KEYS) {
      const { file, default: text } = ASSET_STRINGS[key];
      const source = await readFile(path.join(ASSETS_DIR, file), "utf8");
      const literal = JSON.stringify(text);
      expect(source.split(literal).length - 1, `${key}: ${literal} in ${file}`).toBe(1);
    }
  });

  // The structural guard: a new script that shows a hard-coded sentence — an
  // accessible name, a title, placeholder or visible text — must register it in
  // ASSET_STRINGS (and so in `settings.strings`), or this fails.
  it("has no reader-facing sentence in an asset that settings.strings cannot override", async () => {
    const registered = new Set<string>(Object.values(ASSET_STRINGS).map((entry) => entry.default));
    const found: string[] = [];
    for (const file of (await readdir(ASSETS_DIR)).filter((name) => name.endsWith(".js"))) {
      const source = await readFile(path.join(ASSETS_DIR, file), "utf8");
      for (const sentence of readerFacingSentences(source)) {
        if (!registered.has(sentence)) found.push(`${file}: ${JSON.stringify(sentence)}`);
      }
    }
    expect(found).toEqual([]);
  });

  // The guard is only worth having if it sees the ways a script can put a sentence in front of a reader.
  it("sees a sentence set as an attribute, a property, a text node or text", () => {
    const shown = [
      'el.setAttribute("aria-label", "Open menu");',
      "el.setAttribute('title', 'Open menu');",
      'el.setAttribute("aria-roledescription", "carousel slide");',
      'el.title = "Open menu";',
      'el.ariaLabel = "Open menu";',
      'input.placeholder = "Type to search";',
      'img.alt = "A picture";',
      'el.textContent = "Open menu";',
      "el.innerText = `Open menu`;",
      'el.innerHTML = "<b>Open menu</b>";',
      'el.append(document.createTextNode("Open menu"));',
      'el.insertAdjacentText("beforeend", "Open menu");',
    ];
    for (const line of shown) {
      expect(readerFacingSentences(line).length, line).toBeGreaterThan(0);
    }
  });

  it("leaves alone what says nothing in a language", () => {
    const quiet = [
      'list.textContent = "";',
      'shortcut.textContent = "Ctrl K";',
      'el.setAttribute("aria-hidden", "true");',
      'el.setAttribute("aria-current", "location");',
      'el.className = "canopy-lightbox-close";',
      'throw new Error("search index request failed");',
      "el.textContent = result.snippet;",
    ];
    for (const line of quiet) {
      expect(readerFacingSentences(line), line).toEqual([]);
    }
  });

  it("is overridable through every key settings.strings accepts for it", () => {
    for (const key of ASSET_STRING_KEYS) expect(STRINGS_KEYS.has(key), key).toBe(true);
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

/**
 * Every sentence a script's source hands to the page as text a reader can meet: an accessible name,
 * title, placeholder or alt (by `setAttribute` or by property), or text and markup (`textContent`,
 * `innerText`, `innerHTML`, a text node, `insertAdjacentText`). Only string literals — what a script
 * computes (`result.snippet`) is the page's own text. Empty strings and key hints say nothing in a
 * language and are skipped.
 */
function readerFacingSentences(source: string): string[] {
  const literal = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + "`[^`]*`)";
  const named = "(?:aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|title|placeholder|alt)";
  const patterns = [
    new RegExp(String.raw`setAttribute\(\s*["']${named}["']\s*,\s*${literal}\s*\)`, "g"),
    new RegExp(String.raw`\.(?:title|placeholder|alt|ariaLabel|ariaDescription|ariaPlaceholder|ariaRoleDescription|textContent|innerText|innerHTML)\s*=\s*${literal}`, "g"),
    new RegExp(String.raw`createTextNode\(\s*${literal}\s*\)`, "g"),
    new RegExp(String.raw`insertAdjacentText\(\s*[^,]+,\s*${literal}\s*\)`, "g"),
  ];
  const sentences: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const raw = match[1] as string;
      const sentence = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw.slice(1, -1);
      if (/\p{L}{2,}/u.test(sentence.replace(/^(?:Ctrl|⌘) ?K$/, ""))) sentences.push(sentence);
    }
  }
  return sentences;
}
