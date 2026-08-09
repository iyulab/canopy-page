# Contributing

## Working on this repo

```sh
npm install
npm run check   # tsc --noEmit
npm run lint    # biome lint ./src
npm test        # vitest run
npm run build   # compiles to dist/, required before dist/cli.js runs
```

`examples/site` is both the demo and the widest end-to-end test there is: settings parsing,
reference checks, navigation, and rendering all have to agree for it to build. Check it against
your own build of the CLI before committing a change that touches rendering or checks:

```sh
npm run build
node dist/cli.js check examples/site
node dist/cli.js build examples/site -o dist-demo
```

## Releasing

A release is more than a version bump — `examples/site` is this project's own published
documentation (<https://iyulab.github.io/canopy-page>), and it goes stale the moment a
reader-facing change ships without a matching edit there. Do all of this in the same PR:

1. Move `CHANGELOG.md`'s `[Unreleased]` section under a new `## [x.y.z] — YYYY-MM-DD` heading.
2. **For every entry under Added/Changed that a reader (not just a consumer reading
   `package.json`) would notice, reflect it in `examples/site`** — add or edit a guide page, and
   add a dated file under `examples/site/release-notes/` describing it in reader-facing language
   (see the existing files there for the tone: short, one heading per change, link to the guide
   page that covers it in full). A dependency bump alone (no visible behavior change) does not
   need a release-notes entry.
3. Bump the `version` in `package.json` to match the CHANGELOG heading.
4. Commit, push to `main`, then tag `vx.y.z` and push the tag.

Step 4's tag push is what `release.yml` verifies and publishes to npm. Step 2's edits redeploy
the docs on their own — `pages.yml` runs on every push to `main` that touches `examples/**`,
`src/**`, or `package.json`, tag or no tag — so nothing beyond landing the PR is needed to get
the updated docs live.

If a change originates in [canopy](https://github.com/iyulab/canopy) (canopy-page's rendering
dependency) rather than in this repo, the same rule applies once canopy-page's own dependency on
it is bumped: the CHANGELOG's `[x.y.z]` entry names what changed, and `examples/site` shows it.
