#!/usr/bin/env node
import { buildSite } from "./build.js";
import { parseArgs } from "./cli-args.js";
import { SiteError } from "./site.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.error);
    process.exitCode = 1;
    return;
  }

  process.exitCode = await buildSite({ dir: args.dir, out: args.out });
}

main().catch((error: unknown) => {
  // A site error is about the site, not about canopy-page: the message is the
  // whole of what a reader needs, and a stack trace on top of it only buries it.
  if (error instanceof SiteError) console.error(`error: ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
});
