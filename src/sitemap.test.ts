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
