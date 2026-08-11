# Installing canopy-page

Node 22 or newer.

```sh
npm install --save-dev @iyulab/canopy-page
```

## Four commands

```sh
npx canopy-page init docs/site        # write a settings file
npx canopy-page check docs/site       # report anything broken, build nothing
npx canopy-page build docs/site -o dist/help
npx canopy-page watch docs/site       # rebuild on change, serve it locally
```

`init` never replaces a settings file that is already there, and writes no page into a folder
that already holds markdown. Adopting an existing set of documents and starting a new site are
different situations, and only one of them wants a page written for it.

`watch` builds once, then rebuilds on every save and serves the result locally, so a browser
tab reloaded by hand is the only step left between editing a page and seeing it — no separate
`build` to rerun each time.

## Putting it in a pipeline

`check` never renders, so it is fast enough to sit at the front of a pipeline. `build` runs the
same checks on the same view of the site and stops if any fail — so a broken link cannot reach
the published output by way of the build step skipping what the check step would have caught.

```yaml
- run: npx canopy-page check docs/site
```

Both leave with a non-zero exit code when something is broken, which is all a pipeline needs.
See [Exit codes](../reference/exit-codes.md) for what the codes mean.

## What runs underneath

canopy-page owns the settings, the checks, and the build. The rendering is
[canopy](https://github.com/iyulab/canopy)'s, driven through its command line — the same door
every other consumer uses.
