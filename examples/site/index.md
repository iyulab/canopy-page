# A site built by canopy-page

Everything you are reading was produced by running one command over the folder this page lives
in. There is no build script, no hand-maintained sidebar, and no list of pages kept anywhere
except the documents themselves.

```sh
npx canopy-page build examples/site -o dist/demo
```

The [settings file](reference/settings.md) beside these documents is short enough to read in one
sitting. The sidebar, the contents list on each long page, the backlinks at the foot of this one,
and the links between pages are all derived.

## What this demo is showing

| Look at | To see |
|---|---|
| The sidebar | Sections in the order the settings file gives, each page named by its own heading |
| [Release notes](release-notes/2026-08.md) | A section ordered newest-first, from filenames alone |
| [Writing pages](guide/writing/index.md) | Links between documents, resolved and checked |
| [Code and math](guide/writing/code-and-math.md) | Highlighting, math, and callouts with no client-side JavaScript |
| [Reference](reference/settings.md) | A long page with a generated contents list |
| The foot of this page | Backlinks — every page that points here |

## No JavaScript

No script runs on any page of this site. The navigation, the contents lists, dark mode, and the
mobile layout are all CSS and plain HTML. A page that needs a script to show its own table of
contents does not work in a reader that blocks scripts, and does not print.

## Where the naming comes from

This page is called "A site built by canopy-page" in the sidebar, in the browser tab, and in
every backlink pointing at it — because that is the heading it opens with. No `title:` line
declares it anywhere. See [Writing pages](guide/writing/index.md) for the full order.

Start with [Installing canopy-page](guide/install.md).
