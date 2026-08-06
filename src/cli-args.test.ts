import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli-args.js";

describe("parseArgs", () => {
  it("defaults to the current folder and ./site", () => {
    expect(parseArgs(["build"])).toEqual({ ok: true, command: "build", dir: ".", out: "site" });
  });

  it("takes the site directory positionally", () => {
    expect(parseArgs(["build", "docs/site"])).toMatchObject({ dir: "docs/site" });
  });

  it("takes the output directory by flag, in either spelling", () => {
    expect(parseArgs(["build", "-o", "dist/help"])).toMatchObject({ out: "dist/help" });
    expect(parseArgs(["build", "--out", "dist/help"])).toMatchObject({ out: "dist/help" });
  });

  it("reports a flag with no value", () => {
    expect(parseArgs(["build", "-o"])).toEqual({ ok: false, error: "-o needs a directory." });
    expect(parseArgs(["build", "-o", "--out"])).toMatchObject({ ok: false });
  });

  // A silently ignored flag is a build that used a default nobody asked for.
  it("rejects an unknown option instead of ignoring it", () => {
    expect(parseArgs(["build", "--outdir", "x"])).toMatchObject({ ok: false });
    expect(parseArgs(["build", "--outdir", "x"])).toMatchObject({
      error: expect.stringContaining('Unknown option "--outdir"'),
    });
  });

  it("rejects a second bare path", () => {
    expect(parseArgs(["build", "docs", "dist"])).toMatchObject({
      ok: false,
      error: expect.stringContaining('Unexpected argument "dist"'),
    });
  });

  it("shows usage with no arguments", () => {
    expect(parseArgs([])).toMatchObject({
      ok: false,
      error: expect.stringContaining("Usage: canopy-page <command>"),
    });
  });

  it("says a command is missing when given a flag first", () => {
    expect(parseArgs(["-o", "dist"])).toMatchObject({
      error: expect.stringContaining('Expected a command before "-o"'),
    });
  });

  it("parses check, which takes no output directory", () => {
    expect(parseArgs(["check"])).toEqual({ ok: true, command: "check", dir: "." });
    expect(parseArgs(["check", "docs/site"])).toEqual({
      ok: true,
      command: "check",
      dir: "docs/site",
    });
  });

  // Passing an output directory to a command that writes nothing is a
  // misunderstanding worth naming, not an extra to ignore.
  it("refuses an output directory for check", () => {
    expect(parseArgs(["check", "-o", "dist"])).toMatchObject({
      ok: false,
      error: expect.stringContaining("check does not"),
    });
  });

  it("names an unknown command", () => {
    expect(parseArgs(["publish"])).toMatchObject({
      error: expect.stringContaining('Unknown command "publish"'),
    });
  });
});
