import { describe, expect, it } from "vitest";
import { parseSettings, SettingsError } from "./settings.js";

/** Assert the message names the position, not just that something was wrong. */
function rejects(json: string, expected: RegExp): void {
  expect(() => parseSettings(json)).toThrow(SettingsError);
  expect(() => parseSettings(json)).toThrow(expected);
}

describe("parseSettings", () => {
  it("accepts an empty object, since every setting is an override", () => {
    expect(parseSettings("{}")).toEqual({});
  });

  it("reads the site-level fields", () => {
    const settings = parseSettings(
      JSON.stringify({
        $schema: "https://example.test/schema.json",
        title: "Product Help",
        description: "How to use it",
        lang: "ko-KR",
        icon: "assets/favicon.png",
        exclude: ["_drafts", "*.tmp"],
      }),
    );
    expect(settings).toEqual({
      title: "Product Help",
      description: "How to use it",
      lang: "ko-KR",
      icon: "assets/favicon.png",
      exclude: ["_drafts", "*.tmp"],
    });
  });

  it("reads a site's one colour scheme, and refuses any other value", () => {
    expect(parseSettings(JSON.stringify({ colorScheme: "dark" }))).toEqual({ colorScheme: "dark" });
    rejects(JSON.stringify({ colorScheme: "auto" }), /settings\.colorScheme: expected "light" or "dark", got "auto"/);
  });

  it("accepts the skip link's text among the strings", () => {
    expect(parseSettings(JSON.stringify({ strings: { skipToContent: "본문 바로가기" } }))).toEqual({
      strings: { skipToContent: "본문 바로가기" },
    });
  });

  it("rejects an unknown key rather than ignoring it", () => {
    rejects(JSON.stringify({ titel: "typo" }), /settings: unknown key "titel"/);
  });

  it("names the position of a bad value", () => {
    rejects(JSON.stringify({ exclude: ["ok", 7] }), /settings\.exclude\[1\]: must be a string/);
  });

  it("reports invalid JSON as such", () => {
    rejects("{ title: 'x' }", /not valid JSON/);
  });

  it("rejects a language tag that is not one", () => {
    rejects(JSON.stringify({ lang: "ko KR" }), /settings\.lang/);
    expect(parseSettings(JSON.stringify({ lang: "en" })).lang).toBe("en");
  });

  it("keeps paths inside the site", () => {
    rejects(JSON.stringify({ icon: "../outside.png" }), /cannot contain "\.\."/);
    rejects(JSON.stringify({ icon: "/absolute.png" }), /must be relative/);
  });

  it("reads one styles path as a one-entry list", () => {
    expect(parseSettings(JSON.stringify({ styles: "brand.css" }))).toEqual({ styles: ["brand.css"] });
  });

  it("reads a list of styles paths in link order, normalized", () => {
    expect(parseSettings(JSON.stringify({ styles: ["brand.css", "theme\\layout.css"] }))).toEqual({
      styles: ["brand.css", "theme/layout.css"],
    });
  });

  it("refuses a styles path that leaves the site, naming its position", () => {
    rejects(JSON.stringify({ styles: ["brand.css", "../shared/x.css"] }), /settings\.styles\[1\]/);
  });

  it("refuses an empty styles list", () => {
    rejects(JSON.stringify({ styles: [] }), /settings\.styles/);
  });

  it("points a tokens setting at its new name rather than calling it unknown", () => {
    rejects(JSON.stringify({ tokens: "brand.css" }), /settings\.tokens: renamed to "styles"/);
  });

  it("normalizes a path written with backslashes or a trailing slash", () => {
    expect(parseSettings(JSON.stringify({ icon: "assets\\favicon.png" })).icon).toBe(
      "assets/favicon.png",
    );
    expect(parseSettings(JSON.stringify({ sections: [{ path: "guide/" }] })).sections?.[0]?.path).toBe(
      "guide",
    );
  });

  // Exclusions are patterns, not paths — canopy accepts `*.tmp` at any depth.
  it("passes exclusion patterns through unchanged", () => {
    expect(parseSettings(JSON.stringify({ exclude: ["_drafts/**", "*.tmp"] })).exclude).toEqual([
      "_drafts/**",
      "*.tmp",
    ]);
  });

  it("reads a logo and a home link", () => {
    expect(
      parseSettings(
        JSON.stringify({
          logo: "assets/logo.svg",
          home: { url: "https://example.test/", label: "제품 홈" },
        }),
      ),
    ).toEqual({
      logo: "assets/logo.svg",
      home: { url: "https://example.test/", label: "제품 홈" },
    });
  });

  it("needs both halves of a home link", () => {
    rejects(JSON.stringify({ home: { url: "https://example.test/" } }), /settings\.home\.label/);
    rejects(JSON.stringify({ home: { label: "제품 홈" } }), /settings\.home\.url/);
  });

  // The target is normally a sibling product at the same origin, which a
  // relative path reaches without hardcoding an origin that differs between
  // dev and production — the site's own internal links already work this way.
  it("accepts a relative home URL", () => {
    expect(parseSettings(JSON.stringify({ home: { url: "../", label: "홈" } }))).toEqual({
      home: { url: "../", label: "홈" },
    });
  });

  it("rejects an empty home URL", () => {
    rejects(JSON.stringify({ home: { url: "", label: "홈" } }), /settings\.home\.url/);
  });

  it("rejects an unknown key inside home", () => {
    rejects(
      JSON.stringify({ home: { url: "https://example.test/", label: "홈", typo: true } }),
      /settings\.home: unknown key "typo"/,
    );
  });

  it("rejects a non-object home", () => {
    rejects(JSON.stringify({ home: "https://example.test/" }), /settings\.home/);
    rejects(JSON.stringify({ home: ["https://example.test/", "홈"] }), /settings\.home/);
  });

  // `lang` only changes what <html lang> declares; the reader chrome's own
  // text (search, theme toggle, nav landmarks) needs a translation supplied
  // separately, the same way `home.label` has no built-in translation either.
  it("reads reader chrome string overrides", () => {
    expect(
      parseSettings(
        JSON.stringify({ strings: { search: "검색", toggleTheme: "테마 전환" } }),
      ),
    ).toEqual({ strings: { search: "검색", toggleTheme: "테마 전환" } });
  });

  it("reads the index-title, backlinks-heading, and search-failed overrides", () => {
    expect(
      parseSettings(
        JSON.stringify({
          strings: { indexTitle: "목차", backlinks: "관련 문서", searchFailed: "검색 실패" },
        }),
      ),
    ).toEqual({
      strings: { indexTitle: "목차", backlinks: "관련 문서", searchFailed: "검색 실패" },
    });
  });

  it("rejects an unknown key inside strings", () => {
    rejects(
      JSON.stringify({ strings: { search: "검색", typo: "x" } }),
      /settings\.strings: unknown key "typo"/,
    );
  });

  it("rejects a non-string value inside strings", () => {
    rejects(JSON.stringify({ strings: { search: 1 } }), /settings\.strings\.search/);
  });

  it("rejects a non-object strings", () => {
    rejects(JSON.stringify({ strings: "검색" }), /settings\.strings/);
  });

  it("reads a site URL", () => {
    expect(parseSettings(JSON.stringify({ siteUrl: "https://example.test/help" }))).toEqual({
      siteUrl: "https://example.test/help",
    });
  });

  it("refuses a site URL that is not absolute", () => {
    rejects(JSON.stringify({ siteUrl: "/help" }), /settings\.siteUrl/);
  });

  it("reads rehype plugin package names", () => {
    expect(
      parseSettings(JSON.stringify({ rehypePlugins: ["rehype-declart", "@scope/rehype-thing"] })),
    ).toEqual({
      rehypePlugins: ["rehype-declart", "@scope/rehype-thing"],
    });
  });

  it("refuses a rehype plugin entry that looks like a file path", () => {
    rejects(
      JSON.stringify({ rehypePlugins: ["./plugins/mine.js"] }),
      /settings\.rehypePlugins\[0\]: "\.\/plugins\/mine\.js" looks like a file path/,
    );
    rejects(JSON.stringify({ rehypePlugins: ["../mine.js"] }), /looks like a file path/);
    rejects(JSON.stringify({ rehypePlugins: ["/abs/mine.js"] }), /looks like a file path/);
    rejects(JSON.stringify({ rehypePlugins: ["C:\\mine.js"] }), /looks like a file path/);
  });
});

