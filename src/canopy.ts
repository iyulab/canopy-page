import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Running canopy.
 *
 * canopy-page drives canopy through its command line rather than importing its
 * library, deliberately: it is the same door every other consumer uses, and a
 * door only stays wide enough if the people who could have gone around it do
 * not. A gap in the CLI that canopy-page routed around would be a gap nobody
 * else gets fixed either.
 *
 * The executable is located through the dependency itself, so the version that
 * runs is the version this package resolved — not whatever a `canopy` on the
 * PATH happens to be.
 */

/**
 * Absolute path of canopy's executable.
 *
 * Resolved as a sibling of the package entry point, because the package does not
 * expose its own `package.json` and so its `bin` declaration cannot be read.
 * Spawning the JavaScript file with this process's Node is what keeps this
 * working the same on every platform: `node_modules/.bin/canopy` is a shell
 * script on one and a `.cmd` on another, and running either would mean handing
 * arguments to a shell to re-parse.
 */
export function canopyExecutable(): string {
  const entry = fileURLToPath(import.meta.resolve("@iyulab/canopy"));
  return path.join(path.dirname(entry), "cli.js");
}

/** Run canopy with the given arguments, inheriting stdio, and return its exit code. */
export async function runCanopy(args: readonly string[]): Promise<number> {
  const child = spawn(process.execPath, [canopyExecutable(), ...args], {
    stdio: "inherit",
  });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      // A signal death has no exit code, and reporting success for it would let
      // a killed build pass a pipeline.
      resolve(code ?? (signal === null ? 1 : 1));
    });
  });
}
