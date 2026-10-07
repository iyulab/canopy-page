---
description: "Everything a published site ships with out of the box: search, dark mode, an outline, prev/next cards, backlinks, with no setting to turn on."
---
# What a reader gets

Everything below ships with every build — none of it is a `settings.json` field to turn on.
Reading a page never depends on the scripted parts: block scripts, or print the page, and only
they go away (see [Code and math](writing/code-and-math.md) for what stays build-time only).

## Search

`Ctrl+K` (`Cmd+K` on macOS) jumps to the search box in the top bar from anywhere on the page —
badged on the box itself, so the shortcut doesn't take reading this page to discover. The badge
hides once the box has focus, and on narrow screens where the box collapses to an icon.

It matches a query's terms against every page's title, headings, and body — a term has to appear
somewhere for a page to match at all, and a match in the title or a heading ranks above one
buried in the body.

## The current page, and the current section

The sidebar marks whichever page you are reading (`aria-current="page"`). On a page long enough
to have its own [contents list](writing/code-and-math.md#long-enough-for-a-contents-list), the
entry for the section currently in view is marked too, updating as you scroll.

## A sidebar that opens where you are

Sidebar groups open exactly along the path to the page you are on, and stay closed everywhere
else — worked out when the page is built, so it needs no script and nothing is remembered between
pages.

## A breadcrumb

The top bar shows the trail from the top of the site to the current page — `Guide / Writing pages
/ Code and math` — whenever there is a top bar for another reason: a title, a logo, `home`, or
search. A top-level page gets none, since a one-entry trail would only repeat its own heading.

## Dark and light

Pages follow the system's dark/light setting with no script at all. The toggle in the top bar
overrides that for readers who want a specific choice regardless of their system setting, and
remembers it for their next visit.

## Zooming an image

Clicking an image in the body opens it full-size over the rest of the page. Click the dimmed
background, press <kbd>Esc</kbd>, or use the close button to return to reading. An image an
author already links to its own file opens the same way — the link underneath still works with a
middle click or a modifier-held click, for readers who want the file itself rather than the
zoomed view.

## Continuing to the next page

The foot of every page carries prev/next cards linking to its neighbors in the sidebar's own
order — look at the bottom of this page, and they point at exactly what "Guide" lists this
document beside. Beneath them, [backlinks](writing/index.md#backlinks-come-free) list every page
that links here.

## On a narrow screen

Below a page's own width, the sidebar collapses to a single control. Opening it covers the
screen with the full navigation rather than pushing the page's content down; closing it returns
to reading. It starts closed on every page; a reader who leaves it open keeps it open for the
rest of that visit, not for days afterwards. Without a script it is simply open, so the
navigation is always reachable.

## Scrolling a wide code block or table

A code block wider than the screen scrolls sideways rather than wrapping, which would break its
indentation. A shadow at whichever edge still has more code to scroll to marks it as
scrollable — a cue for a scrollbar some browsers hide until you hover it — and disappears once
you've scrolled that far. A table wider than the screen does the same inside its own box, so the
rest of the page stays put.

## Skipping to the content

The first thing a keyboard reaches on every page is a "Skip to content" link, out of sight until
then. Following it passes the top bar and the sidebar and lands on the page itself.

## Knowing when a link leaves the site

The link back to wherever this documentation sits beside (`home` in `settings.json`, "canopy-page
on GitHub" at the top of this page) can point at a page on this same site or somewhere else
entirely. When it leaves — an address with its own scheme, or `//host` — an icon after the label
says so before you click it. A `home` that stays on the same host, such as `/`, is left unmarked.

## Dates on dated pages

A dated page — one whose frontmatter names a `date:`, or whose file name begins with a day — shows
it under its heading, spelled for the site's
language — see [Dated pages](writing/index.md#dated-pages). Undated pages are unchanged.

## What search engines and link previews see

Every page's `<head>` carries its own `description:` from its frontmatter (falling back to the
site's), the Open Graph basics (`og:title`, `og:description`, `og:type`, `og:site_name`) and a
`twitter:card`. A dated page is also described as an article: `article:published_time`, and
`article:modified_time` from `updated:`, plus a schema.org `Article` record with its headline,
description, dates, language and author — and its image and address, once those can be absolute.

Once [`siteUrl`](../reference/settings.md#where-the-site-stands) is set, each page also gets a
canonical URL, `og:url`, `og:image` and `hreflang` links to the site's other language editions,
and the build writes `sitemap.xml` and `robots.txt` — the parts that only mean anything as
absolute addresses. Links inside a page stay relative regardless.
