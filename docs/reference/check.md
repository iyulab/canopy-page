---
description: "Every error and warning canopy-page's check reports, what each one means, and what to do about it."
---
# What check reports

`check` — and `build`, which runs the same checks first — reads the settings file and every
page, and reports what a reader would otherwise meet as a 404, a missing image, or a page in the
wrong place. It never renders, so it is fast enough to run at the front of a pipeline even at
the scale a large product manual reaches.

Each finding is one line beginning `error:` or `warning:`, naming the file — and the line, for
something on a page — it is about. Findings that list pages put one page per line beneath them.

- An **error** stops `build`: nothing is written, and both commands leave with `1`.
- A **warning** is reported and the build continues. It depends on context the checker cannot
  always see, or it is a nudge rather than a defect.

When nothing is broken, `check` ends with a summary that counts the warnings:

```
canopy-page: 32 page(s) checked, nothing broken, 2 warning(s)
```

## Errors

### A link points at nothing published

```
error: guide/install.md:12: link "../reference/exit-code.md" points at nothing published
```

The target is reported as written, and resolved against the page holding it. "Published" means
a page or file of this site that is not excluded — a link into an excluded draft is as broken to
a reader as one to nothing. A target ending in `/` names a directory, and is answered by that
directory's `index` page. Fix the path, or publish what it points at.

### A link stops at a space

```
error: guide/install.md:14: link destination stops at a space, so it addresses "../a" and the rest of the line is left as text. Wrap the path in <> or write the space as %20
```

An unbracketed destination ends at the first space: `[x](../a b/c.md)` links `../a` and leaves
the rest as text. The message names that, rather than the truncated path nobody wrote. Write
`[x](<../a b/c.md>)` or `[x](../a%20b/c.md)` — both reach the same page.

### An image is not a published file

```
error: index.md:4: image "assets/diagram.png" is not a published file
```

