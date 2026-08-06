import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSettings } from "./settings.js";

/**
 * The README's settings example, checked against the parser that reads real
 * ones.
 *
 * A configuration example that does not validate is worse than no example: it
 * is the first thing anyone copies, and the error it produces looks like the
 * tool being broken rather than the documentation being wrong. Validation is
 * strict about unknown keys, so this also catches a field renamed in code and
 * left behind in prose.
 */

const README = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "README.md");

/** The fenced JSON blocks of a markdown document, in order. */
function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1] as string);
}

describe("README", () => {
  it("shows a settings example that the parser accepts", async () => {
    const blocks = jsonBlocks(await readFile(README, "utf8"));
    expect(blocks.length).toBeGreaterThan(0);

    const settings = parseSettings(blocks[0] as string);
    // Spot-check that the example still demonstrates what the prose says it does.
    expect(settings.sections?.map((section) => section.path)).toEqual(["guide", "release-notes"]);
    expect(settings.sections?.[1]?.order).toBe("desc");
  });
});
