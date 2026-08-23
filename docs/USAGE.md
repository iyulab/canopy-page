# canopy-page usage

The complete reference for using `@iyulab/canopy-page`: every command, every `settings.json`
field, every markdown feature, and every reader-facing behavior the published site ships with.
Nothing here depends on anything else in the repository — [`README.md`](../README.md) is the
short pitch, this is the whole thing.

canopy-page owns the authoring pipeline: the settings a site is configured by, the checks that
keep broken references from shipping, and the build that ties them together. The rendering
itself — HTML, the site shell, navigation, backlinks, search — is
[canopy](https://github.com/iyulab/canopy)'s job, driven through its command line. Where a
feature is described below, it is canopy-page's own unless the text says otherwise.

**Live reference build**: <https://iyulab.github.io/canopy-page> — built with canopy-page
itself, from [`examples/site`](../examples/site) in this repository.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [`settings.json`](#settingsjson)
  - [Top-level fields](#top-level-fields)
  - [`sections`](#sections)
  - [`strings` and `lang`](#strings-and-lang-non-english-sites)
  - [`tokens` and branding](#tokens-and-branding)
  - [`rehypePlugins`](#rehypeplugins-extending-what-a-page-can-render)
- [Writing pages](#writing-pages)
  - [How a page gets its name](#how-a-page-gets-its-name)
  - [Linking](#linking)
  - [Backlinks](#backlinks)
  - [Syntax highlighting](#syntax-highlighting)
  - [Math](#math)
  - [Callouts](#callouts)
  - [Contents list](#contents-list)
  - [Diagrams](#diagrams-via-rehypeplugins)
  - [Raw HTML](#raw-html)
- [What ships in every site](#what-ships-in-every-site)
- [Theming](#theming)
- [What `check` reports](#what-check-reports)
- [Exit codes and CI](#exit-codes-and-ci)
- [Deploying the output](#deploying-the-output)
- [What belongs where](#what-belongs-where-canopy-page-vs-canopy)
- [Gotchas](#gotchas)

## Install

```sh
npm install --save-dev @iyulab/canopy-page
```

Node 22 or newer.

## Quick start

```sh
npx canopy-page init docs/site        # write a settings file (and a home page, if needed)
npx canopy-page check docs/site       # report anything broken, without building
npx canopy-page build docs/site -o dist/help
npx canopy-page watch docs/site       # rebuild on change, serve it locally
```

`init` never replaces a settings file that is already there, and writes no page into a folder
that already holds markdown — adopting an existing set of documents and starting a new site are
different situations, and only one of them wants a page written for it.

## Commands

| Command | What it does |
|---|---|
| `canopy-page init [site-dir]` | Write a settings file naming the site after its folder |
| `canopy-page check [site-dir]` | Check settings and references; build nothing |
| `canopy-page build [site-dir] [-o out]` | Check, then publish to `out` (default `./site`) |
| `canopy-page watch [site-dir] [-o out] [--port n]` | Build, then rebuild on every source change and serve the result locally (default port `8080`) |

`[site-dir]` is the folder holding `settings.json`, and defaults to the current directory.

`build` runs the exact same checks `check` does, against the same view of the site, and writes
nothing at all if any of them fail — a broken link cannot reach the published output by way of
`build` skipping a check `check` would have caught.

`watch` builds once, serves that output, then rebuilds on every save. A failed rebuild is
reported on the console; the last successful build keeps being served, and the process itself
never exits on a broken save — only the *initial* build failing stops it (there is nothing yet to
serve). Refuses to start if the port is already taken, rather than silently picking another one.

### In a pipeline

```yaml
- run: npx canopy-page check docs/site
- run: npx canopy-page build docs/site -o dist/help
```

Put `check` first: it never renders, so it is fast enough to sit at the front of a pipeline even
at the scale a large product manual reaches, and a broken link then costs seconds rather than a
full build.

## `settings.json`

Every field is an override, so `{}` is a valid settings file: a folder of markdown builds with
its navigation derived from the folder tree. Settings exist for what a tree cannot say by
itself — the order of a release log, a label that is not a directory name, a draft folder that
stays unpublished.

Validation is strict: an unknown key is rejected rather than silently ignored (a mistyped key
that is quietly dropped looks like a tool disobeying its configuration), and every error message
names the exact position it is about, down to `sections[0].items[1]`. The settings file itself is
never published, and neither is anything `exclude` names or anything `tokens` points at.

```json
{
  "$schema": "https://iyulab.github.io/canopy-page/settings.schema.json",
  "title": "Product Help",
  "description": "How to use it",
  "lang": "en-GB",
  "icon": "assets/favicon.png",
  "logo": "assets/logo.svg",
  "tokens": "brand.css",
  "home": { "url": "https://example.com", "label": "Back to Product" },
  "siteUrl": "https://help.example.com",
  "exclude": ["_drafts", "*.tmp"],
  "rehypePlugins": ["rehype-declart"],
  "strings": { "search": "검색" },
  "sections": [
    { "path": "guide", "label": "Guide", "items": [
      { "label": "Orders", "items": ["guide/orders/list", "guide/orders/detail"] },
      "guide/settings/*"
    ]},
    { "path": "release-notes", "label": "Release notes", "order": "desc" }
  ]
}
```

An editor pointed at `$schema` (VS Code, JetBrains — any editor with JSON Schema support) gets
completion and inline validation for every field below as you type.

### Top-level fields

| Field | Meaning |
|---|---|
| `$schema` | Optional. Points an editor at [`settings.schema.json`](https://iyulab.github.io/canopy-page/settings.schema.json). Read and ignored by canopy-page itself |
| `title` | Site name, shown in the top bar and the document title. Defaults to the site directory's own name |
| `description` | Fills `<meta name="description">`, which is what a link preview shows |
| `lang` | [BCP 47](https://www.rfc-editor.org/rfc/rfc5646) tag for `<html lang>` (`"en"`, `"ko-KR"`). Changes only that one attribute — see [`strings`](#strings-and-lang-non-english-sites) for the reader chrome's own text |
| `icon` | Favicon, relative to the settings file. Must be a published file (not excluded) |
| `logo` | Image shown beside the site title in the sidebar header, relative to the settings file. Must be a published file. Renders with an empty `alt`: the title text right beside it already names the site |
| `tokens` | Path to a CSS file of design-token overrides, relative to the settings file. See [Theming](#theming) |
| `home` | A link back to the site this documentation sits beside: `{ url, label }`. Both required together — naming half of it is rejected. `url` is an absolute `http(s)` URL when the target is a different origin, or a relative path (`"../"`) naming a location from the site's own root when it is a sibling of the published site. No default `label` — link text has to be written in the site's own language |
| `siteUrl` | Absolute `http(s)` URL naming where the built site will stand. **Only** when set does `build` write `sitemap.xml` and a `robots.txt` pointing at it — every link canopy writes is otherwise relative, on purpose, so the same output works at any sub-path |
| `exclude` | Paths to leave unpublished, relative to the settings file: a directory (`"_drafts"` or `"_drafts/**"`), an extension at any depth (`"*.tmp"`), or one exact path. A shape outside that list (e.g. `"images/*.md"`) is rejected rather than silently matching nothing |
| `rehypePlugins` | Installed npm package names of rehype plugins to run on every page — see [Diagrams](#diagrams-via-rehypeplugins) |
| `strings` | Overrides for the reader chrome's own text — see [`strings` and `lang`](#strings-and-lang-non-english-sites) |
| `sections` | Ordered regions of the site — see [`sections`](#sections) |

### `sections`

A settings file describes **one site**, built in one pass — `sections` name ordered regions
within it (a guide, a release log), not separate builds. Links and backlinks resolve across the
whole of it, which is what lets a guide page and the release note it refers to stay connected.
Two genuinely independent sites are two settings files.

| Field | Meaning |
|---|---|
| `path` | The directory this section covers, relative to the settings file |
| `label` | Heading shown for the section. Defaults to the name the section's own index page gives itself (frontmatter `title`, else its opening heading), then the directory name as a last resort |
| `order` | `"asc"` or `"desc"` for the pages inside, when they are not listed one by one. `"desc"` is what a release log wants — newest first. Cannot be combined with `items`: a list is already an order |
| `items` | Explicit contents, in display order |

An entry in `items` is a page path (`"guide/install"`), or a group with its own nested `items`:

```json
{ "label": "Orders", "items": ["guide/orders/list", "guide/orders/detail"] }
```

Paths may be written with or without their `.md` extension. Two glob shapes are understood:
`dir/*` is the pages directly in a directory, `dir/**` is every page beneath it — either one
means the pages there **that are not already placed elsewhere**, which is what makes
`["guide/install", "guide/*"]` read the way it looks: this page first, then the rest.

A group's own `path` names a page (an index), not a directory — `"guide/writing/index"` with
nested `items` places that page as the group's own heading link, with the listed pages beneath
it. Naming a section's index page again inside its own `items` is not a duplicate placement: the
heading already links it, so this asks for what's already there.

**Pages no section mentions are placed anyway** — inside their own section where one covers
their directory, and reported as a warning either way. A page that exists but cannot be reached
is worse than one shown in an order nobody chose deliberately.

Where a section asks for no ordering at all (no `order`, no `items`), canopy derives the
navigation itself from the folder tree, ordered by filename rather than by page title.

### `strings` and `lang` (non-English sites)

`lang` sets `<html lang>` — worth doing for any non-English site, since assistive technology
reads pronunciation rules from it and browsers use it for translation prompts and font
fallback — but it changes *only* that attribute. Every word canopy and canopy-page write around
your content (`"Search"`, `"Toggle color theme"`, the navigation landmarks) is their own UI, not
vault content, so it stays in English regardless of `lang` unless overridden with `strings`.

```json
{
  "lang": "ko-KR",
  "strings": { "search": "검색", "toggleTheme": "테마 전환" }
}
```

Nine keys exist; every one is optional and keeps its English default when left out:

| Key | English default | Where it appears |
|---|---|---|
| `search` | `Search` | The search box's placeholder and accessible label |
| `toggleTheme` | `Toggle color theme` | The dark/light toggle's accessible label |
| `siteNav` | `Site navigation` | The sidebar's accessible label |
| `pageNav` | `Page navigation` | The prev/next cards' accessible label |
| `onThisPage` | `On this page` | The on-page outline's visible heading and accessible label |
| `indexTitle` | `Contents` | Title and heading of the auto-generated contents page at the site root |
| `backlinks` | `Linked references` | Heading above a page's list of pages that link to it |
| `breadcrumb` | `Breadcrumb` | Accessible label for the topbar's ancestor-trail nav |
| `searchFailed` | `Search failed to load.` | Message shown in the results list when the client search index fails to load |

There is no built-in translation table — canopy-page has no way to guess what your language
calls "Search"; link text (`home.label`, page titles) follows the same reasoning.

### `tokens` and branding

See [Theming](#theming) below for the full token vocabulary. `tokens` names a CSS file, relative
to the settings file, appended *after* canopy's own default tokens — so naming one custom
property keeps every other default, and the file is read at build time and excluded from the
published output automatically (it configures the build; it is not a page of it).

### `rehypePlugins`: extending what a page can render

Canopy renders CommonMark, GFM, math, and highlighted code on its own. Anything past that — a
diagram fence rendered to SVG, say — goes through one fixed extension point: a rehype plugin,
run after canopy sanitizes the page's HTML and before Shiki highlights its code.

```json
{ "rehypePlugins": ["rehype-declart", "rehype-mermaid"] }
```

Each entry is the name of an **installed npm package** (an ordinary dependency of your project),
never a filesystem path — a relative-looking entry is rejected, since the directory it would
resolve against is wherever the build happens to run from, not the settings file's own location.
See [Diagrams](#diagrams-via-rehypeplugins) below for what this looks like end to end.

## Writing pages

Ordinary markdown. What follows is the part where a *site* of many documents differs from a
single one.

### How a page gets its name

```
frontmatter title  →  the heading the page opens with  →  the filename
```

That one resolved name reaches the sidebar entry, the browser tab, and the text of every
backlink pointing at the page — so a folder of prose documents usually needs no `label` written
anywhere in `settings.json` at all. Where a filename genuinely reads better than its own first
heading (a folder of `ORD_LIST.md`/`ORD_DETAIL.md`, say), add a `title:` frontmatter line and it
wins over both.

### Linking

Both a plain markdown link and a wikilink work, and both are checked:

```markdown
[Installing canopy-page](../install.md)
[[install]]
```

A markdown link (including the reference-style `[text][id]` form) is a path relative to the
document. A wikilink is a name resolved tree-wide — no directory prefix needed, as long as it is
unambiguous. Either way, the published link points at the built page (`.md` in, `.html` out),
and either way, a link or wikilink to something that does not exist stops the build. An
unresolved wikilink degrades to plain text rather than a broken link, since there is nothing to
point a `<a href>` at.

A link into a section of another page keeps its anchor: `[the exit codes](../reference/exit-codes.md#the-codes)`.
A heading's anchor is derived from its own wording by default (`## Some Title` → `#some-title`),
so it moves if the wording later does — give it a stable one with a trailing `{#id}` when a
heading is expected to reword but should keep the same fragment for other pages or bookmarks to
target:

```markdown
## What the checker refuses {#what-check-refuses}
```

A path containing a space works whichever way an editor writes it — angle brackets
(`[x](<a b/c.md>)`) or percent-encoded (`[x](a%20b/c.md)`) both resolve to the same document.
Absolute URLs, root-absolute paths (`/help/x.png`), and bare fragments (`#section`) are left
exactly as written — canopy has no standing to judge them, and `check` warns rather than errors
on a root-absolute one that resolves against nothing (see [What `check` reports](#what-check-reports)).

References inside a fenced or inline code block are never checked — a fenced example of a
broken link is documentation, not a broken link:

````markdown
`[this is never checked](nowhere.md)`
````

### Backlinks

Nothing on a page declares who links to it. The list at the foot of every page with at least one
is built by inverting every link in the site, so a page always knows what refers to it — the
thing that rots first when a sidebar or a "see also" list is maintained by hand.

### Syntax highlighting

A fenced code block is highlighted by language, with light/dark dual themes that switch with the
reader's system preference (or the manual toggle — see [Theming](#theming)):

````markdown
```ts
const x: number = 1;
```
````

An unlabelled fence, and a fence naming a language nothing can resolve, both render as themed
plain-text code blocks — the same background and font as every other fence, just without syntax
coloring — rather than an unstyled block that reads as a different kind of element. A typo in a
fence language never fails a build.

A code block wider than the reader's screen scrolls sideways rather than wrapping (wrapping
would break indentation); see [scroll-edge shadow](#what-ships-in-every-site) below for the
affordance that signals it.

### Math

Written between dollar signs, rendered to HTML at build time with the fonts bundled into the
site — reading a page with math needs no network and no script:

```markdown
Inline: a site of $n$ documents resolves its links in one pass, not $n$.

$$
\text{pages} = \sum_{s \in \text{sections}} |s|
$$
```

Two deliberate deviations from a literal reading of the source, so prose about money is never
silently treated as a formula:

- **Currency-safe inline math.** `$..$` is *not* math when the opening `$` is followed by
  whitespace, the closing `$` is preceded by whitespace, or the closing `$` is immediately
  followed by a digit — `costs $5 and $10 total` stays literal text, not `"5 and "` rendered as
  a formula.
- **A paragraph of only standalone `$$..$$` lines is display math**, matching how a line-based
  editor renders it; a `$$..$$` mixed into a sentence stays inline.

### Callouts

A top-level blockquote opening with the `> [!type]` convention — the same one GitHub
renders — becomes a styled callout:

```markdown
> [!tip] Optional title
> Body in regular markdown.
```

Five core styles: `note`, `tip`, `warning`, `danger`, `quote`. Common aliases map onto them
(`info` → note, `error` → danger, …), and an unrecognized type falls back to `note` rather than
failing. A nested blockquote (inside another blockquote) stays a plain quote, not a callout.

### Contents list

A page with at least two headings gets an on-page contents list automatically, built from the
same heading ids that `[[page#heading]]` links target — so a contents entry and a cross-page
link to that same section can never disagree about where it is. One heading is not a structure
worth navigating, so a page with only one gets no list.

### Diagrams (via `rehypePlugins`)

Canopy has no diagram support of its own; a site adds it by naming a rehype plugin package that
claims a fenced code block by its language:

```json
{ "rehypePlugins": ["rehype-declart", "rehype-mermaid"] }
```

Two plugins already exist in the ecosystem for this:

- **[`rehype-declart`](https://github.com/iyulab/declart)** — claims a ` ```declart ` fence,
  parses a flow/tier/hierarchy/matrix diagram description, and renders it to an inline `<svg>`
  through a WebAssembly binding, entirely at build time. No browser involved.
- **`rehype-mermaid`** — claims a ` ```mermaid ` fence and renders [Mermaid](https://mermaid.js.org/)
  diagrams the same way (an SVG in the published HTML), but through a real headless browser
  ([Playwright](https://playwright.dev/)) rather than WebAssembly — a site enabling it needs a
  headless Chromium installed wherever it builds, which costs real time and disk on every build.

Either way, the plugin runs after canopy's own sanitize step and before Shiki highlights code, so
it sees and replaces the fence before Shiki would otherwise render it as a highlighted
`language-mermaid`/`language-declart` block. What reading the finished page depends on is
whatever the plugin decided — an inline `<svg>`, generated once at build time, needs nothing at
read time either way.

### Raw HTML

Sanitized: safe authoring tags survive; `<script>` tags and other injection vectors are
stripped. Canopy itself writes no client-side JavaScript into a page's own content — the
reader-facing behaviors below are canopy-page's own scripts, wired to markup canopy's shell
always emits (see [What belongs where](#what-belongs-where-canopy-page-vs-canopy)).

## What ships in every site

No `settings.json` field turns these on — they are just there, on the next build. Reading a
page never depends on any of the scripted ones: block scripts, or print the page, and only they
go away.

- **Search**, matching a query's terms against every page's title, headings, and body — a term
  has to appear somewhere for a page to match at all, and a match in the title or a heading
  outranks one buried in the body. `Ctrl+K`/`Cmd+K` jumps to it from anywhere, badged on the
  search box itself so the shortcut is discoverable without reading these docs; the badge hides
  once the box has focus, and on narrow viewports where the box itself collapses to an icon.
- **The current page and section, marked** in the sidebar (`aria-current="page"`) and the
  on-page outline, updating as you scroll a page long enough to have a [contents list](#contents-list).
- **A dark/light toggle** in the top bar, remembered across visits via `localStorage`; without a
  script attached, pages simply follow the reader's system setting.
- **Content images open full-size in a lightbox** when clicked, closing on a background click,
  <kbd>Esc</kbd>, or its close button. An image already wrapped in a link to its own file (a
  common workaround before this shipped) still opens the lightbox first — a middle click or a
  modifier-held click still follows the link, for a reader who wants the file itself.
- **Prev/next cards** at the foot of every page, linking to its neighbors in the sidebar's own
  order, and **backlinks** listing every page that points to it (see [Backlinks](#backlinks)).
- **Sidebar groups collapse**, open exactly along the path to the page you're currently on and
  closed everywhere else — computed fresh on every render, no script and nothing to remember
  across page loads.
- **A breadcrumb trail** in the top bar (`Guide / Orders / Payables`), shown whenever the top bar
  already exists for another reason (a title, a logo, `home`, or search) — a one-entry trail for
  a top-level page says nothing its own `<h1>` doesn't already say, so it's omitted there.
- **An icon on `home` specifically when it points off the site** — a link back to a surrounding
  product or org sits right next to the breadcrumb, which never leaves the site, so it earns a
  visual "you're leaving" cue the breadcrumb doesn't need. Marked only for a genuine
  different-origin URL (an explicit scheme, or protocol-relative `//host`); a root-absolute
  `home.url` (this site's own domain root) is left unmarked, since it stays on the same site.
- **A full-screen menu on narrow screens** that starts closed instead of opening on every page
  load (canopy's own script-free default is *open*, to guarantee a working nav even with no
  script attached) — remembered for the rest of that browser session via `sessionStorage`, not
  across visits, since a stale "open" choice from days ago would be more surprising than useful.
- **A code block wider than the screen shows a shadow at whichever edge still has more to
  scroll to**, and nothing once you've scrolled there — a scroll-position-aware, no-script cue
  for a scrollbar some OS/browser combinations hide until hovered.
- **Sitemap and `robots.txt`**, once `siteUrl` is set (see [Top-level fields](#top-level-fields)).

## Theming

The published shell reads a fixed vocabulary of CSS custom properties, declared once and read
through both a `prefers-color-scheme: dark` media query and an explicit `[data-theme="dark"]`
attribute override (the dark toggle's own mechanism) — so the two paths can never drift apart.

| Property | What it colors |
|---|---|
| `--bg-primary` / `--bg-secondary` | Page background / sidebar and secondary surface background |
| `--text-normal` / `--text-muted` / `--text-faint` | Body text / secondary text (metadata, captions) / the faintest tier |
| `--accent` / `--accent-hover` | Links, the active sidebar entry, focus and hover states |
| `--border` / `--border-strong` | Hairline dividers / a more visible border |
| `--sidebar-active-bg` | The current page's sidebar highlight — derived from `--accent` automatically, not a separate value to keep in sync |
| `--callout-{note,tip,warning,danger,quote}` / `-bg` | Each callout type's accent color and tinted background |
| `--font-ui` / `--font-monospace` | UI/body typeface / code typeface |
| `--content-max-width` | The article column's max width |
| `--sp-2` … `--sp-8` / `--radius-m` | The spacing scale and corner radius every shell element is built from |

Override what you need via `tokens` (a CSS file appended *after* these defaults):

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

**Two blocks, not one, on purpose.** Canopy's own defaults end with a
`prefers-color-scheme: dark` block, and a media query adds no specificity over a bare selector —
so a bare `:root` appended after that block wins in **both** color schemes. A one-block file
naming only a light-mode color would ship that same color onto a dark sidebar too; the second,
explicit `@media` block is what gives dark mode its own value back.

**A custom property `tokens` sets that canopy never reads is not an error — it's silently
ignored.** No warning, and the build still exits `0`. This is the trap moving an existing docs
site onto canopy-page tends to spring: a stylesheet carried over from a previous tool's own token
names (a `--vp-c-*` set, an `--ifm-*` set, a `.dark`/`.light` class toggle instead of the
`[data-theme]` attribute canopy reads) parses fine and produces a page that renders — just with
none of the intended colors, because nothing in it actually matched anything canopy looks at. If
an override doesn't show up on the built site, check the rendered page's computed styles first,
not just that the build succeeded.

## What `check` reports

**Errors — these stop a build:**

- A settings reference that matches no page, or a page placed more than once
- A link that points at nothing published, naming the page and the line
- An image that is not a published file
- A wikilink that matches no page (it renders as plain text rather than a broken link, so the
  message says that explicitly — otherwise nobody knows what they were looking for)
- A link whose destination stops at a space, reported as exactly that rather than as the
  truncated path it becomes — `[x](../a b/c.md)` (unbracketed) links `../a` and leaves the rest
  as text, so wrap the path in `<>` or write the space as `%20`

**Warnings — reported, and the build continues:**

- Pages no section covers (placed anyway; see [`sections`](#sections))
- A root-absolute reference (`/assets/logo.png`) with nothing published at that path — right if
  the site is served from a domain root, wrong from a sub-path, which the checker cannot always
  tell; when `siteUrl` already declares a sub-path mount, it warns even if the reference resolves
  today, since that is the one case it actually can judge
- An `exclude` pattern that matched nothing — usually a path written from the wrong place.
  Extension patterns (`*.tmp`) are exempted: a rule about what may never ship is not a claim that
  something is there right now
- A section with no `label` and no index page, whose sidebar heading falls back to its own raw
  directory name
- A filename whose published URL needs percent-encoding — a stray space, or another ASCII
  character outside a URL's unreserved set. The page still publishes and works (a static host
  serves the encoded URL fine); this is a nudge to confirm the encoding was intended, not a
  defect. Deliberately blind to non-ASCII: a Korean, Japanese, or any other non-English filename
  needs the exact same percent-encoding and is never flagged for it

Checking reads the settings and every page's text; it never renders, which is what keeps it fast
enough to sit at the front of a pipeline at the scale a large product manual reaches.

## Exit codes and CI

| Code | Meaning |
|---|---|
| `0` | Nothing broken. Warnings may still have been printed |
| non-zero | At least one error. `build` wrote nothing at all |

A site published with half its images missing is worse than a site that didn't publish, because
nobody finds out until a reader does — so `build` treats "some pages are fine" as no different
from "nothing built."

```yaml
- run: npx canopy-page check docs/site
- run: npx canopy-page build docs/site -o dist/help
```

## Deploying the output

`build`'s output is a plain static site — any static host works. For GitHub Pages, this is the
shape [this repository's own demo deploy](../.github/workflows/pages.yml) uses:

```yaml
- run: npx canopy-page build docs/site -o dist/help
- uses: actions/configure-pages@v5
- uses: actions/upload-pages-artifact@v4
  with:
    path: dist/help
- uses: actions/deploy-pages@v4
```

Set `siteUrl` to the final published address so `sitemap.xml`/`robots.txt` carry it. GitHub
Pages project sites publish under a sub-path (`user.github.io/repo/`) — see the first
[Gotcha](#gotchas) below for why that needs no extra configuration here.

## What belongs where: canopy-page vs canopy

| | canopy-page | canopy |
|---|---|---|
| Configuration | `settings.json` and its validation | — |
| Structure | Sections, order, labels, globs | Navigation tree, link resolution |
| Integrity | Reference checks, exit codes | — |
| Output | Search/dark-toggle/lightbox/mobile-nav scripts | HTML, assets, backlinks, outlines, the site shell itself |

canopy is driven through its command line rather than its library API, on purpose: it is the
same door every other consumer uses, so a gap in that door is worth raising with canopy rather
than working around here with a private integration.

## Gotchas

- **A relative link, not a root-absolute one, unless the site always serves from a domain
  root.** Every link canopy writes is relative for exactly this reason — the same output works
  at `/` or at `/help/` without a rebuild. A hand-written `/assets/logo.png` in your own markdown
  breaks under a sub-path mount; `check` warns about this once `siteUrl` declares one.
- **`tokens` silently no-ops on an unrecognized custom property.** See
  [Theming](#theming) — check the rendered page's computed styles, not just a green build, when
  a brand override doesn't show up.
- **`rehypePlugins` entries are package names, not file paths.** A relative path is rejected
  outright rather than resolved against a directory that would depend on wherever the build
  happened to run from.
- **`sections` and `order`/`items` are mutually exclusive within one section** — `items` is
  already an order.
- **`home` needs both `url` and `label`, or neither.** Naming only one is rejected rather than
  built with a guessed default for the other.
- **A settings file with an unknown top-level key fails validation outright**, rather than
  ignoring the typo — the error message names the exact position (`sections[0].items[1]`, etc.)
  to make finding it fast.
