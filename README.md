# canopy-page

> One settings file, one command, one documentation site.

**canopy-page** turns a folder of markdown into a published site — documentation, a blog, a
release log. It owns the authoring pipeline around the rendering: the settings a site is
configured by, the checks that keep broken references from shipping, and the build that ties them
together. The rendering itself is [canopy](https://github.com/iyulab/canopy)'s job, and
canopy-page drives it.

**Documentation: <https://iyulab.github.io/canopy-page>** — every command, every setting, every
check, and everything a published site ships with. It is built with canopy-page itself, from
[`docs/`](docs) in this repository, and republished on every push to `main`.

## Install

```sh
npm install --save-dev @iyulab/canopy-page
```

Node 22 or newer.

## Quick start

```sh
npx canopy-page init docs/site     # write a settings file (and a home page, if needed)
npx canopy-page check docs/site    # report anything broken, without building
npx canopy-page build docs/site -o dist/help
npx canopy-page watch docs/site    # rebuild on change, serve it locally
```

`build` runs the same checks `check` does and writes nothing if any of them fail; both leave with
a non-zero exit code, which is all a pipeline needs.

A site is configured by one `settings.json` beside its markdown. Every field is an override, so
`{}` is a valid one; this one names a guide in a chosen order and a release log, newest first:

```json
{
  "$schema": "https://iyulab.github.io/canopy-page/settings.schema.json",
  "title": "Product Help",
  "sections": [
    { "path": "guide", "items": ["guide/install", "guide/*"] },
    { "path": "release-notes", "label": "Release notes", "order": "desc" }
  ]
}
```

## What you get

- **Checks before publishing** — links, wikilinks, images and settings references, each named by
  page and line, so a dead link fails the build instead of reaching a reader
- **A site that works without configuration** — search (`Ctrl+K`), dark mode, an on-page outline,
  backlinks, prev/next cards, an image lightbox, and a mobile menu, none of them needed to read a
  page
- **Navigation from the folder tree**, ordered and labelled by `sections` only where the tree
  cannot say it
- **Highlighted code, math and callouts** at build time, and diagrams through rehype plugins
- **Dated pages and feeds**, sitemaps and link-preview metadata once `siteUrl` is set
- **A blog inside your own site**, wearing its header, footer and colors
- **A theming contract**: your CSS always wins, against stable class names and design tokens

## Read more

- [Guide](https://iyulab.github.io/canopy-page/guide/) — from an empty folder to a deployed site
- [The settings file](https://iyulab.github.io/canopy-page/reference/settings.html) — every field
- [Commands](https://iyulab.github.io/canopy-page/reference/commands.html) — every command and option
- [What check reports](https://iyulab.github.io/canopy-page/reference/check.html) — every error and warning
- [Theming](https://iyulab.github.io/canopy-page/reference/theming.html) — tokens, dark mode, hooks, regions and slots
- [Release notes](https://iyulab.github.io/canopy-page/release-notes/) — what changed, for readers;
  [CHANGELOG.md](CHANGELOG.md) for the full record

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), including what a release has to update besides the
version number.

## License

MIT
