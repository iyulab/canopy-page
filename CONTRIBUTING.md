# Contributing

## Working on this repo

```sh
npm install
npm run check   # tsc --noEmit
npm run lint    # biome lint ./src
npm test        # vitest run
npm run build   # compiles to dist/, required before dist/cli.js runs
```

`docs/` is the documentation site, and also the widest end-to-end test there is: settings parsing,
reference checks, navigation, and rendering all have to agree for it to build. Check it against
your own build of the CLI before committing a change that touches rendering or checks:

```sh
npm run build
node dist/cli.js check docs
node dist/cli.js build docs -o dist-demo
```

## Documentation

The site under `docs/` is the documentation — published at <https://iyulab.github.io/canopy-page>,
and the only reference there is. The README is a pitch and a quick start that links into it.

Any change a user can see updates the page that documents it **in the same commit**: a setting
(`docs/reference/settings.md`), a command or option (`docs/reference/commands.md`), something
`check` reports (`docs/reference/check.md`), a theming hook, region or slot
(`docs/reference/theming.md`), or what a built site does or contains (the guide page covering
it). A release adds a release note on top, as below.

`src/docs-site.test.ts` holds the site to the code where the two can be compared: every settings
key needs a row in the settings reference, every command and option in the usage text a mention
in the commands reference, every region, profile, slot and theming hook a mention in the theming
reference, and the newest CHANGELOG release a dated file in `docs/release-notes/`. It also fails
on a link to a separate usage document or a reference to the site's old location. Prose it
cannot compare — what a finding means, how a feature behaves — is the reviewer's to check.

## Releasing

A release is more than a version bump — `docs/` is this project's own published
documentation (<https://iyulab.github.io/canopy-page>), and it goes stale the moment a
reader-facing change ships without a matching edit there. Do all of this in the same PR:

1. Move `CHANGELOG.md`'s `[Unreleased]` section under a new `## [x.y.z] — YYYY-MM-DD` heading.
2. **For every entry under Added/Changed that a reader (not just a consumer reading
   `package.json`) would notice, add a dated file under `docs/release-notes/`** describing it in
   reader-facing language (see the existing files there for the tone: short, one heading per
   change, link to the page that covers it in full). That page was updated with the change
   itself (see [Documentation](#documentation)); confirm it says what shipped. A dependency bump
   alone (no visible behavior change) does not need a release-notes entry. The release note's
   filename starts with the CHANGELOG heading's date — the test suite checks for it.
3. Bump the `version` in `package.json` to match the CHANGELOG heading.
4. Commit, push to `main`, then tag `vx.y.z` and push the tag.

Step 4's tag push is what `release.yml` verifies and publishes to npm. Step 2's edits redeploy
the docs on their own — `pages.yml` runs on every push to `main` that touches `docs/**`,
`src/**`, or `package.json`, tag or no tag — so nothing beyond landing the PR is needed to get
the updated docs live.

If a change originates in [canopy](https://github.com/iyulab/canopy) (canopy-page's rendering
dependency) rather than in this repo, the same rule applies once canopy-page's own dependency on
it is bumped: the CHANGELOG's `[x.y.z]` entry names what changed, and `docs/` shows it.
