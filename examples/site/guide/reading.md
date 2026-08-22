# What a reader gets

Everything below ships with every build — none of it is a `settings.json` field to turn on, and
none of it is required for a page to be readable (see [Code and math](writing/code-and-math.md)
for what stays build-time only).

## Search

`Ctrl+K` (`Cmd+K` on macOS) jumps to the search box in the top bar from anywhere on the page —
badged on the box itself, so the shortcut doesn't take reading this page to discover. It matches
a query's terms against every page's title, headings, and body — a query has to match somewhere
for a page to appear at all, and a match in the title or a heading ranks above one buried in the
body.

## The current page, and the current section

The sidebar marks whichever page you are reading. On a page long enough to have its own
[contents list](writing/code-and-math.md#long-enough-for-a-contents-list), the entry for the
section currently in view is marked too, updating as you scroll.

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
document beside.

## On a narrow screen

Below a page's own width, the sidebar collapses to a single control. Opening it covers the
screen with the full navigation rather than pushing the page's content down; closing it returns
to reading.

## Scrolling a wide code block

A code block wider than the screen scrolls sideways rather than wrapping, which would break its
indentation. A shadow at whichever edge still has more code to scroll to marks it as
scrollable — a cue for a scrollbar some browsers hide until you hover it — and disappears once
you've scrolled that far.

## Knowing when a link leaves the site

The link back to wherever this documentation sits beside (`home` in `settings.json`, "canopy-page
on GitHub" at the top of this page) can point at a page on this same site or somewhere else
entirely. When it leaves, an icon after the label says so before you click it.
