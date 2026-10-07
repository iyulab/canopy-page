import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Layout, LayoutRule } from "@iyulab/canopy";
import type { Settings } from "./settings.js";

/**
 * Settings → the layout canopy reads (`--layout`): the site's own `profile`
 * and `regions` as the default rule, each section that sets either as a rule
 * for its directory.
 *
 * Nothing here decides anything canopy does not: which profile a page is in
 * and which fragment reaches it are canopy's to resolve from this, for the
 * build and — through canopy's own exports — for `check`, so the two cannot
 * disagree about a page.
 */
export function layoutSpec(settings: Settings): Layout | undefined {
  const siteRule: LayoutRule = {
    ...(settings.profile === undefined ? {} : { profile: settings.profile }),
    // A whole-site stream with no front page of its own gets one from canopy,
    // and the site's own name is what that page should be called.
    ...(settings.profile === "stream" && settings.title !== undefined ? { title: settings.title } : {}),
    ...(settings.pageSize === undefined ? {} : { pageSize: settings.pageSize }),
    ...(settings.featured === undefined ? {} : { featured: settings.featured }),
    ...(settings.regions === undefined ? {} : { regions: settings.regions }),
  };
  const dirs: Record<string, LayoutRule> = {};
  for (const section of settings.sections ?? []) {
    if (section.profile === undefined && section.regions === undefined) continue;
    dirs[section.path] = {
      ...(section.profile === undefined ? {} : { profile: section.profile }),
      ...(section.label === undefined ? {} : { title: section.label }),
      ...(section.regions === undefined ? {} : { regions: section.regions }),
      ...(section.pageSize === undefined ? {} : { pageSize: section.pageSize }),
      ...(section.featured === undefined ? {} : { featured: section.featured }),
    };
  }
  const hasSiteRule = Object.keys(siteRule).length > 0;
  const hasDirs = Object.keys(dirs).length > 0;
  if (!hasSiteRule && !hasDirs) return undefined;
  return { ...(hasSiteRule ? { default: siteRule } : {}), ...(hasDirs ? { dirs } : {}) };
}

/**
 * The folders to publish a feed for: every section that asks (`feed: true`),
 * and every section whose own profile is stream unless it says `feed: false`
 * — a stream is what a feed is for. Both need `siteUrl`, which makes a feed's
 * entries absolute; without it a stream simply has none, since nobody asked.
 * A site whose own profile is stream gets one feed for the whole site.
 */
export function feedDirs(settings: Settings): string[] {
  const dirs = (settings.sections ?? [])
    .filter(
      (section) =>
        section.feed === true ||
        (settings.siteUrl !== undefined && section.profile === "stream" && section.feed !== false),
    )
    .map((section) => section.path);
  if (settings.siteUrl !== undefined && settings.profile === "stream") dirs.push(".");
  return dirs;
}

/**
 * Run `use` with `layout` written to a temporary file, removed afterwards.
 * canopy reads a layout from a file; this one is derived from settings, so it
 * belongs neither beside the site (someone would edit it) nor in the output.
 */
export async function withLayoutFile<T>(
  layout: Layout | undefined,
  use: (file: string | undefined) => Promise<T>,
): Promise<T> {
  if (layout === undefined) return use(undefined);
  const dir = await mkdtemp(path.join(tmpdir(), "canopy-page-layout-"));
  try {
    const file = path.join(dir, "layout.json");
    await writeFile(file, JSON.stringify(layout, null, 2), "utf8");
    return await use(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
