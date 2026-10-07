---
description: "Restyling a canopy-page site: where your CSS sits in the cascade, the design tokens, dark mode, the class names that are safe to select on, profiles, regions and slots."
---
# Theming

A site looks finished with no styling of its own, and every part of it can be restyled. This page
is the contract for doing that: where your CSS sits in the cascade, which names a stylesheet can
rely on, and which it cannot. The names here are [canopy](https://github.com/iyulab/canopy)'s —
it draws the page — and canopy-page passes them through unchanged.

## Your CSS always wins

`styles` in [the settings file](settings.md#branding) names one CSS file or a list of them:

```json
{ "styles": ["brand.css", "print.css"] }
```

They are linked after everything canopy and canopy-page write, in the order given. All of that
sits in [cascade layers](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer), and a rule
outside any layer beats every layered rule whatever its specificity — so plain selectors are
enough, and nothing needs `!important`. A stylesheet that declares a layer of its own sits between
canopy's and unlayered CSS: layers order by first appearance, and canopy's always comes first.

Each file is published where it stands and linked there, so a relative `url()` inside it — a font
beside it, a background image — resolves exactly as written. A path that is missing or excluded
is a `check` error, and so is a site file at `assets/stylesheet-1.css`, the path canopy-page
writes its own stylesheet to.

The one exception is code blocks in dark mode. Their colours are applied with `!important` inside
canopy's layer, and a layered `!important` outranks an unlayered one, so a `styles` file cannot
recolour them.

## Tokens

The page reads its colours, type and spacing from custom properties. Restating one keeps every
other default:

| Property | What it colors |
|---|---|
| `--bg-primary` / `--bg-secondary` | Page background / sidebar and secondary surfaces |
| `--text-normal` / `--text-muted` / `--text-faint` | Body text / secondary text such as metadata and captions / the faintest tier |
| `--accent` / `--accent-hover` | Links, the current sidebar entry, focus and hover |
| `--border` / `--border-strong` | Hairline dividers / a more visible border |
| `--sidebar-active-bg` | The current page's sidebar row — derived from `--accent`, so it follows a new accent on its own |
| `--sidebar-hover-bg` | A hovered sidebar row — derived from `--text-normal`, so it stays a neutral step below the current one under any accent |
| `--callout-{note,tip,warning,danger,quote}` / `-bg` | Each callout's accent and tinted background |
| `--font-ui` / `--font-monospace` | Body and UI typeface / code typeface |
| `--content-max-width` | The article column's maximum width |
| `--sp-1` … `--sp-8` / `--radius-m` | The spacing scale and corner radius every part of the page is built from |

### Dark mode

Dark mode is the attribute `data-theme="dark"` on `<html>`, set by the theme toggle — or, when a
reader has not used it, the system preference. Never a class. A dark value is stated for both of
those paths, exactly as canopy states its own palette:

```css
/* brand.css */
:root {
  --accent: #0a7c5a;
  --accent-hover: #096a4d;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --accent: #4ecfa2;
    --accent-hover: #6fdcb5;
  }
}

:root[data-theme="dark"] {
  --accent: #4ecfa2;
  --accent-hover: #6fdcb5;
}
```

Three blocks rather than one, on purpose. A bare `:root` outside canopy's layer wins in **both**
colour schemes, so a file naming only a light-mode colour would put that colour on a dark sidebar
too. And a plain `:root` inside the media query, without `:not([data-theme="light"])`, would
override a reader who switched the page to light.

### An override that does nothing

A custom property canopy never reads is not an error — it is silently ignored. No warning, and
the build still exits `0`. This is the trap moving an existing site tends to spring: a stylesheet
carried over from another documentation tool, with that tool's own token names, or with a
`.dark`/`.light` class toggle instead of the `data-theme` attribute, parses fine and builds fine
and changes nothing. When an override does not show up, look at the built page's computed styles
first — a green build says nothing about whether the names matched.

## Hooks

These class names are stable: renaming or removing one is a breaking change, announced in a
release. Select on them freely.

| Part of the page | Hooks |
|---|---|
| Top bar and controls | `.canopy-topbar` `.canopy-topbar-controls` `.canopy-site-title` `.canopy-logo` `.canopy-home` `.canopy-home-external` `.canopy-back` `.canopy-breadcrumb` `.canopy-language` `.canopy-search` `.canopy-theme-toggle` `.canopy-skip-link` |
| Layout and navigation | `.canopy-layout` `.canopy-sidebar` `.canopy-nav` `.canopy-nav-group` `.canopy-main` |
| Article | `.canopy-content` `.canopy-contents` `.canopy-before-article` `.canopy-after-article` `.canopy-lead` `.canopy-byline` `.canopy-date` `.canopy-reading-time` `.canopy-toc` `.canopy-listing` `.canopy-listing-title` `.canopy-table` |
| Callouts | `.callout` `.callout-note` `.callout-tip` `.callout-warning` `.callout-danger` `.callout-quote` `.callout-title` |
| Around the article | `.canopy-outline` `.canopy-backlinks` `.canopy-page-nav` `.canopy-prev` `.canopy-next` |

State is read from standard attributes, not classes: `aria-current="page"` on the current page's
link, `[open]` on a disclosure, `[hidden]` on a control no script has revealed.
`<html data-canopy-profile="manual">` or `"stream"` says which [profile](#profiles) drew the page.
Every page's `<main>` has `id="canopy-main"`, a stable target for a link of your own.

Every page opens with a skip link (`.canopy-skip-link`) to `#canopy-main`, out of sight until a
keyboard reaches it, so a keyboard reader can pass the header and sidebar on every page. Its text
is [`strings.skipToContent`](settings.md#strings). Each table in an article sits in a
`.canopy-table` box that scrolls sideways on a narrow screen instead of widening the page.

```css
/* A wider article and no sidebar. The layout paints the sidebar column's tint
   as its own background, so that goes with the column. */
:root { --content-max-width: 60rem; }
.canopy-sidebar { display: none; }
.canopy-layout { grid-template-columns: 1fr; background: none; }
```

Some hooks appear only where the page has that part: `.canopy-sidebar` on `manual` pages,
`.canopy-toc` on `stream` pages, `.canopy-topbar` only where the page has canopy-page's own top
bar rather than a [`header` region](#regions).

## Profiles

`profile` — for the whole site, or per section in [the settings file](settings.md#sections) —
says how a section's pages are read.

| Profile | Reads as |
|---|---|
| `manual` | The default: a tree to browse. A sidebar, the outline beside the text, backlinks, a breadcrumb in the top bar, and prev/next in sidebar order |
| `stream` | Dated pages read one at a time, newest first. See below |

A `stream` page is one centered column with no sidebar and no outline column. After its title come
the page's `description:` as a lead (`.canopy-lead`), a byline (`.canopy-byline`) with the date
(`.canopy-date`) and the reading time (`.canopy-reading-time`), then the contents, open, in a
disclosure (`.canopy-toc`). The top bar shows a link back to the section's index (`.canopy-back`)
where a manual page shows its breadcrumb.

The section's index page lists its pages newest first (`.canopy-listing`), each with its date,
reading time and summary — and is written for the section when it has none. A stream section
is ordered by each page's `date:`, so it takes no `order` or `items`; an undated page is listed
last, and `check` names it. Once `siteUrl` is set, a stream section publishes a feed unless
`"feed": false` says otherwise.

[Hosting a blog in your own site](../guide/host-site.md) builds one end to end.

## Regions

`regions` fills the parts of a page around the article with HTML fragments — files from the site
itself, which are read by the build and not published. Set on the site, or per section, where a
key overrides the site's and `""` turns that region off.

| Region | Where it goes |
|---|---|
| `head` | Inside `<head>`, after the site's stylesheets — the place to link a design system's CSS, fonts, structured data |
| `header` | **Replaces** canopy-page's top bar with the fragment's markup, as written. The sidebar is not part of it: a `manual` section keeps its own |
| `beforeArticle` | At the start of the article, in `.canopy-before-article` |
| `afterArticle` | At the end of the article, in `.canopy-after-article` |
| `footer` | At the end of the page, as written — there is no footer of canopy-page's own to replace |

Links in a fragment are written from the site root — `blog/`, `assets/logo.svg` — and rewritten
for each page, so one fragment works at every depth: `href`, `src`, `poster`, `action`, and every
URL in a `srcset`. A scheme, `//host`, `#id` or root-absolute `/path` is left as written. A
root-absolute link is the host site's own and left alone, except inside the path `siteUrl` places
this site at, where it is checked as one of this site's pages — see [What check
reports](check.md#root-absolute-references).

## Slots

A fragment places canopy-page's own controls with slots, replaced when the site is built —
nothing of the slot reaches the browser:

```html
<header class="site-header">
  <a href="https://example.com/">Example</a>
  <canopy-slot name="back"></canopy-slot>
  <canopy-slot name="search"></canopy-slot>
  <canopy-slot name="theme-toggle"></canopy-slot>
</header>
```

| Slot | Becomes |
|---|---|
| `site-title` | The logo and site title link (`.canopy-site-title`) |
| `home` | The [`home`](settings.md#home) link (`.canopy-home`) |
| `back` | On a stream page, the link back to its index (`.canopy-back`) |
| `breadcrumb` | The trail through the tree (`.canopy-breadcrumb`) |
| `language` | This page in the site's other language editions (`.canopy-language`) |
| `search` | The search box (`.canopy-search`) |
| `theme-toggle` | The dark/light toggle (`.canopy-theme-toggle`) |
| `skip-link` | The skip link (`.canopy-skip-link`); placed here, the page no longer opens with its own |
| `page:<key>` | The page's own frontmatter text for `<key>`, escaped; the slot's own content when the page has none |

A control slot with nothing to show on a page — `language` on a site with no
[`alternates`](settings.md#top-level-fields), `back` on a manual page — becomes nothing. Each
control keeps its look wherever it is placed: its styles hang on its own class, not on sitting in
canopy-page's top bar.

What the build refuses, and `check` reports first:

- an unknown slot name, or a `page:` slot with no key after the colon;
- a control slot with content, or one written self-closing — `<canopy-slot name="search"/>`.
  HTML does not close a custom tag that way, so it would take in everything after it. Always
  write the closing tag;
- a slot inside another slot, or in the `head` region, where nothing is shown to a reader;
- a page whose frontmatter value for a `page:` slot is not text — a list, a number, a date.

What `check` warns about, without stopping the build: [`home`](settings.md#home) or
[`logo`](settings.md#top-level-fields) set while no page shows it — every page has a `header`
region, and none of their fragments places the `home` or `site-title` slot.

Slot names are part of this contract: adding one is announced as a new feature, and removing or
changing one as a breaking change.

## Not part of the contract

Depth classes for nested navigation and outline entries, the way elements nest inside a part of
the page, and how icons are drawn are internal, and may change in any release. A stylesheet that
depends on them works until they change; one written against the names above keeps working.
