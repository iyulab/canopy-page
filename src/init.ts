import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listSiteFiles, isPage, SETTINGS_FILENAME } from "./vault.js";

/**
 * Starting a site.
 *
 * `init` exists because the first minute is the one where a tool is judged, and
 * a blank folder plus a file format is not a start. What it writes is
 * deliberately small: a settings file naming the site, and a page to build if
 * there is nothing to build yet.
 *
 * It writes no example sections. A preset that referenced folders the author
 * does not have would fail the very first check, which teaches that the tool
 * complains before it has been used for anything. Every setting is an override,
 * so the honest starting point is the one with nothing overridden.
 *
 * ## About `$schema`
 *
 * The preset does not carry one. An editor resolves `$schema` by fetching it,
 * and a URL that answers 404 is worse than no URL at all: it puts a permanent
 * error in the author's editor and teaches them to ignore the one place
 * mistakes in this file would be shown. Settings are validated strictly when
 * they are read, naming the exact position of anything wrong, so nothing is
 * unguarded in the meantime — and adding `$schema` later is a line in a file,
 * for which the parser already makes room by accepting and ignoring the key.
 */

/** What `init` created, so the caller can say so. */
export interface InitResult {
  /** Absolute path of the settings file written. */
  settingsPath: string;
  /** Absolute path of the starter page, when one was needed. */
  pagePath?: string;
}

/** Why a site could not be started here. */
export class InitError extends Error {}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** A site title from a folder name: `product-help` reads as `Product help`. */
export function titleFromDirectory(dir: string): string {
  const name = path.basename(path.resolve(dir)).replace(/[-_]+/g, " ").trim();
  if (name === "") return "Site";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const STARTER_PAGE = `# {title}

This is the home page of the site. Everything in this folder is published with
it: sub-folders become sections, and links between pages keep working.
`;

/**
 * Write a starting settings file into `dir`, creating the folder if needed.
 *
 * An existing settings file is never overwritten. Running `init` twice is
 * usually a mistake about which folder one is in, and the cost of guessing
 * wrong — a settings file replaced by a blank one — is far higher than the cost
 * of saying so.
 */
export async function initSite(dir: string): Promise<InitResult> {
  const root = path.resolve(dir);
  await mkdir(root, { recursive: true });

  const settingsPath = path.join(root, SETTINGS_FILENAME);
  if (await exists(settingsPath)) {
    throw new InitError(`${settingsPath} already exists, and init will not replace it.`);
  }
  const existing = await listSiteFiles(root);

  const title = titleFromDirectory(root);
  await writeFile(settingsPath, `${JSON.stringify({ title }, null, 2)}\n`, "utf8");

  // A folder that already holds markdown is an existing set of documents being
  // adopted, not a new site; writing a home page into it would be an opinion
  // about content, which is not this tool's to have.
  if (existing.some(isPage)) return { settingsPath };

  const pagePath = path.join(root, "index.md");
  await writeFile(pagePath, STARTER_PAGE.replace("{title}", title), "utf8");
  return { settingsPath, pagePath };
}
