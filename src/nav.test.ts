import { applyNavSpec, type NavNode } from "@iyulab/canopy";
import { describe, expect, it } from "vitest";
import { translateNav } from "./nav.js";
import { parseSettings } from "./settings.js";
import { indexSite as indexListing } from "./vault.js";

/** A site from a flat file list, split the way canopy's listing splits it. */
function indexSite(files: string[]) {
  return indexListing({
    pages: files.filter((file) => file.endsWith(".md")),
    assets: files.filter((file) => !file.endsWith(".md")),
  });
}

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

/**
 * The navigation a reader would see: the spec applied by canopy itself, as
 * `[label, source page, children]`. What a section does not list is derived by
 * canopy, so that part is only observable here, not in the spec.
 */
function rendered(settings: unknown, site = SITE): unknown {
  const { spec } = translate(settings, site);
  if (spec === undefined) throw new Error("expected a spec");
  const entries = site.pages.map((page) => ({ sitePath: page.replace(/\.md$/i, ".html") }));
  const shape = (nodes: NavNode[]): unknown =>
    nodes.map((node) => [
      node.label,
      node.sitePath?.replace(/\.html$/, ".md"),
      shape(node.children),
    ]);
  return shape(applyNavSpec(spec, entries).nodes);
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

  // canopy orders a stream by its pages' dates; a file-name order asked for it
  // would only be overridden, so none is asked — whether the section says it is
  // a stream or the site does.
  it("asks no order for a stream section, its own or the site's", () => {
    const own = translate({ sections: [{ path: "release-notes", profile: "stream" }] }).spec;
    expect(own?.items.find((item) => item.derive === "release-notes")).not.toHaveProperty("order");
    const inherited = translate({ profile: "stream", sections: [{ path: "release-notes" }] }).spec;
    expect(inherited?.items.find((item) => item.derive === "release-notes")).not.toHaveProperty("order");
    const manual = translate({ sections: [{ path: "release-notes" }] }).spec;
    expect(manual?.items.find((item) => item.derive === "release-notes")).toMatchObject({ order: "asc" });
  });

  it("orders a section newest-first when asked", () => {
    const { spec } = translate({
      sections: [{ path: "release-notes", label: "Release notes", order: "desc" }],
    });
    const notes = spec?.items.find((item) => item.label === "Release notes");
    // The section asks canopy to derive its directory by file name, descending.
    expect(notes).toMatchObject({ derive: "release-notes", order: "desc", items: [] });
    expect(
      rendered({ sections: [{ path: "release-notes", label: "Release notes", order: "desc" }] }),
    ).toContainEqual([
      "Release notes",
      undefined,
      [
        ["2026-08", "release-notes/2026-08.md", []],
        ["2026-04", "release-notes/2026-04.md", []],
      ],
    ]);
  });

  it("labels a section by its directory when nothing else can name it", () => {
    // `release-notes` has no index page, so there is no document to ask.
    const { spec } = translate({ sections: [{ path: "release-notes" }] });
    expect(spec?.items.some((item) => item.label === "release-notes")).toBe(true);
  });

  it("reports a section that fell back to a raw directory-name label", () => {
    const { rawSlugLabels } = translate({ sections: [{ path: "release-notes" }] });
    expect(rawSlugLabels).toEqual(["release-notes"]);
  });

  it("does not report a section that has its own label or an index page", () => {
    expect(translate({ sections: [{ path: "release-notes", label: "Release notes" }] }).rawSlugLabels).toEqual([]);
    expect(translate({ sections: [{ path: "guide" }] }).rawSlugLabels).toEqual([]);
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

    it("fronts a derived subdirectory with its index page", () => {
      const site = indexSite([
        "guide/index.md",
        "guide/settings/index.md",
        "guide/settings/api-keys.md",
      ]);
      expect(rendered({ sections: [{ path: "guide" }] }, site)).toEqual([
        [
          "guide",
          "guide/index.md",
          [["settings", "guide/settings/index.md", [["api-keys", "guide/settings/api-keys.md", []]]]],
        ],
      ]);
    });

    it("groups a derived subdirectory with no index page under its directory name", () => {
      const guide = (rendered({ sections: [{ path: "guide" }] }) as unknown[][]).find(
        (node) => node[1] === "guide/index.md",
      );
      expect(guide?.[2]).toContainEqual([
        "settings",
        undefined,
        [
          ["api-keys", "guide/settings/api-keys.md", []],
          ["profile", "guide/settings/profile.md", []],
        ],
      ]);
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
    const settings = { sections: [{ path: "guide", label: "Guide", items: ["guide/install", "guide/*"] }] };
    const { spec, duplicates } = translate(settings);
    const guide = spec?.items.find((item) => item.label === "Guide");
    expect(guide?.items?.map((item) => item.path)).toEqual([
      "guide/install.md",
      "guide/first-steps.md",
    ]);
    expect(duplicates).toEqual([]);
    // `guide/*` is one directory deep, so the nested pages are leftovers and
    // land in the section as their own group rather than disappearing.
    const shown = (rendered(settings) as unknown[][]).find((node) => node[0] === "Guide");
    expect(((shown?.[2] ?? []) as unknown[][]).map((node) => node[0])).toEqual([
      "install",
      "first-steps",
      "settings",
    ]);
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
    const settings = { sections: [{ path: "guide", label: "Guide", items: ["guide/install"] }] };
    const { orphans } = translate(settings);
    expect(orphans).toContain("guide/first-steps.md");
    const shown = rendered(settings) as unknown[][];
    const guide = shown.find((node) => node[0] === "Guide");
    expect(JSON.stringify(guide)).toContain("guide/first-steps.md");
    // And it does not appear a second time as a group of its own.
    expect(shown.filter((node) => node[0] === "guide")).toEqual([]);
  });

  it("appends a page no section covers, after the sections", () => {
    const settings = { sections: [{ path: "guide" }] };
    const { spec, orphans } = translate(settings);
    expect(orphans).toContain("about.md");
    expect(spec?.unplaced).toBe("append");
    const shown = rendered(settings) as unknown[][];
    expect(shown.at(-1)?.[1]).toBe("about.md");
  });

  it("does not call a page in a section that lists nothing an orphan", () => {
    const { orphans } = translate({ sections: [{ path: "guide" }] });
    expect(orphans.some((page) => page.startsWith("guide/"))).toBe(false);
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
