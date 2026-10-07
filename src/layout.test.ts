import { describe, expect, it } from "vitest";
import { feedDirs, layoutSpec } from "./layout.js";

describe("layoutSpec", () => {
  it("is nothing for a site with no profile and no regions, so canopy gets no --layout", () => {
    expect(layoutSpec({ sections: [{ path: "guide", order: "asc" }] })).toBeUndefined();
  });

  it("turns the site's profile and regions into the default rule, and sections into folder rules", () => {
    expect(
      layoutSpec({
        title: "Example",
        regions: { header: "partials/header.html" },
        sections: [
          { path: "guide" },
          { path: "blog", label: "Journal", profile: "stream", regions: { afterArticle: "partials/cta.html" } },
        ],
      }),
    ).toEqual({
      default: { regions: { header: "partials/header.html" } },
      dirs: { blog: { profile: "stream", title: "Journal", regions: { afterArticle: "partials/cta.html" } } },
    });
  });

  it("titles the index canopy writes for a whole-site stream after the site", () => {
    expect(layoutSpec({ title: "Notes", profile: "stream" })).toEqual({
      default: { profile: "stream", title: "Notes" },
    });
  });
});

describe("layoutSpec — pageSize", () => {
  it("carries a stream's pageSize into its rule", () => {
    expect(layoutSpec({ profile: "stream", pageSize: 4 })).toEqual({ default: { profile: "stream", pageSize: 4 } });
    expect(layoutSpec({ sections: [{ path: "blog", profile: "stream", pageSize: 2 }] })).toEqual({
      dirs: { blog: { profile: "stream", pageSize: 2 } },
    });
  });
});

describe("feedDirs", () => {
  const siteUrl = "https://example.test";

  it("gives a stream section a feed by default once there is a siteUrl", () => {
    expect(feedDirs({ siteUrl, sections: [{ path: "blog", profile: "stream" }, { path: "guide" }] })).toEqual([
      "blog",
    ]);
  });

  it("gives none without a siteUrl, and none to a stream that turns it off", () => {
    expect(feedDirs({ sections: [{ path: "blog", profile: "stream" }] })).toEqual([]);
    expect(feedDirs({ siteUrl, sections: [{ path: "blog", profile: "stream", feed: false }] })).toEqual([]);
  });

  it("keeps a feed a manual section asks for, and gives a whole-site stream one feed", () => {
    expect(feedDirs({ siteUrl, sections: [{ path: "log", feed: true }] })).toEqual(["log"]);
    expect(feedDirs({ siteUrl, profile: "stream" })).toEqual(["."]);
  });
});
