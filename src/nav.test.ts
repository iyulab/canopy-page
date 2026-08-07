import { describe, expect, it } from "vitest";
import { translateNav } from "./nav.js";
import { parseSettings } from "./settings.js";
import { indexSite } from "./vault.js";

const SITE = indexSite([
  "index.md",
  "assets/logo.png",
  "guide/index.md",
  "guide/install.md",
  "guide/first-steps.md",
  "guide/settings/api-keys.md",
  "guide/settings/profile.md",
  "release-notes/2026-04.md",
  "release-notes/2026-08.md",
  "about.md",
]);

function translate(settings: unknown, site = SITE) {
  return translateNav(parseSettings(JSON.stringify(settings)), site);
}

/** The page paths a spec places, in the order it places them. */
function flatten(items: readonly { path?: string; items?: unknown[] }[] = []): string[] {
  return items.flatMap((item) => [
    ...(item.path === undefined ? [] : [item.path]),
    ...flatten((item.items ?? []) as { path?: string }[]),
  ]);
}

describe("translateNav", () => {
  it("emits no spec when settings ask for no ordering", () => {
    // Canopy derives navigation itself in this case, which is the same answer
    // with one less thing to keep in step.
    expect(translate({ title: "Docs" }).spec).toBeUndefined();
  });

  it("orders a section newest-first when asked", () => {
    const { spec } = translate({
      sections: [{ path: "release-notes", label: "Release notes", order: "desc" }],
    });
    const notes = spec?.items.find((item) => item.label === "Release notes");
    expect(notes?.items?.map((item) => item.path)).toEqual([
      "release-notes/2026-08.md",
      "release-notes/2026-04.md",
    ]);
  });

  it("labels a section by its directory when nothing else can name it", () => {
    // `release-notes` has no index page, so there is no document to ask.
    const { spec } = translate({ sections: [{ path: "release-notes" }] });
    expect(spec?.items.some((item) => item.label === "release-notes")).toBe(true);
  });

  // Canopy names a page from its frontmatter title, then its opening heading,
  // then its filename — and falls back to the directory for an index page, which
  // is the same answer this would have written. Emitting a label anyway would
  // override the document's own name with a directory name, every time.
  describe("leaves naming to the page that fronts a directory", () => {
    it("omits a section label when the section has an index page", () => {
      const { spec } = translate({ sections: [{ path: "guide" }] });
      const guide = spec?.items.find((item) => item.path === "guide/index.md");
      expect(guide).toBeDefined();
      expect(guide?.label).toBeUndefined();
    });

    it("omits a derived subdirectory label when it has an index page", () => {
      const site = indexSite([
        "guide/index.md",
        "guide/settings/index.md",
        "guide/settings/api-keys.md",
      ]);
      const { spec } = translate({ sections: [{ path: "guide" }] }, site);
      const settings = spec?.items
        .find((item) => item.path === "guide/index.md")
        ?.items?.find((item) => item.path === "guide/settings/index.md");
      expect(settings).toBeDefined();
      expect(settings?.label).toBeUndefined();
    });

    it("keeps a derived subdirectory label when it has no index page", () => {
      const { spec } = translate({ sections: [{ path: "guide" }] });
      const settings = spec?.items
        .find((item) => item.path === "guide/index.md")
        ?.items?.find((item) => item.label === "settings");
      expect(settings).toBeDefined();
      expect(settings?.path).toBeUndefined();
    });

    it("still honors a label the settings file wrote", () => {
      const { spec } = translate({ sections: [{ path: "guide", label: "Guide" }] });
      expect(spec?.items.some((item) => item.label === "Guide")).toBe(true);
    });
  });

  it("links a section's label to its index page", () => {
    const { spec } = translate({ sections: [{ path: "guide", label: "Guide" }] });
    const guide = spec?.items.find((item) => item.label === "Guide");
    expect(guide?.path).toBe("guide/index.md");
    // The index is entered through the section, so it is not also listed inside.
    expect(guide?.items?.some((item) => item.path === "guide/index.md")).toBe(false);
  });

  it("puts the home page first", () => {
    const { spec } = translate({ sections: [{ path: "guide" }] });
    expect(spec?.items[0]?.path).toBe("index.md");
  });

  it("keeps an explicit list in the order it was written", () => {
    const { spec } = translate({
      sections: [
        { path: "guide", label: "Guide", items: ["guide/first-steps", "guide/install.md"] },
      ],
    });
    const guide = spec?.items.find((item) => item.label === "Guide");
    expect(guide?.items?.slice(0, 2).map((item) => item.path)).toEqual([
      "guide/first-steps.md",
      "guide/install.md",
    ]);
  });

  it("resolves a page written without its extension", () => {
    const { spec, missing } = translate({
      sections: [{ path: "guide", items: ["guide/install"] }],
    });
    expect(missing).toEqual([]);
    expect(flatten(spec?.items)).toContain("guide/install.md");
  });

  it("expands a glob over one directory", () => {
    const { spec } = translate({
      sections: [{ path: "guide", label: "Guide", items: [{ label: "Settings", items: ["guide/settings/*"] }] }],
    });
    const settings = spec?.items
      .find((item) => item.label === "Guide")
      ?.items?.find((item) => item.label === "Settings");
    expect(settings?.items?.map((item) => item.path)).toEqual([
      "guide/settings/api-keys.md",
      "guide/settings/profile.md",
    ]);
  });

  it("expands a glob over a whole subtree", () => {
    const { spec, duplicates } = translate({
      sections: [{ path: "guide", label: "Guide", items: ["guide/**"] }],
    });
    // The section's own index is not listed again inside it: the section label
    // already links it, and a glob means the pages not placed yet.
    expect(flatten(spec?.items.filter((item) => item.label === "Guide"))).toEqual([
      "guide/index.md",
      "guide/first-steps.md",
      "guide/install.md",
      "guide/settings/api-keys.md",
      "guide/settings/profile.md",
    ]);
    expect(duplicates).toEqual([]);
  });

  it("reads a list followed by a glob as 'these first, then the rest'", () => {
    const { spec, duplicates } = translate({
      sections: [{ path: "guide", label: "Guide", items: ["guide/install", "guide/*"] }],
    });
    const guide = spec?.items.find((item) => item.label === "Guide");
    expect(guide?.items?.slice(0, 2).map((item) => item.path)).toEqual([
      "guide/install.md",
      "guide/first-steps.md",
    ]);
    // `guide/*` is one directory deep, so the nested pages are leftovers and
    // land in the section as their own group rather than disappearing.
    expect(guide?.items?.at(2)?.label).toBe("settings");
    expect(duplicates).toEqual([]);
  });

  it("reports a reference that matches no page", () => {
    const { missing } = translate({
      sections: [{ path: "guide", items: ["guide/nope"] }],
    });
    expect(missing).toEqual(["guide/nope"]);
  });

  it("reports a glob that matches nothing", () => {
    const { missing } = translate({
      sections: [{ path: "guide", items: ["guide/nowhere/*"] }],
    });
    expect(missing).toEqual(["guide/nowhere/*"]);
  });

  it("reports a section whose directory holds no pages", () => {
    const { missing } = translate({ sections: [{ path: "handbook" }] });
    expect(missing).toEqual(["handbook"]);
  });

  it("reports a page listed twice", () => {
    const { duplicates } = translate({
      sections: [{ path: "guide", items: ["guide/install", "guide/install.md"] }],
    });
    expect(duplicates).toEqual(["guide/install.md"]);
  });

  // A page that exists but cannot be reached is worse than one shown in an
  // order nobody chose, so leftovers are placed and reported, not dropped.
  it("keeps an unlisted page inside its own section", () => {
    const { spec, orphans } = translate({
      sections: [{ path: "guide", label: "Guide", items: ["guide/install"] }],
    });
    const guide = spec?.items.find((item) => item.label === "Guide");
    expect(flatten(guide?.items)).toContain("guide/first-steps.md");
    expect(orphans).toContain("guide/first-steps.md");
    // And it does not appear a second time as a group of its own.
    expect(spec?.items.filter((item) => item.label === "guide")).toEqual([]);
  });

  it("appends a page no section covers, after the sections", () => {
    const { spec, orphans } = translate({ sections: [{ path: "guide" }] });
    expect(orphans).toContain("about.md");
    expect(flatten(spec?.items)).toContain("about.md");
    expect(spec?.items.at(-1)?.path).toBe("about.md");
  });

  it("does not call the home page an orphan", () => {
    const { orphans } = translate({ sections: [{ path: "guide" }] });
    expect(orphans).not.toContain("index.md");
  });

  it("orders sections as the settings list them", () => {
    const { spec } = translate({
      sections: [
        { path: "release-notes", label: "Release notes", order: "desc" },
        { path: "guide", label: "Guide" },
      ],
    });
    expect(spec?.items.map((item) => item.label).filter(Boolean)).toEqual([
      "Release notes",
      "Guide",
    ]);
  });

  it("keeps assets out of the navigation", () => {
    const { spec, orphans } = translate({ sections: [{ path: "guide" }] });
    expect(flatten(spec?.items)).not.toContain("assets/logo.png");
    expect(orphans).not.toContain("assets/logo.png");
  });
});

