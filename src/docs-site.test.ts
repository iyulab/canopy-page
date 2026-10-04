import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CONTROL_SLOTS, PROFILES, REGIONS, THEME_HOOKS } from "@iyulab/canopy";
import { describe, expect, it } from "vitest";
import { USAGE } from "./cli-args.js";
import {
  HOME_KEYS,
  KNOWN_BROKEN_KEYS,
  NAV_ITEM_KEYS,
  SECTION_KEYS,
  SETTINGS_KEYS,
  STRINGS_KEYS,
} from "./settings.js";

/**
 * The documentation site under `docs/` is the documentation — there is no
 * second reference to fall back on. These are the lists that site has to keep
 * whole: every name a consumer can write (a settings key, a command, an
 * option, a theming hook) is defined in code, and a name the code gains
 * without the site gaining a line about it is a feature nobody can find.
 *
 * Each check reports what is missing by name, so a failure says which page to
 * edit and what to add to it.
 */

const REPO = path.join(import.meta.dirname, "..");
const DOCS = path.join(REPO, "docs");

async function page(relative: string): Promise<string> {
  return readFile(path.join(DOCS, relative), "utf8");
}

/** The names among `names` that `text` never writes as a code span of their own. */
function undocumented(text: string, names: Iterable<string>): string[] {
  const spans = new Set([...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] as string));
  return [...names].filter((name) => !spans.has(name));
}

/**
 * The text under `heading` (written exactly, `## Sections`), up to the next
 * heading of any level — so a table read from it is that section's own, and a
 * key documented in one table cannot stand in for the same name in another.
 * Fenced code is left out first, since a `#` line inside one is not a heading.
 */
function sectionOf(text: string, heading: string): string {
  const prose = text.replace(/^```[\s\S]*?^```/gm, "");
  const start = prose.split("\n").findIndex((line) => line.trimEnd() === heading);
  if (start === -1) throw new Error(`no "${heading}" heading`);
  const rest = prose.split("\n").slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6} /.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

/** The names among `names` that head no row of the table under `heading` — a field documented is a field with a row. */
function withoutRow(text: string, heading: string, names: Iterable<string>): string[] {
  const rows = new Set(
    [...sectionOf(text, heading).matchAll(/^\|\s*`([^`\n]+)`\s*\|/gm)].map((match) => match[1] as string),
  );
  return [...names].filter((name) => !rows.has(name));
}

/** The first fenced JSON block of `text`, parsed. */
function firstJsonBlock(text: string): unknown {
  const block = /```json\r?\n([\s\S]*?)```/.exec(text);
  if (block === null) throw new Error("no ```json block");
  return JSON.parse(block[1] as string);
}

/** The names among `names` that appear in no code span of `text`, even as part of a longer one. */
function unmentioned(text: string, names: Iterable<string>): string[] {
  const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] as string);
  const literal = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...names].filter((name) => {
    const word = new RegExp(`(^|[^\\w-])${literal(name)}(?![\\w-])`);
    return !spans.some((span) => word.test(span));
  });
}

/** The commands and options canopy-page's own usage text offers. */
function usageVocabulary(): { commands: string[]; options: string[] } {
  const commands: string[] = [];
  const options = new Set<string>();
  for (const line of USAGE.split("\n")) {
    const command = /^ {2}([a-z][a-z-]*)\s/.exec(line);
    if (command !== null) commands.push(command[1] as string);
    for (const option of line.matchAll(/(?<![\w-])(--?[a-z][a-z-]*)/g)) options.add(option[1] as string);
  }
  return { commands, options: [...options] };
}

/**
 * Tracked files whose text contains `literal`, leaving out history: the
 * changelog and past release notes are records of what was true when they
 * were written, and may name what has moved since. `git grep` searches exactly
 * what a clone receives — nothing ignored or generated.
 */