describe("parseSettings sections", () => {
  it("reads a section with an order", () => {
    const settings = parseSettings(
      JSON.stringify({ sections: [{ path: "release-notes", label: "Release notes", order: "desc" }] }),
    );
    expect(settings.sections).toEqual([
      { path: "release-notes", label: "Release notes", order: "desc" },
    ]);
  });

  it("requires a path", () => {
    rejects(JSON.stringify({ sections: [{ label: "Guide" }] }), /sections\[0\]: needs a "path"/);
  });

  it("rejects an order that is neither direction", () => {
    rejects(
      JSON.stringify({ sections: [{ path: "guide", order: "descending" }] }),
      /sections\[0\]\.order: must be "asc" or "desc"/,
    );
  });

  // Listing the contents is itself an order; honouring one and dropping the
  // other would surprise whichever author meant the other one.
  it("rejects an explicit list combined with an order", () => {
    rejects(
      JSON.stringify({ sections: [{ path: "guide", order: "asc", items: ["guide/a"] }] }),
      /"items" already gives the order/,
    );
  });

  it("accepts a bare path as shorthand for a page", () => {
    const settings = parseSettings(
      JSON.stringify({ sections: [{ path: "guide", items: ["guide/install.md", "guide/first-steps"] }] }),
    );
    expect(settings.sections?.[0]?.items).toEqual([
      { path: "guide/install.md" },
      { path: "guide/first-steps" },
    ]);
  });

  it("accepts nested groups and keeps their order", () => {
    const settings = parseSettings(
      JSON.stringify({
        sections: [
          {
            path: "guide",
            items: [
              { label: "Orders", items: ["guide/orders/list", "guide/orders/detail"] },
              { label: "Home", path: "guide/index.md" },
            ],
          },
        ],
      }),
    );
    expect(settings.sections?.[0]?.items).toEqual([
      { label: "Orders", items: [{ path: "guide/orders/list" }, { path: "guide/orders/detail" }] },
      { label: "Home", path: "guide/index.md" },
    ]);
  });

  it("requires a group to be labelled", () => {
    rejects(
      JSON.stringify({ sections: [{ path: "guide", items: [{ items: ["guide/a"] }] }] }),
      /sections\[0\]\.items\[0\]: a group needs a "label"/,
    );
  });

  it("requires an entry to be a page or a group", () => {
    rejects(
      JSON.stringify({ sections: [{ path: "guide", items: [{ label: "Alone" }] }] }),
      /needs a "path" \(a page\) or "items" \(a group\)/,
    );
  });

  it("names the position of a nested failure", () => {
    rejects(
      JSON.stringify({
        sections: [{ path: "guide", items: [{ label: "Orders", items: ["ok", 7] }] }],
      }),
      /sections\[0\]\.items\[0\]\.items\[1\]: expected a page path or an object/,
    );
  });

  it("rejects an unknown key inside a section", () => {
    rejects(
      JSON.stringify({ sections: [{ path: "guide", sort: "desc" }] }),
      /sections\[0\]: unknown key "sort"/,
    );
  });

  // The exclusion dialect is small on purpose: a directory, that directory and
  // everything under it, an extension at any depth, or one exact path. A shape
  // outside it matches nothing, and a pattern that silently excludes nothing is
  // the same failure as a key that is silently dropped.
  it("rejects a wildcard the exclusion dialect does not have", () => {
    rejects(
      JSON.stringify({ exclude: ["images/*.md"] }),
      /settings\.exclude\[0\]/,
    );
  });

  it("keeps the wildcard shapes the dialect does have", () => {
    expect(
      parseSettings(JSON.stringify({ exclude: ["*.tmp", "drafts/**", "notes/scratch.md"] })).exclude,
    ).toEqual(["*.tmp", "drafts/**", "notes/scratch.md"]);
  });
});

