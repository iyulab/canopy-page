# The settings file

Every field is an override, so `{}` is a valid settings file: a folder of markdown builds with
its navigation derived from the folder tree. Settings exist for what a tree cannot say by itself.

This is the file that produced the site you are reading:

```json
{
  "title": "canopy-page demo",
  "description": "A documentation site built from this folder by canopy-page, published on every push.",
  "lang": "en",
  "icon": "assets/logo.svg",
  "exclude": ["_drafts"],
  "sections": [
    {
      "path": "guide",
      "items": [
        "guide/install",
        { "path": "guide/writing/index", "items": ["guide/writing/code-and-math"] }
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
| `exclude` | Paths to leave unpublished |
| `sections` | Ordered regions of the site |

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

`release-notes` uses `"order": "desc"`, which is why 2026-08 comes before 2026-04. Ordering
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

## One settings file is one site

`sections` name ordered regions within a single site built in one pass — not separate builds.
That is what lets a link from the guide into the release notes resolve, and lets the release note
know it is linked from the guide. Two genuinely independent sites are two settings files.
