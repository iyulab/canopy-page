/**
 * Parsing the command line, kept apart from acting on it.
 *
 * Argument handling is where a tool is least forgiving and most tested: a
 * mistyped flag has to say so rather than being ignored, since a build that
 * quietly used a default nobody asked for is indistinguishable from a working
 * one until the site is deployed.
 */

/** The commands canopy-page understands. */
export type Command = "build";

/** A parsed invocation, or the reason it could not be parsed. */
export type ParsedArgs =
  | { ok: true; command: Command; dir: string; out: string }
  | { ok: false; error: string };

export const USAGE = [
  "Usage: canopy-page build [site-dir] [options]",
  "",
  "  [site-dir]                 Folder holding settings.json (defaults to .)",
  "",
  "  -o, --out <dir>            Where to write the site (defaults to ./site)",
].join("\n");

const OUT_FLAGS = new Set(["-o", "--out"]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command === undefined) return { ok: false, error: USAGE };
  if (command === "build") return parseBuild(rest);
  if (command.startsWith("-")) {
    // A flag where a command belongs usually means the command was forgotten,
    // and "unknown command --out" would send someone looking for the wrong bug.
    return { ok: false, error: `${USAGE}\n\nExpected a command before "${command}".` };
  }
  return { ok: false, error: `${USAGE}\n\nUnknown command "${command}".` };
}

function parseBuild(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  let out: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (OUT_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        return { ok: false, error: `${arg} needs a directory.` };
      }
      out = value;
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

  return { ok: true, command: "build", dir: positional[0] ?? ".", out: out ?? "site" };
}
