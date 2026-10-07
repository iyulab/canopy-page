---
description: Authors, covers and the next post on stream pages; links that match their page in any letter case; builds that never read their own output.
---
# Authors, covers, and the next post

canopy-page 0.24.0 fills in what a blog post shows around its text, and fixes links and builds
that went wrong without anything saying so.

## A stream post names its author and shows its cover

A page's `author:` now opens its byline, and its `image:` — the picture link previews already
used — is its cover, under the byline and on the section's list. After the post come the one
published before it and the one after, labelled in your words with
[`strings.olderPost` and `newerPost`](../reference/settings.md#strings). The
[showcase blog](../showcase/host-blog/index.md) shows all three. `check` now reports an `image:`
that is not a published file. See [Profiles](../reference/theming.md#profiles).

## Links in any letter case

A markdown link that reaches its page by ignoring letter case — `[x](Guide/Install.md)` for
`guide/install.md`, or a folder link `Guide/` — is written as the page is spelled, and counts as a
backlink. It used to keep the spelling as written, which GitHub Pages serves nothing at. An image
or another file spelled in the wrong case is kept as written, so `check` reports it. See
[the check reference](../reference/check.md#a-link-or-image-reaches-its-file-only-by-ignoring-letter-case).

## A build never reads its own output

Running `canopy-page build` from the site folder writes `./site` there. The next build read that
folder back in and published it again one level deeper; now the output folder is never part of
the site.
