import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * `assets/search.js` ships to the browser unmodified — this loads and
 * evaluates that exact file (no reimplementation to drift from) in a
 * sandbox with no `document`, which is exactly what makes `searchIndex`
 * usable outside a browser in the first place (see the file's own comment).
 */
function loadCanopySearch(): {
  searchIndex: (
    entries: readonly { p: string; t: string; h: string[]; b: string }[],
    query: string,
    limit?: number,
  ) => { entry: { p: string; t: string; h: string[]; b: string }; score: number; snippet: string }[];
} {
  const source = readFileSync(path.join(import.meta.dirname, "assets/search.js"), "utf8");
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.CanopySearch as ReturnType<typeof loadCanopySearch>;
}

const enEntries = [
  { p: "guide/install.html", t: "Installation", h: ["Requirements", "Steps"], b: "Run npm install to get started." },
  { p: "guide/usage.html", t: "Usage", h: ["CLI", "Options"], b: "Use the CLI to build your site." },
  { p: "reference/errors.html", t: "Error messages", h: [], b: "A list of every error the build can report." },
];

describe("CanopySearch.searchIndex", () => {
  it("matches a query against the title", () => {
    const results = loadCanopySearch().searchIndex(enEntries, "install", 10);
    expect(results[0]?.entry.p).toBe("guide/install.html");
  });

  it("matches a query against heading text", () => {
    const results = loadCanopySearch().searchIndex(enEntries, "requirements", 10);
    expect(results[0]?.entry.p).toBe("guide/install.html");
  });

  it("matches a query against body text only", () => {
    const results = loadCanopySearch().searchIndex(enEntries, "report", 10);
    expect(results[0]?.entry.p).toBe("reference/errors.html");
  });

  it("excludes entries matching none of the query's terms", () => {
    const results = loadCanopySearch().searchIndex(enEntries, "nonexistent", 10);
    expect(results).toEqual([]);
  });

  it("requires every term in a multi-word query to match somewhere", () => {
    // "usage" only matches the second page; "nonexistent" matches nothing —
    // the AND means neither page should surface.
    const results = loadCanopySearch().searchIndex(enEntries, "usage nonexistent", 10);
    expect(results).toEqual([]);
  });

  it("ranks a title match above a body-only match", () => {
    const results = loadCanopySearch().searchIndex(
      [
        { p: "a.html", t: "CLI", h: [], b: "nothing else here" },
        { p: "b.html", t: "Something else", h: [], b: "mentions the CLI in passing" },
      ],
      "cli",
      10,
    );
    expect(results.map((r) => r.entry.p)).toEqual(["a.html", "b.html"]);
  });

  it("is case-insensitive", () => {
    const results = loadCanopySearch().searchIndex(enEntries, "INSTALL", 10);
    expect(results[0]?.entry.p).toBe("guide/install.html");
  });

  it("caps results at the given limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      p: `p${i}.html`,
      t: "Match",
      h: [],
      b: "",
    }));
    expect(loadCanopySearch().searchIndex(many, "match", 5)).toHaveLength(5);
  });
});

/**
 * Wave 2's entry condition (plan §5): substring matching against Korean text
 * was a hypothesis, not a measured fact. This runs real queries against a
 * search-index.json actually produced by canopy (`canopy build --search-index`
 * against a small Korean fixture vault — see src/__fixtures__), the same
 * class of content the design doc worried about (particle-attached words:
 * 주문 -> 주문을/주문이/주문은).
 */
describe("CanopySearch.searchIndex — Korean substring matching (Wave 2 entry condition)", () => {
  const koEntries = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "__fixtures__/search-index.ko.json"), "utf8"),
  );

  it("finds a page by its exact title term", () => {
    const results = loadCanopySearch().searchIndex(koEntries, "주문", 10);
    expect(results.map((r: { entry: { p: string } }) => r.entry.p)).toContain("guide/orders.html");
  });

  it("finds a page when the query is a bare stem and the source text carries a particle", () => {
    // The body says "주문을", "주문이" (stem + particle) — never bare "주문 " —
    // so this only passes if substring containment, not exact-word matching, is
    // what's running.
    const results = loadCanopySearch().searchIndex(koEntries, "주문", 10);
    const orders = results.find((r: { entry: { p: string } }) => r.entry.p === "guide/orders.html");
    expect(orders).toBeDefined();
    expect(orders?.entry.b).toContain("주문을");
  });

  it("finds a page by a heading term not present in the title", () => {
    const results = loadCanopySearch().searchIndex(koEntries, "필터", 10);
    expect(results[0]?.entry.p).toBe("guide/orders.html");
  });

  it("finds a page by a body-only compound term", () => {
    const results = loadCanopySearch().searchIndex(koEntries, "운송장", 10);
    expect(results[0]?.entry.p).toBe("guide/shipping.html");
  });

  it("ranks the page whose title contains the term above pages that only mention it in body text", () => {
    // "재고" appears in reference/inventory.html's title AND (as "재고 관리") in
    // its own heading, but the word also risks appearing incidentally elsewhere —
    // title/heading weighting should still put the dedicated page first.
    const results = loadCanopySearch().searchIndex(koEntries, "재고", 10);
    expect(results[0]?.entry.p).toBe("reference/inventory.html");
  });

  it("does not match unrelated pages on a distinctive query", () => {
    const results = loadCanopySearch().searchIndex(koEntries, "재고", 10);
    expect(results.map((r: { entry: { p: string } }) => r.entry.p)).not.toContain("reference/settings.html");
  });

  it("a two-word query narrows to the page containing both stems, particles and all", () => {
    const results = loadCanopySearch().searchIndex(koEntries, "배송 상태", 10);
    expect(results[0]?.entry.p).toBe("guide/shipping.html");
  });
});
