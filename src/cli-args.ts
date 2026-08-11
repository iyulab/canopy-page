/**
 * Parsing the command line, kept apart from acting on it.
 *
 * Argument handling is where a tool is least forgiving and most tested: a
 * mistyped flag has to say so rather than being ignored, since a build that
 * quietly used a default nobody asked for is indistinguishable from a working
 * one until the site is deployed.
 */

/** A parsed invocation, or the reason it could not be parsed. */
export type ParsedArgs =
  | { ok: true; command: "build"; dir: string; out: string }
  | { ok: true; command: "watch"; dir: string; out: string; port: number }
  | { ok: true; command: "check" | "init"; dir: string }
  | { ok: false; error: string };

export const USAGE = [
  "Usage: canopy-page <command> [site-dir] [options]",
  "",
  "  init  [site-dir]           Start a site: write a settings file",
  "  check [site-dir]           Check the site without publishing it",
  "  build [site-dir]           Check the site, then publish it",
  "  watch [site-dir]           Build, then rebuild on change and serve it",
  "",
  "  [site-dir]                 Folder holding settings.json (defaults to .)",
  "  -o, --out <dir>            Where build/watch writes the site (defaults to ./site)",
  "  --port <n>                 Port watch serves on (defaults to 8080)",
].join("\n");

const OUT_FLAGS = new Set(["-o", "--out"]);
const PORT_FLAGS = new Set(["--port"]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command === undefined) return { ok: false, error: USAGE };
  if (command === "build" || command === "check" || command === "init" || command === "watch") {
    return parseCommand(command, rest);
  }
  if (command.startsWith("-")) {
    // A flag where a command belongs usually means the command was forgotten,
    // and "unknown command --out" would send someone looking for the wrong bug.
    return { ok: false, error: `${USAGE}\n\nExpected a command before "${command}".` };
  }
  return { ok: false, error: `${USAGE}\n\nUnknown command "${command}".` };
}

function parsePort(value: string | undefined, flag: string): number | { ok: false; error: string } {
  if (value === undefined || value.startsWith("-")) {
    return { ok: false, error: `${flag} needs a port number.` };
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return { ok: false, error: `${flag} needs a port number between 1 and 65535, got "${value}".` };
  }
  return parsed;
}

function parseCommand(
  command: "build" | "check" | "init" | "watch",
  argv: readonly string[],
): ParsedArgs {
  const positional: string[] = [];
  let out: string | undefined;
  let port: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (OUT_FLAGS.has(arg)) {
      if (command !== "build" && command !== "watch") {
        // Only build and watch write a site, so an output directory elsewhere
        // is not a harmless extra: whoever passed it expects a site to appear
        // somewhere.
        return {
          ok: false,
          error: `${arg} is for build/watch, which write a site; ${command} does not.`,
        };
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        return { ok: false, error: `${arg} needs a directory.` };
      }
      out = value;
      i += 1;
      continue;
    }
    if (PORT_FLAGS.has(arg)) {
      if (command !== "watch") {
        return {
          ok: false,
          error: `${arg} is for watch, which serves the site; ${command} does not.`,
        };
      }
      const parsed = parsePort(argv[i + 1], arg);
      if (typeof parsed !== "number") return parsed;
      port = parsed;
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, error: `${USAGE}\n\nUnknown option "${arg}".` };
    }
    positional.push(arg);
  }

  if (positional.length > 1) {
    // The output directory is a flag precisely so it cannot be confused with the
    // input one; a second bare path is more likely a typo than an intention.
    return { ok: false, error: `${USAGE}\n\nUnexpected argument "${positional[1]}".` };
  }

  const dir = positional[0] ?? ".";
  if (command === "build") return { ok: true, command, dir, out: out ?? "site" };
  if (command === "watch") return { ok: true, command, dir, out: out ?? "site", port: port ?? 8080 };
  return { ok: true, command, dir };
}
