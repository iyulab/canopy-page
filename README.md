# canopy-page

> One settings file, one command, one documentation site.

**canopy-page** turns a folder of markdown into a published documentation site. It owns the
authoring pipeline around the rendering: the settings a site is configured by, the checks that
keep broken references from shipping, and the build that ties them together. The rendering
itself is [canopy](https://github.com/iyulab/canopy)'s job, and canopy-page drives it.

**Live docs**: <https://iyulab.github.io/canopy-page> — built with canopy-page itself, from the
[`examples/site`](examples/site) in this repository, republished on every push to `main`.

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

## What ships in every site

No `settings.json` field turns these on — they are just there, on the next build. Reading a
page never depends on any of the scripted ones: block scripts, or print the page, and only they
go away.

- **Search**, matching a query against every page's title, headings, and body — `Ctrl+K` /
  `Cmd+K` jumps to it from anywhere
- **The current page and section, marked** in the sidebar and the on-page outline, updating as
  you scroll
- **A dark/light toggle** that remembers a reader's choice; without one, pages follow the
  system setting
- **Prev/next cards** linking to a page's neighbors in the sidebar's own order, and **backlinks**
  listing every page that points to it
- **A full-screen menu on narrow screens**, rather than one that pushes the page's content down
- **Sitemap and `robots.txt`**, once `siteUrl` is set

See it live at <https://iyulab.github.io/canopy-page>, or read
[What a reader gets](examples/site/guide/reading.md) for how each one behaves.

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
npx canopy-page watch docs/site       # rebuild on change, serve it locally
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
| `canopy-page watch [site-dir] [-o out] [--port n]` | Build, then rebuild on change and serve it locally (default port `8080`) |

`[site-dir]` is the folder holding `settings.json`, and defaults to the current one.

## settings.json

Every field is an override, so `{}` is a valid settings file: a folder of markdown builds with
its navigation derived from the folder tree. Settings exist for what a tree cannot say by itself
— the order of a release log, a label that is not a directory name, a draft folder that stays
unpublished.

```json
{
  "$schema": "https://iyulab.github.io/canopy-page/settings.schema.json",
  "title": "Product Help",
  "description": "How to use it",
  "lang": "en-GB",
  "icon": "assets/favicon.png",
  "exclude": ["_drafts", "*.tmp"],
  "rehypePlugins": ["rehype-declart"],
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
| `$schema` | Optional. Points an editor (VS Code, JetBrains) at [`settings.schema.json`](https://iyulab.github.io/canopy-page/settings.schema.json) for completion and inline validation. Read and ignored by canopy-page itself |
| `title` | Site name. Defaults to the folder's name |
| `description` | Fills `<meta name="description">`, which is what link previews show |
| `lang` | BCP 47 tag for `<html lang>`. Worth setting for any non-English site: assistive technology reads pronunciation from it |
| `strings` | Overrides for the reader chrome's own text — `search`, `toggleTheme`, `siteNav`, `pageNav`, `onThisPage`, `indexTitle` (the auto-generated contents page's title/heading), `backlinks` (a page's "linked references" heading), `searchFailed` (the client search's failure message). `lang` only changes what `<html lang>` declares; this text is canopy's own UI or canopy-page's own search script, not vault content, so it stays English otherwise. No built-in translation table — the same reasoning `home.label` already follows: link text has to be written in the site's own language. Keys left out keep their English default |
| `icon` | Favicon, relative to the settings file. Must be a published file |
| `tokens` | CSS of design-token overrides, relative to the settings file. Appended *after* canopy's own tokens, so a file naming one value keeps the rest. It is configuration rather than content, so — unlike `icon` and `logo` — it is excluded from the published site automatically. Absent: canopy's default palette |
| `logo` | Image shown beside the site title, relative to the settings file. Must be a published file — the opposite direction from `tokens`, because this one is content. Rendered with an empty `alt`, deliberately: the site title beside it already names the site, so there is no separate text to give it. Absent: the sidebar header shows the title text alone |
| `home` | A link back to the site this documentation sits beside: `{ url, label }`. Both are required together — naming half of it is not a valid setting. `url` is absolute when the target is a different origin, relative when it is a sibling of the published site (each page resolves it against its own depth, the same as every other internal link); there is no default `label`, because link text has to be written in the site's own language. Absent: no link back to a surrounding site is rendered |
| `siteUrl` | Absolute URL naming where the built site will stand. Every link canopy writes is relative, which is what lets a site be served from any sub-path — and exactly why a sitemap, whose entries must be absolute, needs this separately. **Only** when it is set does `build` write `sitemap.xml` and a `robots.txt` pointing at it. Absent: neither file is written |
| `exclude` | Paths to leave unpublished: a directory (`_drafts` or `_drafts/**`), an extension at any depth (`*.tmp`), or one exact path. Patterns are relative to the settings file, and a shape outside that list — `images/*.md` — is refused rather than left to match nothing |
| `rehypePlugins` | Package names of rehype plugins to run on every page, after canopy's own sanitize step and before syntax highlighting — canopy's fixed extension point for markdown that needs more than CommonMark and GFM, a diagram fence rendered to SVG being the case this exists for. Each entry is an installed package name (`"rehype-declart"`), never a filesystem path — a relative-looking entry is refused, since the directory it would resolve against is wherever the build happens to run from, not this file |
| `sections` | Ordered regions of the site — see below |

`tokens` is two blocks in practice, not one — a bare `:root` and a `prefers-color-scheme: dark`
override:

```css
/* brand.css */
:root {
  --accent: #0a7c5a;
  --accent-hover: #096a4d;
}

@media (prefers-color-scheme: dark) {
  :root {
    --accent: #4ecfa2;
    --accent-hover: #6fdcb5;
  }
}
```

canopy's own tokens end with a `prefers-color-scheme: dark` block, and a media query adds no
specificity over a bare selector — so a bare `:root` appended after that block wins in *both*
schemes. A one-block file naming only a light-mode colour would ship that colour onto a dark
sidebar too.

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

A page is shown under the name canopy gives it: its frontmatter `title`, else the heading it opens
with, else its filename. That usually means a section needs no `label` at all — `label` is for the
cases the documents cannot answer, and it still overrides them when written. A section whose
directory holds an `index` page is named by that page for the same reason.

A section's heading already links its own index page, so naming that page in `items` asks for what
is there rather than for a second copy of it, and is not counted as placing it twice.

## What `check` reports

Errors — these stop a build:

- A settings reference that matches no page, or a page placed more than once
- A link that points at nothing published, naming the page and the line
- An image that is not a published file
- A wikilink that matches no page. It renders as plain text rather than as a broken link, so the
  message says so — otherwise nobody knows what they are looking for

A link whose destination stops at a space is reported as that, rather than as the truncated path
it becomes. An unbracketed destination ends at the first space — `[x](../a b/c.md)` links `../a`
and leaves the rest as text — so the target the message would otherwise name is one nobody wrote.

Warnings — reported, and the build continues:

- Pages no section covers
- A root-absolute reference (`/assets/logo.png`) with nothing published at that path. Where such a
  path resolves depends on what the site is served from, which is not a checker's to know — but a
  site served from its own root is the ordinary case, and a `public/`-style folder that other
  generators map onto the root does not exist here, so these silently 404. A warning rather than
  an error, because mounting the site elsewhere would make it right. When `siteUrl` already
  declares a sub-path mount, a root-absolute reference warns even if it resolves today, since that
  is the one case the checker can actually judge
- An `exclude` pattern that matched nothing, which usually means a path written from the wrong
  place. Extension patterns are left alone: `*.tmp` in a site with no scratch files is a rule
  about what may never ship, not a claim that something is there
- A section with no `label` and no index page, whose sidebar heading falls back to its own
  directory name — a filesystem detail, not a name anyone chose. Add a `label`, or an index page
  for the section to name itself

Checking reads the settings and each page. It never renders, so it is fast enough to sit at the
front of a pipeline, at the scale a product manual reaches. References inside fenced
or inline code are ignored: a fenced example of a broken link is documentation, not a broken link.
What canopy states it leaves alone is left alone here too — absolute URLs, protocol-relative URLs,
bare fragments, and paths above the site root. A target ending in `/` names a directory, and is
answered by the index page that directory is entered by.

`build` writes two files `check` never sees: with `siteUrl` set, a `sitemap.xml` listing every
published page and a `robots.txt` pointing at it. Neither is checked, because neither exists until
the build has already succeeded.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), including what a release has to update besides the
version number.

## License

MIT
