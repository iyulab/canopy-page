---
description: "Every field of settings.json, the one file a canopy-page site is configured by, with the file that built this site as the example."
---
# The settings file

Every field is an override, so `{}` is a valid settings file: a folder of markdown builds with
its navigation derived from the folder tree. Settings exist for what a tree cannot say by itself.

This is the file that produced the site you are reading:

```json
{
  "$schema": "https://iyulab.github.io/canopy-page/settings.schema.json",
  "title": "canopy-page",
  "description": "Documentation for canopy-page: one settings file, integrity checks, and a build — built with canopy-page itself, published on every push.",
  "lang": "en",
  "icon": "assets/logo.svg",
  "logo": "assets/logo.svg",
  "styles": "brand.css",
  "home": { "url": "https://github.com/iyulab/canopy-page", "label": "canopy-page on GitHub" },
  "siteUrl": "https://iyulab.github.io/canopy-page",
  "exclude": ["_drafts"],
  "rehypePlugins": ["rehype-declart", "rehype-mermaid"],
  "sections": [
    {
      "path": "guide",
      "items": [
        "guide/install",
        {
          "path": "guide/writing/index",
          "items": ["guide/writing/code-and-math", "guide/writing/diagrams"]
        },
        "guide/reading",
        { "path": "guide/localizing", "items": ["guide/한국어-예시/index"] }
      ]
    },
    { "path": "reference", "label": "Reference" },
    { "path": "release-notes", "order": "desc", "feed": true }
  ]
}
```

## Top-level fields

