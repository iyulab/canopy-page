#!/usr/bin/env node
import { buildSite } from "./build.js";
import { checkSite } from "./check.js";
import { initSite, InitError } from "./init.js";
import { parseArgs } from "./cli-args.js";
import { SiteError } from "./site.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.error);
    process.exitCode = 1;
    return;
  }

  if (args.command === "init") {
    const { settingsPath, pagePath } = await initSite(args.dir);
    console.log(`canopy-page: wrote ${settingsPath}`);
    if (pagePath !== undefined) console.log(`canopy-page: wrote ${pagePath}`);
    console.log("canopy-page: run `canopy-page build` to publish it");
    return;
  }

  process.exitCode =
    args.command === "build"
      ? await buildSite({ dir: args.dir, out: args.out })
      : await checkSite(args.dir);
}

main().catch((error: unknown) => {
  // A site error is about the site, not about canopy-page: the message is the
  // whole of what a reader needs, and a stack trace on top of it only buries it.
  if (error instanceof SiteError || error instanceof InitError) {
    console.error(`error: ${error.message}`);
  }
  else console.error(error);
  process.exitCode = 1;
});
