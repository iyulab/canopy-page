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