describe("a section's own index page", () => {
  // The section heading already links its index page, so a glob skips it
  // (`expandGlob` filters what is placed). An explicit mention is the same
  // request written a different way, and used to come back as "placed more
  // than once" — a contradiction, since the settings named it once.
  it("is not placed twice when items name it explicitly", () => {
    const nav = translate({
      sections: [{ path: "guide", items: ["guide/index", "guide/install"] }],
    });
    expect(nav.duplicates).toEqual([]);
    expect(nav.missing).toEqual([]);
  });

  // A label on that entry is dropped with it. The section heading is what links
  // the page, and it carries the section's own label, so honouring both would
  // mean one page under two names — which is the outcome skipping it prevents.
  it("drops a label given to it, since the section heading names it", () => {
    const nav = translate({
      sections: [
        { path: "guide", label: "Guide", items: [{ label: "Overview", path: "guide/index" }] },
      ],
    });
    expect(nav.duplicates).toEqual([]);
    expect(JSON.stringify(nav.spec)).not.toContain("Overview");
  });

  it("still reports a page the settings really do list twice", () => {
    const nav = translate({
      sections: [{ path: "guide", items: ["guide/install", "guide/install"] }],
    });
    expect(nav.duplicates).toEqual(["guide/install.md"]);
  });
});
