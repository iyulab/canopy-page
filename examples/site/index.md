# Build a site from a folder of markdown

One settings file and a single command are the whole authoring pipeline canopy-page provides.
This site is that pipeline's own documentation, and it is built the same way any other site built
with canopy-page is:

```sh
npx canopy-page build examples/site -o dist/demo
```

The [settings file](reference/settings.md) beside these documents is short enough to read in one
sitting. Everything else — the sidebar, the contents list on each long page, the backlinks at the
foot of this one, the links between pages, search, and the pages that come before and after this
one — is derived from the documents themselves, not hand-maintained.

Start with [Installing canopy-page](guide/install.md).

## What canopy-page derives for you

| Look at | To see |
|---|---|
| The sidebar | Sections in the order the settings file gives, each page named by its own heading, the current page marked |
| The search box in the top bar | Every page's title, headings, and body — press `Ctrl+K` (`Cmd+K` on macOS) |
| The foot of this page | Prev/next cards and backlinks — every page that points here |
| [Release notes](release-notes/index.md) | A section ordered newest-first, from filenames alone |
| [Writing pages](guide/writing/index.md) | Links between documents, resolved and checked |
| [Code and math](guide/writing/code-and-math.md) | Highlighting, math, and callouts |
| [Reference](reference/settings.md) | A long page with a generated contents list |

## Works without JavaScript, better with it

Reading a page never depends on a script: the sidebar, the current-page highlight, the on-page
outline, prev/next cards, dark mode (following the system setting), and the mobile layout are all
plain CSS and HTML. A reader whose browser blocks scripts, or who prints a page, loses nothing
core to reading it.

One script — carried by canopy, authored by canopy-page, never by canopy itself — adds what
genuinely needs to run in a browser: the search box works once it loads, the on-page outline
highlights the section currently in view while scrolling, and a toggle lets a reader override the
system's dark/light choice and have that choice remembered. Block scripts and the search box and
theme toggle simply stay hidden; nothing breaks.

## Where the naming comes from

This page is called "Build a site from a folder of markdown" in the sidebar, in the browser tab,
and in every backlink pointing at it — because that is the heading it opens with. No `title:`
line declares it anywhere. See [Writing pages](guide/writing/index.md) for the full order.
