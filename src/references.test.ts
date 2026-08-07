import { describe, expect, it } from "vitest";
import {
  decodeTarget,
  extractReferences,
  isExternalUrl,
  resolveFrom,
  targetPath,
} from "./references.js";

/** Targets in document order, dropping the positions. */
function targets(markdown: string): string[] {
  return extractReferences(markdown).map((reference) => reference.target);
}

describe("extractReferences", () => {
  it("finds links, images, and wikilinks", () => {
    const references = extractReferences(
      "See [install](guide/install.md) and ![logo](assets/logo.png) and [[notes/idea]].",
    );
    expect(references).toEqual([
      { target: "guide/install.md", kind: "link", line: 1 },
      { target: "assets/logo.png", kind: "image", line: 1 },
      { target: "notes/idea", kind: "wikilink", line: 1 },
    ]);
  });

  it("reports the line a reference is on", () => {
    const references = extractReferences("# Title\n\ntext\n\n[a](b.md)\n");
    expect(references[0]?.line).toBe(5);
  });

  // A fenced example of a link is documentation, not a link. Documentation
  // sites are full of them, which is what makes this the case worth pinning.
  it("ignores references inside fenced code", () => {
    expect(targets("```md\n[nope](missing.md)\n```\n\n[yes](real.md)")).toEqual(["real.md"]);
    expect(targets("~~~\n[nope](missing.md)\n~~~")).toEqual([]);
  });

  it("lets a longer fence quote a shorter one", () => {
    expect(targets("````\n```\n[nope](missing.md)\n```\n````\n\n[yes](real.md)")).toEqual([
      "real.md",
    ]);
  });

  it("ignores references inside inline code", () => {
    expect(targets("Write `[nope](missing.md)` like this, then [yes](real.md).")).toEqual([
      "real.md",
    ]);
  });

  it("ignores frontmatter", () => {
    expect(targets("---\nimage: assets/cover.png\n---\n\n[yes](real.md)")).toEqual(["real.md"]);
  });

  it("finds the target of a reference-style link definition", () => {
    expect(targets('Text [a][ref].\n\n[ref]: guide/install.md "Install"')).toEqual([
      "guide/install.md",
    ]);
  });

  it("finds an HTML image source", () => {
    expect(targets('<img src="assets/diagram.png" alt="Diagram">')).toEqual([
      "assets/diagram.png",
    ]);
  });

  it("unwraps an angle-bracketed URL", () => {
    expect(targets("[a](<guide/first steps.md>)")).toEqual(["guide/first steps.md"]);
  });

  it("takes the target of a wikilink with an alias or a heading", () => {
    expect(targets("[[notes/idea|The idea]] and [[notes/idea#Detail]]")).toEqual([
      "notes/idea",
      "notes/idea",
    ]);
  });
});

describe("isExternalUrl", () => {
  it("leaves alone what the renderer leaves alone", () => {
    expect(isExternalUrl("https://example.test/x")).toBe(true);
    expect(isExternalUrl("mailto:a@example.test")).toBe(true);
    expect(isExternalUrl("//example.test/x")).toBe(true);
    expect(isExternalUrl("/help/x.png")).toBe(true);
    expect(isExternalUrl("#section")).toBe(true);
    expect(isExternalUrl("")).toBe(true);
  });

  it("treats a site-relative path as its own", () => {
    expect(isExternalUrl("guide/install.md")).toBe(false);
    expect(isExternalUrl("../assets/logo.png")).toBe(false);
  });
});

describe("targetPath", () => {
  it("drops the part that addresses a place within the target", () => {
    expect(targetPath("guide/install.md#requirements")).toBe("guide/install.md");
    expect(targetPath("guide/install.md?v=2")).toBe("guide/install.md");
  });
});

describe("decodeTarget", () => {
  it("reads the encoding an editor writes for a space", () => {
    expect(decodeTarget("reference/error%20messages.md")).toBe("reference/error messages.md");
  });

  it("reads a non-ASCII directory back", () => {
    expect(decodeTarget("%ED%98%84%ED%99%A9/daily.md")).toBe("현황/daily.md");
  });

  it("leaves an unencoded path exactly as it is", () => {
    expect(decodeTarget("guide/install.md")).toBe("guide/install.md");
  });

  it("gives up on a malformed escape rather than guessing", () => {
    expect(decodeTarget("a%zzb/note.md")).toBeUndefined();
  });

  it("does not let an encoded slash become a directory boundary", () => {
    expect(decodeTarget("a%2Fb/note.md")).toBeUndefined();
  });

  it("keeps a trailing slash, which names a directory", () => {
    expect(decodeTarget("release%20notes/")).toBe("release notes/");
  });
});

describe("resolveFrom", () => {
  it("resolves against the folder holding the document", () => {
    expect(resolveFrom("guide/install.md", "first-steps.md")).toBe("guide/first-steps.md");
    expect(resolveFrom("guide/settings/api.md", "../install.md")).toBe("guide/install.md");
    expect(resolveFrom("index.md", "./guide/install.md")).toBe("guide/install.md");
  });

  // A target above the root addresses something the site was never given.
  it("gives up on a path that leaves the site", () => {
    expect(resolveFrom("index.md", "../outside.md")).toBeUndefined();
  });
});
