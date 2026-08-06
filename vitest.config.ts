import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The canopy source tree is checked out here as a submodule, for reading
    // rather than for building: canopy-page depends on the published package and
    // runs its CLI. Without this bound, Vitest's default glob walks into it and
    // runs canopy's suite as if it were this project's, so a run reports on code
    // this repo does not build and a failure there would look like a failure
    // here.
    include: ["src/**/*.test.ts"],
  },
});
