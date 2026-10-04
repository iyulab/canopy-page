---
description: Put a blog inside an existing site, in that site's own header, footer and colors.
---
# Hosting a blog in your own site

A product site usually has a design system already — its header, its footer, its colors and
type. A blog inside it should wear that design, not a second one. canopy-page does this with
four HTML fragments and one stylesheet; the blog's features — the list, dates, reading time,
contents, search, a feed — stay canopy-page's.

The [showcase](../showcase/host-blog/index.md) is built exactly this way, for a made-up product.

## The section

```json
{
  "siteUrl": "https://example.com",
  "sections": [
    {
      "path": "blog",
      "profile": "stream",
      "regions": {
        "head": "partials/head.html",
        "header": "partials/header.html",
        "afterArticle": "partials/cta.html",
        "footer": "partials/footer.html"
      }
    }
  ]
}
```

`profile: "stream"` reads the section as dated pages, newest first: one column, the page's
`description:` as a lead, the date and reading time, then the contents. The section's index
lists every post; canopy-page writes that index if the section has none.

## The fragments

`header` **replaces** canopy-page's top bar with your markup, as you wrote it, and `footer` ends the page as written. Put
canopy-page's controls where you want them with slots:

```html
<header class="site-header">
  <a href="https://example.com/">Example</a>
  <canopy-slot name="back"></canopy-slot>
  <canopy-slot name="search"></canopy-slot>
  <canopy-slot name="theme-toggle"></canopy-slot>
</header>
```

[Slots](../reference/theming.md#slots) lists every one, and `page:<key>` — a page's own
frontmatter text. Always write the closing tag: HTML does not close
`<canopy-slot name="search"/>`, and `check` says so.

A call to action that is the same box on every post but says something different on each:

```html
<aside class="cta">
  <p><canopy-slot name="page:cta">Try Example free.</canopy-slot></p>
  <a href="https://example.com/download">Download</a>
</aside>
```

A post with `cta: Try the new export.` in its frontmatter shows that; a post without one shows
the default.

Links in a fragment are written from the site root — `blog/`, `assets/logo.svg` — and work from
every page. A link to the rest of your product (`/pricing`) is left alone in the built page. With
`siteUrl` at the domain root, as above, `check` warns when this site publishes nothing at that
path — expected when your product answers it. If `siteUrl` names a path instead
(`https://example.com/blog`, for a site that is the whole blog), `check` treats a root-absolute
link outside that path as your product's and does not report it, and checks the ones inside it
(see [Root-absolute references](../reference/check.md#root-absolute-references)).

## The bridge

`head` adds your design system's stylesheet. One file in it maps canopy-page's vocabulary to
your tokens:

```css
:root {
  --bg-primary: var(--color-surface);
  --text-normal: var(--color-text);
  --text-muted: var(--color-text-subtle);
  --border: var(--color-line);
  --accent: var(--color-brand);
  --font-ui: var(--font-body);
}
```

If your tokens change for dark mode, the bridge follows them. [Theming](../reference/theming.md)
lists every token and every class name that is safe to select on.