describe("parseSettings: where the site is published", () => {
  it("reads a preview image and the site's other language editions", () => {
    expect(
      parseSettings(
        JSON.stringify({
          siteUrl: "https://example.test/help/",
          previewImage: "assets/cover.png",
          alternates: { ko: "https://example.test/ko/help/", "x-default": "https://example.test/help/" },
        }),
      ),
    ).toEqual({
      siteUrl: "https://example.test/help/",
      previewImage: "assets/cover.png",
      alternates: { ko: "https://example.test/ko/help/", "x-default": "https://example.test/help/" },
    });
  });

  it("refuses a preview image without a site URL, naming what is missing", () => {
    rejects(JSON.stringify({ previewImage: "assets/cover.png" }), /settings\.previewImage: needs siteUrl/);
  });

  it("keeps the preview image inside the site, like icon and logo", () => {
    rejects(
      JSON.stringify({ siteUrl: "https://example.test", previewImage: "../cover.png" }),
      /settings\.previewImage/,
    );
  });

  it("accepts known-broken pages, each with its reason", () => {
    expect(
      parseSettings(
        JSON.stringify({
          knownBroken: [
            { path: "help/kpi/**", reason: "Screenshots being retaken" },
            { path: "guide\\old.md", reason: " Rewritten next quarter " },
          ],
        }),
      ).knownBroken,
    ).toEqual([
      { path: "help/kpi/**", reason: "Screenshots being retaken" },
      { path: "guide/old.md", reason: "Rewritten next quarter" },
    ]);
  });

  it("refuses a known-broken entry without a reason, or with a pattern it cannot match", () => {
    rejects(JSON.stringify({ knownBroken: [{ path: "a" }] }), /settings\.knownBroken\[0\]: needs a "reason"/);
    rejects(
      JSON.stringify({ knownBroken: [{ path: "a", reason: "  " }] }),
      /settings\.knownBroken\[0\]\.reason: must not be empty/,
    );
    rejects(
      JSON.stringify({ knownBroken: [{ path: "help/*.md", reason: "x" }] }),
      /settings\.knownBroken\[0\]\.path: "help\/\*\.md" is not a pattern/,
    );
    rejects(JSON.stringify({ knownBroken: [{ path: "../x", reason: "x" }] }), /must stay inside the site/);
    rejects(JSON.stringify({ knownBroken: [{ path: "a", reason: "x", until: "2027" }] }), /unknown key "until"/);
    rejects(JSON.stringify({ knownBroken: "help/**" }), /settings\.knownBroken: must be an array/);
  });

  it("accepts a section feed alongside a site URL", () => {
    expect(
      parseSettings(
        JSON.stringify({
          siteUrl: "https://example.test",
          sections: [{ path: "release-notes", order: "desc", feed: true }, { path: "guide", feed: false }],
        }),
      ).sections,
    ).toEqual([{ path: "release-notes", order: "desc", feed: true }, { path: "guide", feed: false }]);
  });

  it("refuses a section feed without a site URL, and a feed that is not a boolean", () => {
    rejects(
      JSON.stringify({ sections: [{ path: "log", feed: true }] }),
      /settings\.sections\[0\]\.feed: needs siteUrl/,
    );
    rejects(
      JSON.stringify({ siteUrl: "https://example.test", sections: [{ path: "log", feed: "yes" }] }),
      /settings\.sections\[0\]\.feed: must be true or false/,
    );
  });

  it("refuses alternates without a site URL — this edition has to be in the list too", () => {
    rejects(JSON.stringify({ alternates: { ko: "https://example.test/ko" } }), /settings\.alternates: needs siteUrl/);
  });

  it("names the alternate whose URL is not absolute", () => {
    rejects(
      JSON.stringify({ siteUrl: "https://example.test", alternates: { ko: "/ko" } }),
      /settings\.alternates\.ko: "\/ko" must be an absolute/,
    );
  });

  it("rejects an alternate key that is neither a language tag nor x-default", () => {
    rejects(
      JSON.stringify({ siteUrl: "https://example.test", alternates: { "ko KR": "https://example.test/ko" } }),
      /settings\.alternates: "ko KR" is not a language tag/,
    );
  });

  it("rejects a non-object alternates", () => {
    rejects(JSON.stringify({ siteUrl: "https://example.test", alternates: ["ko"] }), /settings\.alternates/);
  });
});

