# canopy-page

> One settings file, one command, one documentation site.

**canopy-page** turns a folder of markdown into a published documentation site. It owns the
authoring pipeline around the rendering: the settings a site is configured by, the checks that
keep broken references from shipping, and the build that ties them together. The rendering
itself is [canopy](https://github.com/iyulab/canopy)'s job, and canopy-page drives it.

---

## Why

Documentation sites in a product repository tend to be rebuilt from scratch each time: a site
generator, a hand-maintained sidebar, a script that checks images, another that lists release
notes newest-first. The parts that differ between products are small. The parts that repeat are
the ones this package holds.

- **One contract.** A `settings.json` beside the markdown, so a site is reproducible from its
  source tree rather than from a build script holding half the configuration.
- **Checks that run before publishing.** A dead link costs nothing to find now and is expensive
  to find after deployment, where it presents as a reader hitting a 404.
- **One site, built in one pass.** Links and backlinks resolve across the whole of it, so a guide
  and the release notes it refers to stay connected.

## Install

```sh
npm install --save-dev @iyulab/canopy-page
```

Node 22 or newer.

## Getting started

```sh
npx canopy-page init docs/site     # write a settings file (and a home page, if needed)
npx canopy-page check docs/site    # report anything broken, without building
npx canopy-page build docs/site -o dist/help
```

`init` never replaces a settings file that is already there, and writes no page into a folder
that already holds markdown — an existing set of documents is being adopted, not started.

`build` runs the same checks `check` does, on the same view of the site, and stops if any of them
fail. Both leave with a non-zero exit code when they do, which is all a pipeline needs.

## Commands

| Command | What it does |
|---|---|
| `canopy-page init [site-dir]` | Write a settings file naming the site after its folder |
| `canopy-page check [site-dir]` | Check settings and references; build nothing |
| `canopy-page build [site-dir] [-o out]` | Check, then publish to `out` (default `./site`) |

`[site-dir]` is the folder holding `settings.json`, and defaults to the current one.

## settings.json

Every field is an override, so `{}` is a valid settings file: a folder of markdown builds with
its navigation derived from the folder tree. Settings exist for what a tree cannot say by itself
— the order of a release log, a label that is not a directory name, a draft folder that stays
unpublished.

```json
{
  "title": "Product Help",
  "description": "How to use it",
  "lang": "en-GB",
  "icon": "assets/favicon.png",
  "exclude": ["_drafts", "*.tmp"],
  "sections": [
    { "path": "guide", "label": "Guide", "items": [
      { "label": "Orders", "items": ["guide/orders/list", "guide/orders/detail"] },
      "guide/settings/*"
    ]},
    { "path": "release-notes", "label": "Release notes", "order": "desc" }
  ]
}
```

| Field | Meaning |
|---|---|
| `title` | Site name. Defaults to the folder's name |
| `description` | Fills `<meta name="description">`, which is what link previews show |
| `lang` | BCP 47 tag for `<html lang>`. Worth setting for any non-English site: assistive technology reads pronunciation from it |
| `icon` | Favicon, relative to the settings file. Must be a published file |
| `exclude` | Paths to leave unpublished: a directory (`_drafts`), an extension at any depth (`*.tmp`), or one exact path |
| `sections` | Ordered regions of the site — see below |

The settings file itself is never published, and neither is anything `exclude` names. A file
named `settings.json` deeper in the site is content, and ships.

Validation is strict: an unknown key is rejected rather than ignored, because a mistyped one that
is quietly dropped looks like a tool disobeying its configuration. Every message names the
position it is about, down to `sections[0].items[1]`.

### Sections

A settings file describes **one site**, built in one pass. `sections` name ordered regions within
it — a guide, a release log — rather than separate builds. Two genuinely independent sites are
two settings files.

| Field | Meaning |
|---|---|
| `path` | The directory this section covers |
| `label` | Heading shown for it. Defaults to the directory name |
| `order` | `asc` or `desc` for the pages inside. `desc` is what a release log wants |
| `items` | Explicit contents, in display order. Cannot be combined with `order` — a list *is* an order |

An entry in `items` is a page path, or a group:

```json
{ "label": "Orders", "items": ["guide/orders/list", "guide/orders/detail"] }
```

Paths may be written with or without their extension. Two glob shapes are understood: `dir/*` is
the pages directly in a directory, `dir/**` is every page beneath it. A glob means the pages there
**that are not placed already**, which is what makes `["guide/install", "guide/*"]` read the way
it looks — this page first, then the rest.

Pages no section mentions are placed anyway, inside their own section where they have one, and
reported. A page that exists but cannot be reached is a worse outcome than one shown in an order
nobody chose, and listing three pages of a folder and forgetting the fourth describes an
oversight rather than a decision to hide it.

Where no ordering is asked for at all, no navigation spec is produced and canopy derives the
navigation itself. Ordering derived here follows file names rather than page titles.

## What `check` reports

Errors — these stop a build:

- A settings reference that matches no page, or a page placed more than once
- A link that points at nothing published, naming the page and the line
- An image that is not a published file
- A wikilink that matches no page. It renders as plain text rather than as a broken link, so the
  message says so — otherwise nobody knows what they are looking for

Warnings — reported, and the build continues:

- Pages no section covers

Checking reads the settings and each page. It never renders, so it is fast enough to sit at the
front of a pipeline. References inside fenced or inline code are ignored: a fenced example of a
broken link is documentation, not a broken link. What canopy states it leaves alone is left alone
here too — absolute URLs, protocol-relative URLs, root-absolute deployment paths, bare fragments,
and paths above the site root.

## What belongs where

canopy-page owns the authoring pipeline; canopy owns the rendering.

| | canopy-page | canopy |
|---|---|---|
| Configuration | `settings.json` and its validation | — |
| Structure | sections, order, labels, globs | navigation tree, link resolution |
| Integrity | reference checks, exit codes | — |
| Output | — | HTML, assets, backlinks, outlines, site shell |

canopy is driven through its command line rather than its library API, on purpose: it is the same
door every other consumer uses, and a door only stays wide enough if the people who could have
gone around it do not. Where the command line cannot express something, that is worth raising
with canopy rather than working around here.

## License

MIT
