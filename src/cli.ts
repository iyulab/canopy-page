#!/usr/bin/env node
import { buildSite } from "./build.js";
import { checkSite } from "./check.js";
import { initSite, InitError } from "./init.js";
import { parseArgs } from "./cli-args.js";
import { SiteError } from "./site.js";
import { WatchError, watchSite } from "./watch.js";

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

  if (args.command === "watch") {
    const handle = await watchSite({ dir: args.dir, out: args.out, port: args.port });
    if (handle === undefined) {
      // The initial build already printed why — buildSite/reportFindings own
      // that message, watch has nothing to add.
      process.exitCode = 1;
      return;
    }
    let closing = false;
    const shutdown = (): void => {
      if (closing) return;
      closing = true;
      void handle.close().then(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
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
  if (error instanceof SiteError || error instanceof InitError || error instanceof WatchError) {
    console.error(`error: ${error.message}`);
  }
  else console.error(error);
  process.exitCode = 1;
});
