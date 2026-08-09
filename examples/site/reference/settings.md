# The settings file

Every field is an override, so `{}` is a valid settings file: a folder of markdown builds with
its navigation derived from the folder tree. Settings exist for what a tree cannot say by itself.

This is the file that produced the site you are reading:

```json
{
  "title": "canopy-page",
  "description": "Documentation for canopy-page: one settings file, integrity checks, and a build — built with canopy-page itself, published on every push.",
  "lang": "en",
  "icon": "assets/logo.svg",
  "logo": "assets/logo.svg",
  "tokens": "brand.css",
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
        "guide/reading"
      ]
    },
    { "path": "reference", "label": "Reference" },
    { "path": "release-notes", "order": "desc" }
  ]
}
```

## Top-level fields

| Field | Meaning |
|---|---|
| `title` | Site name. Defaults to the folder's name |
| `description` | Fills `<meta name="description">`, which is what a link preview shows |
| `lang` | BCP 47 tag for `<html lang>`. Assistive technology reads pronunciation from it |
| `icon` | Favicon, relative to the settings file. Must be a published file |
| `tokens` | CSS of design-token overrides, relative to the settings file |
| `logo` | Image shown beside the site title in the sidebar header, relative to the settings file. Must be a published file |
| `home` | A link back to the site this documentation sits beside: `{ url, label }` |
| `siteUrl` | Where the built site will stand, as an absolute URL |
| `exclude` | Paths to leave unpublished |
| `sections` | Ordered regions of the site |
| `rehypePlugins` | Package names of rehype plugins to run on every page, such as a diagram renderer |

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

Note what the demo's settings do **not** contain: a label for `guide` or for `release-notes`.
Those sections have index pages, and a page that opens with a heading has already said what it is
called. `Reference` is labelled because this section has no index page of its own to ask.

### Ordering

`release-notes` uses `"order": "desc"`, which is why August 8 comes before August 7. Ordering
derived this way follows filenames, not headings — filenames are what you see in the folder you
are ordering, and a log of dated files is exactly the case it serves.

`guide` uses `items` instead, which is a list and therefore already an order — the two cannot be
combined. Its second entry is a group carrying its own page: `guide/writing/index` is the page the
group's heading links, and `guide/writing/code-and-math` sits under it. A group's `path` names a
page, not a directory, so an index page is written out.

Globs are the other way to fill a section: `dir/*` is the pages directly in a directory, `dir/**`
is every page beneath it. A glob means the pages there **that are not placed already**, which is
what makes `["guide/install", "guide/*"]` read the way it looks — this page first, then the rest.

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
| `tokens` | Only canopy's own colours and spacing apply |
| `logo` | The sidebar header shows the title text alone |
| `home` | No link back to a surrounding site is rendered |

`tokens` names a CSS file appended *after* canopy's own tokens, so a file naming one custom
property — `--accent`, say — keeps every other default rather than replacing the whole sheet. It
is read at build time and left out of the published site: it configures the build, it is not a
page of it. This site's own `brand.css` is the proof — open the built output and it is not there.

`brand.css` is two blocks rather than one line for a reason worth stating: canopy's own defaults
end with a `prefers-color-scheme: dark` block, and a media query adds no specificity over a bare
selector. A bare `:root` appended after that block wins in *both* schemes, which is exactly why
this file repeats itself — a light accent for the default block, a lighter one for dark, so the
colour that reads well on a white sidebar is not the one forced onto a dark one.

`logo` is separate from `icon`: `icon` is the favicon a browser tab shows, `logo` is the image
beside the title in the sidebar itself, and the two are free to differ. This site happens to use
the same file for both. It renders with an empty `alt`, deliberately: the site title right beside
it already names the site, so there is no separate text for a screen reader to add.

`home` takes both `url` and `label` or neither — never one alone, and a settings file with only one
is rejected rather than built with a guess at the other. There is no default label: link text has
to be written in the site's own language, and canopy has no way to know what that is.

## Where the site stands

`siteUrl` exists for nothing except what a relative-link site cannot say about itself: `sitemap.xml`
and the `robots.txt` that points at it both need one absolute address for the whole site, and
without `siteUrl` neither is written. Set it and both files appear, with every entry an absolute
URL rather than a path relative to nothing — this site's own `sitemap.xml` is built from
`https://iyulab.github.io/canopy-page`, the address it is actually published at.

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

A relative path (`./plugins/mine.js`) is refused here for the same reason a relative `tokens` path
is resolved against the settings file rather than left to the shell that happened to start the
build: a plugin loaded by canopy's own process would otherwise resolve against whatever directory
the build was run from, not this file's directory, and get it right by accident or not at all.

## One settings file is one site

`sections` name ordered regions within a single site built in one pass — not separate builds.
That is what lets a link from the guide into the release notes resolve, and lets the release note
know it is linked from the guide. Two genuinely independent sites are two settings files.