| Field | Meaning |
|---|---|
| `$schema` | Optional. Points an editor at [`settings.schema.json`](../settings.schema.json) for completion and inline validation — canopy-page itself reads and ignores it |
| `title` | Site name. Defaults to the folder's name |
| `description` | Fills `<meta name="description">`, which is what a link preview shows |
| `lang` | BCP 47 tag for `<html lang>`. Assistive technology reads pronunciation from it |
| `strings` | Overrides for the reader chrome's own text (`search`, `toggleTheme`, `siteNav`, `pageNav`, `onThisPage`, `indexTitle`, `backlinks`, `searchFailed`) — `lang` alone does not translate it, since it is canopy's UI (or canopy-page's own search script) rather than vault content |
| `icon` | Favicon, relative to the settings file. Must be a published file |
| `styles` | CSS files, relative to the settings file, linked after canopy's own |
| `logo` | Image shown beside the site title in the sidebar header, relative to the settings file. Must be a published file |
| `home` | A link back to the site this documentation sits beside: `{ url, label }` |
| `siteUrl` | Where the built site will stand, as an absolute URL. Turns on the sitemap, and the `<head>` tags that are addresses: canonical, `og:url`, `og:image`, `hreflang` |
| `previewImage` | Image link previews show, relative to the settings file, for pages with no `image:` of their own. Must be a published file. Needs `siteUrl` |
| `alternates` | The site's other language editions, `hreflang` → that edition's site URL. Needs `siteUrl` |
| `exclude` | Paths to leave unpublished |
| `sections` | Ordered regions of the site |
| `rehypePlugins` | Package names of rehype plugins to run on every page, such as a diagram renderer |
| `knownBroken` | Pages whose broken references are known and being fixed, `{ path, reason }` each — see [Exit codes](exit-codes.md#a-site-that-is-already-broken) |

Validation is strict: an unknown key is rejected rather than ignored. A mistyped key that is
quietly dropped looks like a tool disobeying its configuration, and every message names the
position it is about, down to `sections[0].items[1]`.

## Sections

| Field | Meaning |
|---|---|
| `path` | The directory this section covers |
| `label` | Heading shown for it. Defaults to the name the section's index page gives itself, then the directory name |
| `order` | `asc` or `desc` for the pages inside |
| `items` | Explicit contents, in display order. Cannot be combined with `order` — a list *is* an order |
| `feed` | `true` publishes an Atom feed of the section's dated pages. Needs `siteUrl` |

Note what the demo's settings do **not** contain: a label for `guide` or for `release-notes`.
Those sections have index pages, and a page that opens with a heading has already said what it is
called. `Reference` is labelled because this section has no index page of its own to ask.

### Ordering

`release-notes` uses `"order": "desc"`, which is why the August 8 notes come before the August 7
ones. Ordering derived this way follows filenames, not headings — filenames are what you see in
the folder you are ordering, and a log of dated files is exactly the case it serves.

`guide` uses `items` instead, which is a list and therefore already an order — the two cannot be
combined. Its second entry is a group carrying its own page: `guide/writing/index` is the page the
group's heading links, and `guide/writing/code-and-math` sits under it. A group's `path` names a
page, not a directory, so an index page is written out.

Globs are the other way to fill a section: `dir/*` is the pages directly in a directory, `dir/**`
is every page beneath it. A glob means the pages there **that are not placed already**, which is
what makes `["guide/install", "guide/*"]` read the way it looks — this page first, then the rest.

### Feeds

`release-notes` also sets `"feed": true`, so this site publishes `release-notes/feed.xml` — an
Atom feed a reader can subscribe to — and every page in that section links it for browsers and
feed readers to find.

An entry is a page beneath the section whose frontmatter names a `date:` (see
[Dated pages](../guide/writing/index.md#dated-pages)), newest first: its name, its `date:` and
`updated:`, its own `description:` as the summary, and its `author:` if it has one. The section's
index page describes the series rather than being an entry, so it is left out. A feed's links are
absolute, which is why `feed` needs `siteUrl`; a section with no dated page publishes no feed.

`check` warns about a page in a feed section that has no `date:` — it is silently missing from the
feed otherwise — and about any `date:` or `updated:` that is not a date.

### What `exclude` takes

A directory (`_drafts`), an extension at any depth (`*.tmp`), or one exact path. A shape outside
that list — `images/*.md` — is refused rather than left to match nothing quietly. A pattern that
is valid but matched nothing is a warning, since `*.tmp` in a site with no scratch files is a
rule about what may never ship rather than a claim that something is there.

This site excludes `_drafts`, and the page inside it is not in the sidebar, not in the output,
and not reachable.

## Branding

| Field | Not set |
|---|---|
| `styles` | Only canopy's own look applies |
| `logo` | The sidebar header shows the title text alone |
| `home` | No link back to a surrounding site is rendered |

`styles` names CSS files linked *after* canopy's own, outside its cascade layer, so a file naming
one custom property — `--accent`, say — keeps every other default, and a rule restyling a region
wins without a specificity contest. The file is read at build time and its rules travel as a
stylesheet of the build's own; the file itself is left out of the published site — it configures
the build, it is not a page of it. This site's own `brand.css` is the proof: its colours are on
every page, and the built output has no `brand.css`.

`brand.css` is three blocks rather than one line for a reason worth stating: a bare `:root`
outside canopy's cascade layer wins in *both* colour schemes, which is exactly why this file
repeats itself — a light accent for the default block, a lighter one for dark, so the colour that
reads well on a white sidebar is not the one forced onto a dark one. Dark is stated twice, the way
canopy states its own palette: for a system that prefers dark (unless the reader switched the page
to light with the theme toggle) and for a page switched to dark.

`logo` is separate from `icon`: `icon` is the favicon a browser tab shows, `logo` is the image
beside the title in the sidebar itself, and the two are free to differ. This site happens to use
the same file for both. It renders with an empty `alt`, deliberately: the site title right beside
it already names the site, so there is no separate text for a screen reader to add.

`home` takes both `url` and `label` or neither — never one alone, and a settings file with only one
is rejected rather than built with a guess at the other. There is no default label: link text has
to be written in the site's own language, and canopy has no way to know what that is.

## Where the site stands

`siteUrl` exists for nothing except what a relative-link site cannot say about itself: the
things that have to be absolute. `sitemap.xml` and the `robots.txt` that points at it need one
absolute address for the whole site, and so do the `<head>` tags a search engine reads as
addresses — `<link rel="canonical">`, `og:url`, `og:image`, and the `hreflang` links to other
language editions. Without `siteUrl` none of them is written; set it and all of them appear, with
every entry an absolute URL rather than a path relative to nothing. Every link *inside* a page
stays relative either way, so the same output still opens from a local folder. This site's own
`sitemap.xml` and every page's canonical are built from `https://iyulab.github.io/canopy-page`,
the address it is actually published at — and both name a page by the same string, because both
come from canopy's one rule for it (an index page is its directory).

Two more fields lean on it. `previewImage` names the image link previews show for any page whose
own frontmatter has no `image:`; `alternates` maps `hreflang` tags (or `x-default`) to the site
URLs of this site's other language editions, and every page then lists its counterpart under each
of them, in `<head>` and in the sitemap. Both are rejected without `siteUrl` — they only ever
turn into absolute URLs. Neither is set here: this site has one edition and no cover image.

Setting `siteUrl` also says the site is meant to be found, so `check` starts warning about pages
that have no `description:` of their own — every page of this site has one, which is why its
build log doesn't.

## Extending what a page can render

`rehypePlugins` names installed packages, not files:

```json
{ "rehypePlugins": ["rehype-declart"] }
```

Each one runs on every page, after canopy's own HTML sanitizing and before syntax highlighting —
a fixed position, so a plugin claiming a fenced code block by its language always sees it before
Shiki would otherwise render that fence as plain highlighted text. A site names the package it
depends on; the plugin itself is an ordinary dependency, installed the same way any other one is.
See [Diagrams](../guide/writing/diagrams.md) for what this looks like end to end.

A relative path (`./plugins/mine.js`) is refused here for the same reason a relative `styles` path
is resolved against the settings file rather than left to the shell that happened to start the
build: a plugin loaded by canopy's own process would otherwise resolve against whatever directory
the build was run from, not this file's directory, and get it right by accident or not at all.

## One settings file is one site

`sections` name ordered regions within a single site built in one pass — not separate builds.
That is what lets a link from the guide into the release notes resolve, and lets the release note
know it is linked from the guide. Two genuinely independent sites are two settings files.
