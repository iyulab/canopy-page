import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_KEYS, NAV_ITEM_KEYS, SECTION_KEYS, SETTINGS_KEYS, STRINGS_KEYS } from "./settings.js";

/**
 * `examples/site/settings.schema.json` is hand-maintained separately from the
 * parser's own allowlists in `settings.ts` — the two describe the same
 * contract from different angles (editor completion vs. runtime rejection)
 * and have no other link keeping them in step. This is the drift check: every
 * key the parser accepts must appear in the schema, and vice versa.
 */
const SCHEMA_PATH = path.join(
  import.meta.dirname,
  "..",
  "examples",
  "site",
  "settings.schema.json",
);

/** Only the shape this file's assertions read — not a general JSON Schema type. */
interface SchemaNode {
  $schema?: string;
  $id?: string;
  additionalProperties?: boolean;
  type?: string;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  oneOf?: SchemaNode[];
  $defs?: Record<string, SchemaNode>;
}

async function loadSchema(): Promise<SchemaNode> {
  return JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
}

function keysOf(properties: Record<string, SchemaNode> | undefined): Set<string> {
  return new Set(Object.keys(properties ?? {}));
}

describe("examples/site/settings.schema.json", () => {
  it("is valid JSON declaring the 2020-12 draft", async () => {
    const schema = await loadSchema();
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("rejects unlisted top-level properties, matching the parser", async () => {
    const schema = await loadSchema();
    expect(schema.additionalProperties).toBe(false);
  });

  it("declares exactly the top-level keys the parser accepts", async () => {
    const schema = await loadSchema();
    expect(keysOf(schema.properties)).toEqual(new Set([...SETTINGS_KEYS, "$schema"]));
  });

  it("declares exactly the strings keys the parser accepts", async () => {
    const schema = await loadSchema();
    expect(keysOf(schema.properties?.strings?.properties)).toEqual(STRINGS_KEYS);
  });

  it("declares exactly the section keys the parser accepts", async () => {
    const schema = await loadSchema();
    expect(keysOf(schema.$defs?.section?.properties)).toEqual(SECTION_KEYS);
  });

  it("declares exactly the home keys the parser accepts", async () => {
    const schema = await loadSchema();
    expect(keysOf(schema.properties?.home?.properties)).toEqual(HOME_KEYS);
    expect(schema.properties?.home?.required?.slice().sort()).toEqual(["label", "url"]);
  });

  it("declares exactly the nav-item keys the parser accepts, alongside the bare-string shorthand", async () => {
    const schema = await loadSchema();
    const [stringBranch, objectBranch] = schema.$defs?.navItem?.oneOf ?? [];
    expect(stringBranch?.type).toBe("string");
    expect(keysOf(objectBranch?.properties)).toEqual(NAV_ITEM_KEYS);
  });

  it("is the schema examples/site's own settings.json declares", async () => {
    const settings = JSON.parse(
      await readFile(
        path.join(import.meta.dirname, "..", "examples", "site", "settings.json"),
        "utf8",
      ),
    );
    const schema = await loadSchema();
    expect(settings.$schema).toBe(schema.$id);
  });
});
