---
description: "Install canopy-page with npm, then the four commands (init, check, build, watch) that make up the whole pipeline."
---
# Installing canopy-page

Node 22 or newer.

```sh
npm install --save-dev @iyulab/canopy-page
```

## Four commands

```sh
npx canopy-page init docs/site        # write a settings file (and a home page, if needed)
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

[Commands](../reference/commands.md) has every option, and what each command prints.

## Putting it in a pipeline

`check` never renders, so it is fast enough to sit at the front of a pipeline. `build` runs the
same checks on the same view of the site and stops if any fail — so a broken link cannot reach
the published output by way of the build step skipping what the check step would have caught.
Both leave with a non-zero exit code when something is broken, which is all a pipeline needs.
See [Exit codes](../reference/exit-codes.md) for what the codes mean, and
[Deploying the output](deploying.md) for where the built site goes.

## What runs underneath

canopy-page owns the authoring pipeline; [canopy](https://github.com/iyulab/canopy) owns the
rendering.

| | canopy-page | canopy |
|---|---|---|
| Configuration | `settings.json` and its validation | — |
| Structure | Sections, order, labels, globs | The navigation tree, link resolution |
| Integrity | Reference checks, exit codes | — |
| Output | Search, the outline highlight, the theme toggle, the image lightbox and the narrow-screen menu — its own scripts and styles; the sitemap | HTML, assets, backlinks, outlines, feeds, the page itself |

canopy is driven through its command line rather than its library API, on purpose: it is the same
door every other consumer uses, so a gap in that door is worth raising with canopy rather than
working around here. You install only canopy-page; canopy comes with it.
