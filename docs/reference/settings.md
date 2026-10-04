---
description: "Every field of settings.json, the one file a canopy-page site is configured by, with the file that built this site as the example."
---
# The settings file

A site is configured by one file, `settings.json`, in the folder that holds its markdown. Every
field is an override, so `{}` is a valid settings file: a folder of markdown builds with its
navigation derived from the folder tree. Settings exist for what a tree cannot say by itself — the
order of a release log, a label that is not a directory name, a draft folder that stays
unpublished.

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
        { "path": "guide/localizing", "items": ["guide/한국어-예시/index"] },
        "guide/host-site",
        "guide/deploying"
      ]
    },
    { "path": "reference", "label": "Reference" },
    { "path": "release-notes", "order": "desc", "feed": true },
    {
      "path": "showcase/host-blog",
      "label": "Showcase: a blog in a host site",
      "profile": "stream",
      "regions": {
        "head": "showcase/host-blog/_host/head.html",
        "header": "showcase/host-blog/_host/header.html",
        "afterArticle": "showcase/host-blog/_host/cta.html",
        "footer": "showcase/host-blog/_host/footer.html"
      }
    }
  ]
}
```

Validation is strict: an unknown key is rejected rather than ignored, because a mistyped key that
is quietly dropped looks like a tool disobeying its configuration. Every message names the file
and the position it is about, down to `sections[0].items[1]`. Every path in the file is relative
to the file itself, written with forward slashes, and has to stay inside the site.

The settings file itself is never published, and neither is anything `exclude` names. A file named
`settings.json` deeper in the site is content, and ships.

## Top-level fields

| Field | Meaning |
|---|---|
| `$schema` | Optional. Points an editor (VS Code, JetBrains, any editor with JSON Schema support) at [`settings.schema.json`](../settings.schema.json), for completion and inline validation as you type. canopy-page itself reads and ignores it |
| `title` | Site name, shown in the top bar and the browser tab. Defaults to the site folder's own name |
| `description` | Fills `<meta name="description">` — what a link preview shows — for every page with no `description:` of its own |
| `lang` | A [BCP 47](https://www.rfc-editor.org/rfc/rfc5646) tag for `<html lang>` (`"en"`, `"ko-KR"`). Changes that one attribute and nothing else — see [Publishing a non-English site](../guide/localizing.md) |
| `strings` | The reader-facing text canopy-page writes around your content, in your language — see [Strings](#strings) |
| `icon` | Favicon, relative to the settings file. Must be a published file |
| `logo` | Image shown beside the site title, relative to the settings file. Must be a published file — see [Branding](#branding) |
| `styles` | One CSS file or a list, relative to the settings file, linked after everything canopy-page writes — see [Branding](#branding) |
| `home` | A link back to the site this documentation sits beside — see [`home`](#home) |
| `siteUrl` | Absolute `http(s)` URL the built site will stand at. Turns on everything that has to be absolute — see [Where the site stands](#where-the-site-stands) |
| `previewImage` | Image link previews show (`og:image`) for any page with no `image:` of its own, relative to the settings file. Must be a published file. Needs `siteUrl` |
| `alternates` | The site's other language editions: `{ "<hreflang>": "<that edition's siteUrl>" }`, `"x-default"` allowed. Needs `siteUrl` — see [Where the site stands](#where-the-site-stands) |
| `exclude` | Paths to leave unpublished — see [What `exclude` takes](#what-exclude-takes) |
| `rehypePlugins` | Installed npm package names of rehype plugins to run on every page — see [Extending what a page can render](#extending-what-a-page-can-render) |
| `profile` | `"manual"` (the default: a tree to browse) or `"stream"` (dated pages, newest first), for the whole site; each section can choose its own. See [Profiles](theming.md#profiles) |
| `regions` | HTML fragments that fill the parts of a page around the article — see [Regions](#regions) |
| `sections` | Ordered regions of the site — see [Sections](#sections) |
| `knownBroken` | Pages whose broken links and images are known and being fixed — see [`knownBroken`](#knownbroken) |

## Sections

`sections` name ordered regions within one site — a guide, a release log — rather than separate
builds:

| Field | Meaning |
|---|---|
| `path` | The directory this section covers, relative to the settings file |
| `label` | Heading shown for the section. Defaults to the name the section's own index page gives itself (its `title:`, else its opening heading), then the directory name — which `check` warns about |
| `order` | `"asc"` or `"desc"` for the pages inside. `"desc"` is what a release log wants — newest first |
| `items` | Explicit contents, in display order — see [Items](#items). Cannot be combined with `order`: a list *is* an order |
| `feed` | `true` publishes an Atom feed of the section's dated pages at `<path>/feed.xml` — see [Feeds](#feeds). Needs `siteUrl` |
| `profile` | `"manual"` or `"stream"` for this section; the site's `profile` applies where it is not set. A stream section takes neither `order` nor `items` |
| `regions` | Overrides the site's `regions` key by key; `""` turns one off in this section |

Note what this site's settings do **not** contain: a label for `guide` or for `release-notes`.
Those sections have index pages, and a page that opens with a heading has already said what it is
called. `Reference` is labelled because this section has no index page of its own to ask.

### Ordering

`release-notes` uses `"order": "desc"`, which is why the newest notes come first. Ordering derived
this way follows filenames, not headings — filenames are what you see in the folder you are
ordering, and a log of dated files is exactly the case it serves.

Whatever a section does not list — all of it, when the section has no `items` — is filled in from
the section's directory, the way any folder is: subfolders first, a folder's `index` page as its
heading link, ordered by file name, ascending unless `order` says `"desc"`. With no `sections` at
all, the whole navigation is derived from the folder tree this way.

A stream section takes neither `order` nor `items`: it is ordered newest first by each page's
`date:`, with undated pages last — and `check` names them.

### Items

`guide` uses `items` instead, which is a list and therefore already an order. An entry in `items`
is a page path (`"guide/install"`), or a group:

| Field | Meaning |
|---|---|
| `path` | A page — the group's own heading links it. Written out in full, so an index page is `"guide/writing/index"`; a group's `path` names a page, not a directory |
| `label` | The group's heading. Required when the group has no `path`; otherwise it overrides the name that page gives itself |
| `items` | The pages (or further groups) beneath it, in display order |

```json
{ "label": "Orders", "items": ["guide/orders/list", "guide/orders/detail"] }
```

Paths may be written with or without their `.md` extension. Two glob shapes are understood:
`dir/*` is the pages directly in a directory, `dir/**` is every page beneath it. A glob means the
pages there **that are not placed already**, which is what makes `["guide/install", "guide/*"]`
read the way it looks — this page first, then the rest.

A section's heading already links its own index page, so naming that page in `items` asks for
what is there rather than for a second copy, and is not counted as placing it twice. A page
placed twice otherwise, or a path that matches no page, is an error. A page no section reaches is
placed anyway and reported — see [What check reports](check.md#pages-no-section-covers).

### Feeds

`release-notes` also sets `"feed": true`, so this site publishes `release-notes/feed.xml` — an
Atom feed a reader can subscribe to — and every page in that section links it
(`<link rel="alternate" type="application/atom+xml">`) for browsers and feed readers to find.

An entry is a page beneath the section whose frontmatter names a `date:` (see
[Dated pages](../guide/writing/index.md#dated-pages)), newest first: its name, its `date:` and
`updated:`, its own `description:` as the summary, and its `author:` if it has one. The section's
index page describes the series rather than being an entry, so it is left out. A feed's links are
absolute, which is why `feed` needs `siteUrl`; a section with no dated page publishes no feed. A
feed is independent of `order`.

A `stream` section has a feed by default once `siteUrl` is set; `"feed": false` turns it off.

`check` warns about a page in a feed section that has no `date:` — it is silently missing from the
feed otherwise — and about any `date:` or `updated:` that is not a date.

### What `exclude` takes

A directory (`"_drafts"` or `"_drafts/**"`), an extension at any depth (`"*.tmp"`), or one exact
path (`"notes/scratch.md"`). A shape outside that list — `"images/*.md"` — is refused rather than
left to match nothing quietly. A pattern that is valid but matched nothing is a warning, except an
extension pattern: `*.tmp` in a site with no scratch files is a rule about what may never ship
rather than a claim that something is there.

This site excludes `_drafts`, and the page inside it is not in the sidebar, not in the output, and
not reachable. Its broken link is not reported either: an excluded page is not part of the site.

## Strings

`lang` changes only what `<html lang>` declares. Every word canopy-page writes around your content
is its own interface text, not your content, so it stays English until `strings` says otherwise:

```json
{ "lang": "ko-KR", "strings": { "search": "검색", "toggleTheme": "테마 전환" } }
```

Every key is optional, and keeps its English default when left out:

| Key | English default | Where it appears |
|---|---|---|
| `search` | `Search` | The search box's placeholder and accessible label |
| `toggleTheme` | `Toggle color theme` | The dark/light toggle's accessible label |
| `siteNav` | `Site navigation` | The sidebar's accessible label |
| `pageNav` | `Page navigation` | The prev/next cards' accessible label |
| `onThisPage` | `On this page` | The on-page outline's heading and accessible label |
| `indexTitle` | `Contents` | Title and heading of the contents page written at the site root when it has no `index` page |
| `backlinks` | `Linked references` | The heading above a page's backlinks |
| `breadcrumb` | `Breadcrumb` | The top bar's trail's accessible label |
| `searchFailed` | `Search failed to load.` | Shown in the results list when the search index fails to load |
| `readingTime` | `{n} min read` | A stream page's reading time under its heading. `{n}`, where the minutes go, is required |
| `language` | `Languages` | The language links' accessible label |

There is no built-in translation table — canopy-page has no way to guess what your language calls
"Search". [Publishing a non-English site](../guide/localizing.md) has a complete set for Korean.

## Branding

| Field | Not set |
|---|---|
| `styles` | Only canopy-page's own look applies |
| `logo` | The sidebar header shows the title text alone |
| `home` | No link back to a surrounding site is rendered |

`styles` names CSS files linked *after* canopy-page's own, outside its cascade layers, so a file
naming one custom property — `--accent`, say — keeps every other default, and a rule restyling a
part of the page wins without a specificity contest. Like `icon` and `logo`, each file is
published where it stands and every page links it there, so a relative `url()` inside it — a font
beside it, say — resolves exactly as written. A missing or excluded one is a `check` error. This
site's own `brand.css` is one: open the built output and it is at the site's root, linked from
every page. [Theming](theming.md) is the full contract: the tokens, dark mode, and the class
names that are safe to select on.

`logo` is separate from `icon`: `icon` is the favicon a browser tab shows, `logo` is the image
beside the title in the sidebar itself, and the two are free to differ. This site happens to use
the same file for both. It renders with an empty `alt`, deliberately: the site title right beside
it already names the site, so there is no separate text for a screen reader to add.

### `home`

A link back to the site this documentation sits beside, in the top bar:

```json
{ "home": { "url": "https://example.com", "label": "Back to Example" } }
```

| Field | Meaning |
|---|---|
| `url` | An absolute URL when the target is another site. A relative path (`"../"`) when it is a sibling of the published site — each page resolves it against its own depth, like any other internal link |
| `label` | The link text. No default: link text has to be written in the site's own language, and canopy-page has no way to know what that is |

Both or neither: a settings file with only one is rejected rather than built with a guess at the
other. A `url` that leaves the site gets an icon after its label, so a reader knows before
clicking — see [What a reader gets](../guide/reading.md#knowing-when-a-link-leaves-the-site).

## Regions

`regions` fills the parts of a page around the article — `head`, `header`, `beforeArticle`,
`afterArticle`, `footer` — with HTML fragments from the site, on the site as a whole or per
section, where a key overrides the site's and `""` turns it off:

```json
{ "regions": { "header": "partials/header.html", "footer": "partials/footer.html" } }
```

A fragment is a file in the site, read by the build and not published itself. Where each region
goes, how links in a fragment are written, and the `<canopy-slot>` elements that place
canopy-page's own controls inside one are in [Theming](theming.md#regions).
[Hosting a blog in your own site](../guide/host-site.md) walks through one end to end.

## Where the site stands

`siteUrl` exists for nothing except what a relative-link site cannot say about itself: the
things that have to be absolute. Every link canopy writes *into* a page is relative, which is what
lets the same output be served from any sub-path and opened from a local folder — and exactly why
some things need an absolute address given separately. Without `siteUrl` none of them is written;
with it:

- `build` writes `sitemap.xml` and a `robots.txt` pointing at it;
- every page's `<head>` gains `<link rel="canonical">`, `og:url`, `og:image` (`previewImage`, or
  the page's own `image:`) and the `hreflang` links `alternates` names;
- a `feed` section can publish its feed, and a `stream` section does by default;
- `check` starts warning about pages with no `description:` of their own, since setting it says
  the site is meant to be found — every page of this site has one, which is why its build log
  doesn't;
- a path in it says where root-absolute links point — see [Root-absolute
  references](check.md#root-absolute-references).

A directory's index page is addressed as the directory (`guide/index.html` → `…/guide/`), in the
sitemap and in the page's own canonical alike, so both name a page by the same string. This
site's own are built from `https://iyulab.github.io/canopy-page`, the address it is actually
published at.

Each sitemap entry carries `<lastmod>` when one can be trusted: the page's frontmatter `updated:`
if it names one, otherwise its source file's last git commit date. A page with no source file, an
untracked one, or any page at all on a shallow clone is written without it — no `<lastmod>` beats
a guessed one.

Two more fields lean on it. `previewImage` names the image link previews show for any page whose
frontmatter has no `image:` (a page's `image:` is a site path, or an absolute URL used as given).
`alternates` maps `hreflang` tags (or `x-default`) to the site URLs of this site's other language
editions, and every page then lists its counterpart at the same path under each of them, its own
first — in `<head>` and as `xhtml:link` entries in the sitemap. That is a declaration the build
cannot verify, since it sees one edition at a time: the editions keep it true by mirroring each
other's structure. Both fields are rejected without `siteUrl`. Neither is set here: this site has
one edition and no cover image.

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

A relative path (`./plugins/mine.js`) is refused, for the same reason every other path here is
resolved against the settings file rather than left to the shell that happened to start the
build: a plugin loaded by canopy's own process would otherwise resolve against whatever directory
the build was run from, and get it right by accident or not at all.

## `knownBroken`

A site moving to canopy-page often arrives already publishing broken links and missing images.
`knownBroken` names the pages being fixed, so the rest of the site can ship meanwhile:

```json
{ "knownBroken": [{ "path": "help/statistics/kpi/**", "reason": "Screenshots being retaken" }] }
```

| Field | Meaning |
|---|---|
| `path` | One page, `"dir/*"` for the pages directly in a directory, or `"dir/**"` for every page beneath it |
| `reason` | Required: why these pages are let through. Printed with every warning the entry produces |

What it changes, and how the list is kept shrinking, is in [Exit
codes](exit-codes.md#a-site-that-is-already-broken).

## One settings file is one site

`sections` name ordered regions within a single site built in one pass — not separate builds.
That is what lets a link from the guide into the release notes resolve, and lets the release note
know it is linked from the guide. Two genuinely independent sites are two settings files.

An editor-readable description of the whole file is published at
[`settings.schema.json`](../settings.schema.json); point `$schema` at its address,
`https://iyulab.github.io/canopy-page/settings.schema.json`.
