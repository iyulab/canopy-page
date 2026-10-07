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
lists the posts, ten to a page ([`pageSize`](../reference/settings.md#sections) changes that);
canopy-page writes that index if the section has none.

A post's frontmatter carries the rest — `author:`, an `image:` for its cover, `tags:` that get
pages of their own, and a `readNext:` naming what to read after it. Every post ends with what to
read next, filled from the posts most like it when it names nothing. To pin a post atop the list —
a welcome, a launch — name it in the section:

```json
{ "path": "blog", "profile": "stream", "featured": ["blog/welcome"] }
```

What each of these draws, and the hooks to restyle it, is in
[Profiles](../reference/theming.md#profiles).

## The fragments

`header` **replaces** canopy-page's top bar with your markup, as you wrote it, and `footer` ends the page as written. Put
canopy-page's controls where you want them with slots:

```html
<header class="site-header">
  <canopy-slot name="skip-link"></canopy-slot>
  <a href="https://example.com/">Example</a>
  <canopy-slot name="back"></canopy-slot>
  <canopy-slot name="search"></canopy-slot>
  <canopy-slot name="theme-toggle"></canopy-slot>
</header>
```

[Slots](../reference/theming.md#slots) lists every one, and `page:<key>` — a page's own
frontmatter text. Always write the closing tag: HTML does not close
`<canopy-slot name="search"/>`, and `check` says so.

`skip-link` is the "Skip to content" link keyboard readers use to get past your header. Every page
opens with one even if you leave the slot out; placing it puts it inside your header, where your
own stylesheet can dress it (`.canopy-skip-link`). If your header already has a skip link of its
own, point it at `#canopy-main` and leave the slot out instead — one link, not two.

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

### A site with one colour scheme

Many product sites are dark only, or light only. Say so in the settings rather than in the
bridge:

```json
{ "colorScheme": "dark" }
```

Every page is then drawn dark for every reader — canopy-page's own colours, the code blocks, and
the bridge — whatever their system prefers or whatever they chose on another site of yours, and
there is no theme toggle to place (drop the `theme-toggle` slot; `check` warns if it stays). The
bridge maps your tokens once, unconditionally, as above; there is nothing of canopy-page's to
restate for the other scheme.
