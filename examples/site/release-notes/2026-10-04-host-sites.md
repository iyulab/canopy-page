---
date: 2026-10-04
description: A blog in your own site's header, footer and colors — stream sections, regions and slots.
---
# A blog in your own site

canopy-page 0.22.0 can put a blog inside an existing site, wearing that site's design.

## Stream sections

`"profile": "stream"` on a section reads it as dated pages, newest first: one column, the
page's `description:` as a lead, its date and reading time, then its contents, open. The
section's index lists every post — and is written for you if the section has none. A stream
section has a feed by default once `siteUrl` is set.

## Your header, your footer

`regions` fills a section, or the whole site, with your own HTML. `header` and `footer` replace
canopy-page's with yours; `<canopy-slot name="search"></canopy-slot>` and its siblings put
canopy-page's controls where you want them, and `page:<key>` slots fill in a page's own words —
a call to action that says something different on every post.

See it on a made-up product: [Lumenfold Journal](../showcase/host-blog/index.md). How it is
built: [Hosting a blog in your own site](../guide/host-site.md).

## Upgraded to canopy 0.20.0

Stream profiles, regions and slots are canopy's; canopy-page names them in settings, checks
them before a build, and turns a stream's feed on.