function trackedFilesNaming(literal: string): string[] {
  try {
    return execFileSync(
      "git",
      ["grep", "-l", "-z", "-F", literal, "--", ".", ":!CHANGELOG.md", ":!docs/release-notes"],
      { cwd: REPO, encoding: "utf8" },
    )
      .split("\0")
      .filter((file) => file !== "");
  } catch (error) {
    // git grep exits 1 for "no match", which is the passing case here.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

describe("the documentation site", () => {
  it("documents every settings key in reference/settings.md", async () => {
    const text = await page("reference/settings.md");
    expect({
      settings: withoutRow(text, "## Top-level fields", SETTINGS_KEYS),
      sections: withoutRow(text, "## Sections", SECTION_KEYS),
      navItems: withoutRow(text, "### Items", NAV_ITEM_KEYS),
      strings: withoutRow(text, "## Strings", STRINGS_KEYS),
      home: withoutRow(text, "### `home`", HOME_KEYS),
      knownBroken: withoutRow(text, "## `knownBroken`", KNOWN_BROKEN_KEYS),
    }).toEqual({ settings: [], sections: [], navItems: [], strings: [], home: [], knownBroken: [] });
  });

  it("shows, as this site's own settings file, the one docs/settings.json actually holds", async () => {
    const shown = firstJsonBlock(await page("reference/settings.md"));
    const actual = JSON.parse(await readFile(path.join(DOCS, "settings.json"), "utf8"));
    expect(shown).toEqual(actual);
  });

  it("documents every region, profile, slot and theming hook in reference/theming.md", async () => {
    const text = await page("reference/theming.md");
    expect({
      regions: undocumented(text, REGIONS),
      profiles: undocumented(text, PROFILES),
      slots: undocumented(text, CONTROL_SLOTS),
      hooks: undocumented(
        text,
        THEME_HOOKS.map((hook) => `.${hook}`),
      ),
    }).toEqual({ regions: [], profiles: [], slots: [], hooks: [] });
  });

  it("documents every command and option of the usage text in reference/commands.md", async () => {
    const text = await page("reference/commands.md");
    const { commands, options } = usageVocabulary();
    expect(commands.length).toBeGreaterThan(0);
    expect(options.length).toBeGreaterThan(0);
    expect({ commands: unmentioned(text, commands), options: unmentioned(text, options) }).toEqual({
      commands: [],
      options: [],
    });
  });

  it("has a release note naming the newest minor release in the changelog", async () => {
    // Every minor release gets a note that names its version; a patch release
    // may go without one (CONTRIBUTING, Releasing). Matched by version, not by
    // date: several releases often share a day.
    const changelog = await readFile(path.join(REPO, "CHANGELOG.md"), "utf8");
    const newest = /^## \[(\d+\.\d+\.0)\]/m.exec(changelog);
    expect(newest, "CHANGELOG.md has no released minor version heading").not.toBeNull();
    const version = (newest as RegExpExecArray)[1] as string;
    const named = new RegExp(`(?<![\\d.])${version.replace(/\./g, "\\.")}(?![\\d.]*\\d)`);
    const dir = path.join(DOCS, "release-notes");
    const notes: string[] = [];
    for (const file of (await readdir(dir)).filter((name) => name.endsWith(".md") && name !== "index.md")) {
      if (named.test(await readFile(path.join(dir, file), "utf8"))) notes.push(file);
    }
    expect(notes, `no note in docs/release-notes/ names ${version}`).not.toEqual([]);
  });

  it("is the only reference — no separate usage document, and nothing points at one", () => {
    // Spelled out at run time, so this file is not itself a match.
    const retired = ["USAGE", "md"].join(".");
    expect(existsSync(path.join(DOCS, retired)), `docs/${retired} still exists`).toBe(false);
    expect(trackedFilesNaming(retired)).toEqual([]);
  });

  it("is where the site source lives — nothing names its old location", () => {
    const oldRoot = ["examples", "site"].join("/");
    expect(trackedFilesNaming(oldRoot)).toEqual([]);
  });
});
