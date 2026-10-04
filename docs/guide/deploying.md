---
description: "Publishing what build writes: any static host, a GitHub Pages workflow, siteUrl, and serving from a sub-path."
---
# Deploying the output

`build` writes a plain static site — HTML pages, their assets, a search index and a stylesheet and
script of canopy-page's own. Nothing runs on a server, so any static host serves it: copy the
output folder there.

## GitHub Pages

This is the shape this site's own deploy takes, on every push that changes it:

```yaml
- run: npm ci
- run: npx canopy-page check docs/site
- run: npx canopy-page build docs/site -o dist/help
- uses: actions/configure-pages@v6
- uses: actions/upload-pages-artifact@v5
  with:
    path: dist/help
- uses: actions/deploy-pages@v5
```

The deploy job needs the `pages: write` and `id-token: write` permissions, and the repository's
Pages source set to GitHub Actions. A site that names `rehype-mermaid` in
[`rehypePlugins`](../reference/settings.md#extending-what-a-page-can-render) also needs a headless
Chromium installed before `build` (`npx playwright install --with-deps chromium`) — see
[Diagrams](writing/diagrams.md).

## Set `siteUrl`

Set [`siteUrl`](../reference/settings.md#where-the-site-stands) to the address the site will
actually stand at. That is what turns on `sitemap.xml`, `robots.txt`, canonical links and the
other tags that have to be absolute, and what lets a feed be published. A site that is never
meant to be found can leave it out; everything else works without it.

## Serving from a sub-path

Every link canopy writes is relative, so the same output works at a domain root
(`help.example.com/`) or under a path (`user.github.io/repo/`, `example.com/help/`) without a
rebuild or a base-path setting — and opens from a local folder too. A GitHub Pages project site,
which lives under the repository's name, needs nothing extra.

The one thing that breaks under a sub-path is a link written root-absolute in your own markdown:
`/assets/logo.png` asks the host's root, not the site's. Write links relative to the page instead.
`check` reports a root-absolute reference that resolves to nothing, and once `siteUrl` names a
path it checks the ones inside it as this site's own pages — see [Root-absolute
references](../reference/check.md#root-absolute-references).

## Before the deploy step

Run `check` before `build`, or just `build`: either stops the job on a broken link before
anything is uploaded, and `build` writes nothing at all when it stops. See
[Exit codes](../reference/exit-codes.md).