Covers both cases that end the same way for a reader: the file does not exist, or it is
excluded. A path that climbs above the site root is not checked at all — see [What is never
reported](#what-is-never-reported).

### A link or image reaches its file only by ignoring letter case

```
error: index.md:3: link "Guide/Install.md" reaches "guide/install.md" only by ignoring letter case — the built page keeps "Guide/Install.md" as written, which leads nowhere on a host that tells letter case apart
```

On your own machine the link works: Windows and macOS find `guide/install.md` from `Guide/Install.md`.
The built link keeps the spelling you wrote, though, and GitHub Pages — like most hosts — serves
nothing at `Guide/Install.html`. Write the path as the file is spelled. A wikilink is not affected:
it is written from the page it finds. The same applies to a link in a region fragment.

### A wikilink matches no page

```
error: guide/writing/index.md:31: [[instal]] matches no page, and will render as plain text
```

Reported on its own because an unresolved wikilink renders as plain text rather than as a broken
link — nothing on the published page looks wrong, so without the message nobody knows to look.

### A settings reference matches no page, or places one twice

```
error: settings: "guide/instal" matches no page
error: settings: "guide/install" is placed more than once
```

Mistakes in the settings file rather than in a page, so they name the reference as written in
`sections`. A section's own index page named again in its `items` is not counted twice — the
section heading already links it.

### A stylesheet is not published

```
error: settings: styles "brand.css" is not a published file (missing, or excluded). Paths are relative to the settings file
```

A `styles` file is linked where the site publishes it, so a missing or excluded one would be a
link to nothing.

### A file sits where the build writes a file of its own

```
error: tokens.css: the build writes canopy's design tokens at this path, so the site cannot publish a file there — rename or move it
error: notes/a.html: the build writes the page rendered from notes/a.md at this path, so the site cannot publish a file there — rename or move it
```

The build writes some files of its own into the same folder as your site's files: canopy's
`tokens.css` and `styles.css`, the stylesheet and fonts math is drawn with (`assets/katex.css`,
`assets/fonts/KaTeX_*`), canopy-page's own stylesheet and script (`assets/stylesheet-1.css`,
`assets/script.js`), `search-index.json`, each page's `.html`, a stream section's index page when
the section has no `index.md`, each section's `feed.xml`, and — with `siteUrl` — `sitemap.xml`.
A site file at one of those paths would replace the build's file or be replaced by it, so it is
refused, naming what the build puts there. A [`styles`](settings.md#branding) file is the
common case: name it anything but `tokens.css` or `styles.css`. A site's own `robots.txt` is
not refused — it is published as written, and the build then writes none.

### A region fragment is missing

```
error: settings: region fragment "partials/header.html" is not a file in the site (header)
```

Names the regions that wanted it. Fragment paths are relative to the settings file, like every
other path in it.

### A slot the build would refuse

```
error: partials/header.html (header): <canopy-slot name="search"> must be empty — write it as <canopy-slot name="search"></canopy-slot>; HTML does not close a self-closing custom tag, so it takes in what follows
error: partials/header.html (header): unknown slot "serach" — slots are site-title, home, back, breadcrumb, language, search, theme-toggle, skip-link, or page:<frontmatter key>
```

Named by fragment and region. Also reported: a slot with no name, a `page:` slot with no key, a
slot inside another slot, and a slot in the `head` region. [Slots](theming.md#slots) lists what
each one is.

### A fragment link points at nothing published

```
error: partials/footer.html: link "blog/archive/" points at nothing published (fragment links are written from the site root)
```

A link in a fragment is written from the site root, and checked that way on the page it is
rewritten for.

### A page cannot fill a page slot

```
error: blog/2026-10-03-launch.md: frontmatter "cta" must be text to fill <canopy-slot name="page:cta">, not a number
```

A `page:<key>` slot takes text. A list, a number or a date in that key is refused rather than
shown in whatever shape it happens to print as. Quote it in the frontmatter.

### A root-absolute link inside the site's own path

```
error: blog/2026-10-03-launch.md:9: link "/blog/archive.html" points at nothing published — under settings.siteUrl's path "/blog/" it addresses "archive.html"
```

When `siteUrl` places the site under a path, a root-absolute link inside that path is one of
this site's own pages written absolute — see [Root-absolute references](#root-absolute-references).

## Warnings

### Pages no section covers

```
warning: 2 page(s) no section covers, placed at the end of their section:
  guide/faq.md
  guide/glossary.md
```

Once a settings file has `sections`, every page has to be reached by one: listed in an `items`,
or inside the folder of a section that lists nothing. A page that is neither is placed anyway —
at the end of the section whose folder holds it, else after every section — and named here. A
page that exists but cannot be reached would be worse than one shown in an order nobody chose;
this says the settings file is behind the folder, so you can say which you meant. The site's
root `index` page is the home page, and never needs placing.

### A section is named after its folder

```
warning: settings: section "reference" has no "label" and no index page, so its sidebar heading falls back to the directory name "reference". Add a "label", or an index page for the section to name itself
```

### An exclude pattern matched nothing

```
warning: settings: exclude "_archive" matched nothing, so everything it names is published. Patterns are relative to the settings file
```

Usually a path written from the wrong place. Extension patterns (`*.tmp`) are never reported: a
rule about what may never ship is not a claim that something is there now. Nor are patterns
naming a dot-file, a dot-folder or something under `node_modules`, which are never published.

### A setting with no slot to show it

```
warning: settings: logo is set, but the logo shows on no page — every page has a header region ("partials/header.html") and no fragment of it places <canopy-slot name="site-title">
```

A [`header` region](settings.md#regions) replaces canopy-page's top bar, and `home` and `logo`
then show only where a fragment places the `home` or `site-title` [slot](theming.md#slots). When
that leaves a setting shown on no page at all, place the slot or remove the setting. A setting
some pages show — the docs in canopy-page's top bar, beside a blog section in a site's own
header — is not reported: leaving it out of that header was the header's choice.

### A published URL needs percent-encoding

```
warning: release notes/index.md: published URL is "release%20notes/index.html" (rename to avoid the encoding, or ignore if intentional)
```

A space or another ASCII character outside a URL's unreserved set ended up in a file or folder
name. The page still publishes and works — static hosts serve the encoded URL — so this is a
nudge to confirm the encoding was meant. Non-ASCII names are never reported: a Korean, Japanese
or any other non-English name needs the same encoding and is not a slip.

### A root-absolute reference resolves against nothing

```
warning: index.md:4: image "/assets/logo.png" — nothing is published at "assets/logo.png". A root-absolute path resolves against wherever the site is served from, so this is right only if something else answers it there
```

See [Root-absolute references](#root-absolute-references).

### A root-absolute link leaves the site's own path

```
warning: blog/2026-10-03-launch.md:9: link "/pricing" leaves this site — it is outside settings.siteUrl's path "/blog/" — though this site publishes "pricing"; if that page is meant, write "/blog/pricing" or a relative link
```

Only when `siteUrl` places the site under a path. A root-absolute link outside that path is the
host's, and normally not reported — but this site publishes a page at that same path from its own
root, so the link reads like one to this site written without its path. If the host's page is
meant, leave it; otherwise write the path under the site's own, or a relative link. See
[Root-absolute references](#root-absolute-references).

### Pages excused by knownBroken

```
warning: settings.knownBroken "help/statistics/kpi/**" (Screenshots being retaken): 3 broken reference(s) published anyway:
  help/statistics/kpi/index.md:12: image "kpi.png" is not a published file
warning: settings.knownBroken "help/old/**" matches no page — remove the entry
warning: settings.knownBroken "help/setup.md": nothing there is broken any more — remove the entry
```

The first form lists what a [`knownBroken`](settings.md#knownbroken) entry excuses, under its
reason; the other two ask for an entry to be removed. How the list works is in [Exit
codes](exit-codes.md#a-site-that-is-already-broken).

### Pages with no description

```
warning: 2 page(s) have no "description:" in their frontmatter, so search results and link previews show the site's description for each of them:
  guide/faq.md
  guide/glossary.md
```

Only once `siteUrl` is set — that is what says the site is meant to be found. Such a page falls
back to the site's `description`, which is fine for a site nobody searches and a duplicate summary
on every result for one that is public. A site published somewhere but not meant to be found that
way can ignore it.

### Dates that are not dates, disagree, or are missing where one is needed

```
warning: 1 frontmatter date(s) are not dates (expected YYYY-MM-DD, optionally with a time), so canopy reads those pages as if the line were not there:
  release-notes/2026-02-30.md (date: 2026-02-30)
warning: 1 page(s) say a different day in "date:" than their file name does; "date:" wins, so each page's URL and its date disagree:
  blog/2026-10-03-launch.md (date: 2026-10-05)
warning: 1 page(s) in a feed section have no "date:" (nor a day in their file name), so the feed leaves them out:
  release-notes/draft.md
warning: 1 page(s) in a stream section have no "date:" (nor a day in their file name), so the stream lists them last, after every dated page:
  blog/about.md
```

A `date:` or `updated:` that is not a real day is ignored, as if the line were not there. A page
whose file name begins with a day (`2026-10-03-launch.md`) is dated by it without a `date:` line;
with one, `date:` wins, and a different day there is reported, since the page's URL then says one
day and the page another. A page with neither in a `feed` section is silently missing from the
feed, and one in a `stream` section is listed after every dated page. A section's own index page
is exempt from both.

## Root-absolute references

A link or image that starts with `/` — `/assets/logo.png`, `/pricing` — is left exactly as
written in the built page. Where it lands depends on where the site is served from, which only
`siteUrl` can say:

- **No `siteUrl`, or one at a domain root** (`https://help.example.com`). The path is checked
  against the site's own root. When nothing is published there, it is a warning: something else
  on that host may answer it, which the checker cannot see. If nothing does, it is a 404 — and
  there is no `public/`-style folder mapped onto the root here, as some other generators have:
  `/assets/logo.png` is answered only by an `assets/logo.png` in the site itself.
- **`siteUrl` with a path** (`https://example.com/blog`), the site standing inside a larger one. A
  path inside it (`/blog/archive.html`) is this site's own page written absolute, checked like any
  other link, and an error when nothing is there. A path outside it (`/pricing`) is the host's, and
  not reported — unless this site publishes that same path at its own root (`pricing.md`), which
  reads like a link to this site written without its path, and warns.

A relative link works wherever the site is served from, which is why every link canopy writes is
relative. Prefer one in your own pages, unless the target really is the host's.

## What is never reported

- References inside inline code or a fenced code block — an example of a broken link is
  documentation, not a broken link.
- Absolute URLs (`https://…`), protocol-relative ones (`//host/…`) and bare fragments
  (`#section`).
- Paths that climb above the site root, which address something outside the site.
- Anything on an excluded page: it is not part of the site, which is what makes a drafts folder
  usable for drafts.
- Whether a `#fragment` matches a heading on the target page — only the page is checked.

## Outside the findings

A missing or invalid settings file is not a finding: nothing can be checked without it, so the
command stops before reading any page — see [When the site cannot be read](commands.md#when-the-site-cannot-be-read).

`build` also writes two files `check` never sees: with `siteUrl` set, `sitemap.xml` and a
`robots.txt` pointing at it (unless the site publishes its own `robots.txt`). Neither is
checked, because neither exists until the build has succeeded.
