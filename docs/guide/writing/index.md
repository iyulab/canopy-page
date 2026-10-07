---
description: "How a page gets its name, how pages link to each other, dated pages, raw HTML, what the checker refuses, and where backlinks come from."
---
# Writing pages

Ordinary markdown. What follows is only the part where a site of many documents differs from a
single one.

## A page is named by its own heading

The name a page is shown under is resolved in this order:

```
frontmatter title  →  the heading the page opens with  →  the filename
```

That one name reaches the sidebar entry, the browser tab, and the text of every backlink pointing
at the page. This document is filed as `writing/index.md` and is called "Writing pages"
everywhere, because that is what its first line says.

The order matters most where filenames are identifiers and documents are prose — a folder of
`ORD_LIST.md` and `ORD_DETAIL.md` produces a readable sidebar without anyone writing a label for
each one. Where a filename genuinely reads better, add a `title:` line and it wins.

## Linking to another page

Both spellings work and both are checked:

```markdown
[Installing canopy-page](../install.md)
[[install]]
```

A markdown link — inline, or the reference-style `[text][id]` form — is a path relative to the
document. A wikilink is a name resolved across the whole site, with no directory needed as long as
the name is unambiguous; `[[page#heading]]` reaches a section of it. Either way the published link
points at the built page — you write `.md`, readers get `.html` — and either way, a link to
something that does not exist stops the build. That matters most for a wikilink: one that matches
nothing renders as plain text, so nothing on the published page would look broken.

A link ending in `/` names a directory, and reaches that directory's `index` page. Absolute URLs,
root-absolute paths (`/help/x.png`) and bare fragments (`#section`) are left exactly as written —
prefer a path relative to the page, which works wherever the site is served from (see
[Deploying the output](../deploying.md#serving-from-a-sub-path)).

A link into a section of another page keeps its anchor: [the exit code table](../../reference/exit-codes.md#the-codes).

A heading's anchor is derived from its own wording by default, so it moves if the wording later
does. Give it a stable one instead with a trailing `{#id}`:

```markdown
## Upgrading from an older version {#upgrading}
```

— useful for a heading you expect to reword but still want other pages (or a bookmark) to keep
pointing at. See [## What the checker refuses](#what-check-refuses) below, and its heading's own
source in this page: it carries a marker of exactly this kind.

A path containing a space works whichever way an editor writes it. These two links address the
same document:

```markdown
[angle brackets](<../release notes/index.md>)
[percent-encoded](../release%20notes/index.md)
```

Editors pick the second form on their own when you insert a link, without anyone typing an
escape. Written bare — `[x](../release notes/index.md)` — the destination stops at the space, and
`check` says so rather than reporting the truncated path. A name like that still publishes, under
an encoded URL; `check` warns about it in case the space was a slip, which is why this site has
none.

## Backlinks come free

Nothing on this page declares who links to it. The list at the foot is built by inverting every
link in the site, so a page always knows what refers to it — which is the thing that rots first
when a sidebar is maintained by hand.

## Dated pages

A page that says when it was published shows that date under its heading, spelled in the site's
language:

```markdown
---
date: 2026-10-03          # a day, or an ISO 8601 date-time
updated: 2026-10-05       # optional: when it last changed in substance
author: Jane Doe          # optional: a person's name
---
```

The date is shown as the day the author wrote, never shifted by a time zone. A dated page also
tells search engines it is an article — its publication and modification times, and a schema.org
`Article` record naming its author — and can be followed in a feed when its section asks for one
(`"feed": true`, see [Settings](../../reference/settings.md#feeds)). `updated:` also dates the
page's sitemap entry. Every page in [Release notes](../../release-notes/index.md) is dated this
way. A page without `date:` stays a plain document page, exactly as before; a value that is not a
real day (`2026-02-30`, `28/09/2026`) is not a date, and `check` says so.

A file named by its day — `2026-10-03-launch.md`, or just `2026-10-03.md` — is dated that day
without a `date:` line, the way most blog tools read such names. Write `date:` too only to add a
time; when both are there `date:` wins, and `check` warns if they name different days, since the
page's address would then say one day and the page another.

## Index pages that list their pages

A folder's index page can list the pages beneath it with `listing: true` in its frontmatter —
each entry's name, date and own `description:`, in sidebar order, after the page's own text. On
the site's front page it lists the rest of the top level. The Release notes index is built that
way: nobody maintains its list, and nothing it says about an entry can drift from what the entry
says about itself.

## Raw HTML

HTML in a page is sanitized: safe authoring tags survive, and `<script>` tags and other ways of
injecting behavior are stripped. Nothing a page's own content holds runs in a reader's browser —
the scripted parts of a site ([What a reader gets](../reading.md)) are canopy-page's own, added
around the content rather than inside it.

## What the checker refuses {#what-check-refuses}

A link or wikilink pointing at nothing published, an image that is not a published file, a link
that stops at a space: each stops the build, naming the page and the line. [What check
reports](../../reference/check.md) lists every error and warning, and what to do about each.

References inside code — a fence, or an inline span — are left alone. An example of a broken link
is documentation, not a broken link:

```markdown
[this is never checked](nowhere.md)
```

Next: [Code and math](code-and-math.md).
