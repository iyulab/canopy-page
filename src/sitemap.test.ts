import { describe, expect, it } from "vitest";
import { robotsTxt, sitemapXml } from "./sitemap.js";

describe("sitemapXml", () => {
  it("lists every page as an absolute URL", () => {
    const xml = sitemapXml("https://example.test/help", ["index.html", "guide/install.html"]);
    expect(xml).toContain("<loc>https://example.test/help/guide/install.html</loc>");
  });

  it("names a directory by the directory, not by its index page", () => {
    // A reader's canonical URL for a folder is the folder. Listing both forms
    // would ask a crawler to treat one page as two.
    const xml = sitemapXml("https://example.test", ["index.html", "guide/index.html"]);
    expect(xml).toContain("<loc>https://example.test/</loc>");
    expect(xml).toContain("<loc>https://example.test/guide/</loc>");
    expect(xml).not.toContain("index.html");
  });

  it("escapes characters XML cannot carry raw", () => {
    const xml = sitemapXml("https://example.test", ["a&b.html"]);
    expect(xml).toContain("a&amp;b.html");
  });

  it("percent-encodes a space, which a URL cannot carry", () => {
    const xml = sitemapXml("https://example.test", ["error messages.html"]);
    expect(xml).toContain("error%20messages.html");
  });
});

describe("robotsTxt", () => {
  it("points at the sitemap", () => {
    expect(robotsTxt("https://example.test/help")).toContain(
      "Sitemap: https://example.test/help/sitemap.xml",
    );
  });
});

describe("sitemapXml: language editions", () => {
  it("lists each page's counterpart in every edition, this one included, when alternates are given", () => {
    const xml = sitemapXml("https://example.test/help", ["guide/index.html"], {
      lang: "en",
      alternates: { ko: "https://example.test/ko/help/", "x-default": "https://example.test/help" },
    });
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://example.test/help/guide/"/>');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="ko" href="https://example.test/ko/help/guide/"/>');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://example.test/help/guide/"/>');
  });

  it("does not list this edition twice when the map already places its language", () => {
    const xml = sitemapXml("https://example.test/ko", ["index.html"], {
      lang: "ko",
      alternates: { ko: "https://example.test/ko", en: "https://example.test/en" },
    });
    expect(xml.match(/hreflang="ko"/g)).toHaveLength(1);
  });

  it("declares no xhtml namespace and no alternates without an edition map", () => {
    const xml = sitemapXml("https://example.test", ["index.html"]);
    expect(xml).not.toContain("xhtml");
  });
});

describe("sitemapXml: a regional site language beside a plain-language edition", () => {
  it("lists both ko-KR (this site) and ko (the map's), the same way the pages' own hreflang links do", () => {
    const xml = sitemapXml("https://example.test/kr", ["index.html"], {
      lang: "ko-KR",
      alternates: { ko: "https://example.test/ko" },
    });
    expect(xml).toContain('hreflang="ko-KR" href="https://example.test/kr/"');
    expect(xml).toContain('hreflang="ko" href="https://example.test/ko/"');
  });
});
