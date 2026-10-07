---
description: One-scheme sites, dates from file names, tables on phones, a skip link, and no more silently overwritten files.
---
# One scheme, dated file names, and nothing overwritten

canopy-page 0.23.0 comes from what sites built on 0.22 ran into.

## A site with one colour scheme

`"colorScheme": "dark"` (or `"light"`) says the site has only one. Every page is drawn in it,
whatever the reader's system prefers, and there is no theme toggle — so a dark product site no
longer has to restate canopy's dark rules in its own stylesheet. See
[Dark mode](../reference/theming.md#dark-mode).

## A file named by its day is dated

This note has no `date:` line: its file is called `2026-10-07-one-scheme.md`, and that is its
date — in the list of notes, in the feed, under its title. When a page states `date:` as well,
`date:` wins, and `check` warns if the two name different days. See
[Dated pages](../guide/writing/index.md#dated-pages).

## Files the build writes are yours no longer to overwrite

The build writes some files of its own beside your site's: canopy's `tokens.css` and
`styles.css`, a page's `.html`, the search index, each feed, the sitemap. A site file at one of
those paths used to replace the build's file, or be replaced by it, without a word — a `styles`
file named `tokens.css` dropped canopy's design tokens. `check` now refuses it and says what the
build puts there. A site's own `robots.txt` is the exception: it is published as written.

## Smaller things

- A table wider than the screen scrolls within itself instead of pushing the page sideways.
- Every page opens with a "Skip to content" link for keyboard readers
  (`strings.skipToContent`).
- `check` warns when `home` or `logo` is set but no page shows it.
- An `exclude` entry naming a dot-file is no longer reported as matching nothing.

## Upgraded to canopy 0.21.0

All of the above that happens in a page is canopy's; canopy-page names it in settings and checks
it before a build.