describe("parseSettings: profiles and regions", () => {
  it("reads a site profile and regions, and a section's own", () => {
    expect(
      parseSettings(
        JSON.stringify({
          profile: "manual",
          regions: { head: "partials/head.html", header: "partials\\header.html" },
          sections: [
            { path: "blog", profile: "stream", regions: { afterArticle: "partials/cta.html", header: "" } },
          ],
        }),
      ),
    ).toEqual({
      profile: "manual",
      regions: { head: "partials/head.html", header: "partials/header.html" },
      sections: [{ path: "blog", profile: "stream", regions: { afterArticle: "partials/cta.html", header: "" } }],
    });
  });

  it("keeps a section's feed: false, which turns off a stream's default feed", () => {
    expect(
      parseSettings(JSON.stringify({ sections: [{ path: "blog", profile: "stream", feed: false }] })).sections,
    ).toEqual([{ path: "blog", profile: "stream", feed: false }]);
  });

  it("lets a manual section in a stream site keep its order", () => {
    expect(
      parseSettings(
        JSON.stringify({ profile: "stream", sections: [{ path: "docs", profile: "manual", order: "desc" }] }),
      ).sections,
    ).toEqual([{ path: "docs", profile: "manual", order: "desc" }]);
  });

  it("reads the reading-time and language strings", () => {
    expect(
      parseSettings(JSON.stringify({ strings: { readingTime: "{n}분", language: "언어" } })).strings,
    ).toEqual({ readingTime: "{n}분", language: "언어" });
  });

  it.each([
    [{ profile: "blog" }, /settings\.profile: must be one of manual, stream/],
    [{ regions: { sidebar: "x.html" } }, /settings\.regions: unknown region "sidebar"/],
    [{ regions: { footer: "" } }, /settings\.regions\.footer: must not be empty/],
    [{ regions: { footer: "../x.html" } }, /settings\.regions\.footer: must stay inside the site/],
    [{ regions: [] }, /settings\.regions: expected an object of region → fragment path/],
    [
      { regions: { header: "parts/*.html" } },
      /settings\.regions\.header: names one file, so it cannot contain any of \* \? \[ \]/,
    ],
    [
      { sections: [{ path: "blog", regions: { footer: "parts/[a].html" } }] },
      /settings\.sections\[0\]\.regions\.footer: names one file/,
    ],
    [
      { sections: [{ path: "blog", profile: "stream", order: "desc" }] },
      /settings\.sections\[0\]\.order: a stream section is ordered newest first by its pages' date:/,
    ],
    [
      { sections: [{ path: "blog", profile: "stream", items: ["blog/a"] }] },
      /settings\.sections\[0\]\.items: a stream section lists its pages newest first by date:/,
    ],
    [
      { profile: "stream", sections: [{ path: "blog", order: "desc" }] },
      /a stream section \(from settings\.profile\) is ordered/,
    ],
    [{ sections: [{ path: "blog", regions: { aside: "x.html" } }] }, /settings\.sections\[0\]\.regions: unknown region "aside"/],
    [{ strings: { readingTime: "min read" } }, /settings\.strings\.readingTime: needs "\{n\}"/],
    [
      { sections: [{ path: "blog" }, { path: "guide" }, { path: "Blog/" }] },
      /settings\.sections\[2\]\.path: "Blog" is already settings\.sections\[0\] — a folder is one section/,
    ],
  ])("rejects %j", (settings, message) => {
    rejects(JSON.stringify(settings), message);
  });
});

