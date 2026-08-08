// Copies static browser assets (not compiled by tsc, which only touches
// .ts files under src/) into dist/, so they ship in the published package
// the same way the compiled .js files do. package.json's `files` list is
// just ["dist", "CHANGELOG.md"] — anything not under dist/ never publishes.
import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
await cp(path.join(root, "..", "src", "assets"), path.join(root, "..", "dist", "assets"), {
  recursive: true,
});