describe("parseSettings: a stream's list in pages", () => {
  it("takes pageSize on a site or section whose own profile is stream", () => {
    expect(parseSettings('{"profile":"stream","pageSize":5}').pageSize).toBe(5);
    expect(
      parseSettings('{"sections":[{"path":"blog","profile":"stream","pageSize":3}]}').sections?.[0]?.pageSize,
    ).toBe(3);
  });

  it("refuses a pageSize that is not a whole number of at least 1", () => {
    for (const size of ["0", "1.5", '"10"']) {
      expect(() => parseSettings(`{"profile":"stream","pageSize":${size}}`)).toThrow(
        "settings.pageSize: must be a whole number of at least 1",
      );
    }
  });

  it("refuses a pageSize where there is no list of its own to page", () => {
    expect(() => parseSettings('{"pageSize":5}')).toThrow(
      'settings.pageSize: only a site with "profile": "stream" has a list to page',
    );
    // A section that only inherits the site's stream is part of the site's one list.
    expect(() => parseSettings('{"profile":"stream","sections":[{"path":"blog","pageSize":5}]}')).toThrow(
      'settings.sections[0].pageSize: only a section with its own "profile": "stream" has a list to page',
    );
  });

  it("takes featured posts on a site or section whose own profile is stream, each made a .md path", () => {
    expect(parseSettings('{"profile":"stream","featured":["welcome"]}').featured).toEqual(["welcome.md"]);
    expect(
      parseSettings('{"sections":[{"path":"blog","profile":"stream","featured":["blog/a.md","./blog/b"]}]}').sections?.[0]
        ?.featured,
    ).toEqual(["blog/a.md", "blog/b.md"]);
  });

  it("refuses featured posts where there is no list of its own, or entries that are not pages", () => {
    expect(() => parseSettings('{"featured":["a"]}')).toThrow(
      'settings.featured: only a site with "profile": "stream" has posts to feature',
    );
    expect(() => parseSettings('{"profile":"stream","sections":[{"path":"blog","featured":["blog/a"]}]}')).toThrow(
      'settings.sections[0].featured: only a section with its own "profile": "stream" has posts to feature',
    );
    expect(() => parseSettings('{"profile":"stream","featured":"a.md"}')).toThrow(
      "settings.featured: expected a list of the posts' paths",
    );
    expect(() => parseSettings('{"profile":"stream","featured":["cover.png"]}')).toThrow(
      'settings.featured[0]: "cover.png" is not a page',
    );
    expect(() => parseSettings('{"profile":"stream","featured":["../a.md"]}')).toThrow("settings.featured[0]");
  });

  it("needs {n} in strings.pageOf", () => {
    expect(() => parseSettings('{"strings":{"pageOf":"Page"}}')).toThrow("settings.strings.pageOf");
    expect(parseSettings('{"strings":{"pageOf":"{n}/{total}"}}').strings?.pageOf).toBe("{n}/{total}");
  });
});
