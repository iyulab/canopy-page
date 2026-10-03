---
description: "The exit codes check and build return, and what a pipeline should do with each."
---
# Exit codes

`check` and `build` are meant to be run by a pipeline, so what they report matters less than what
they return.

## The codes

| Code | Meaning |
|---|---|
| `0` | Nothing broken — or only what `knownBroken` excuses. Warnings may still have been printed |
| non-zero | At least one error. `build` wrote nothing |

## Errors stop the build

An error means a reader would hit something that is not there — a link to a page that was never
published, an image that does not exist, a wikilink matching nothing. When any is present,
`build` writes no output at all.

That is a deliberate contract rather than an implementation detail: a site published with half
its images missing is worse than a site that did not publish, because nobody finds out until a
reader does.

See [Error messages](<error messages.md>) for what each one says and how to read it.

## A site that is already broken

A site adopted from another tool often arrives already publishing broken links and missing
images — the first `check` is where they surface, and fixing them can take longer than the rest of
the site should wait. `knownBroken` in `settings.json` names the pages being fixed and why:

```json
"knownBroken": [
  { "path": "help/statistics/kpi/**", "reason": "Screenshots being retaken" }
]
```

`path` is one page, `dir/*` (the pages directly in a directory) or `dir/**` (every page beneath
it). Broken references on those pages become one warning per entry, naming the reason, and the
build goes ahead. A new break anywhere else is still an error, so the contract above holds for
everything not on the list. And the list only shrinks: an entry that matches no page, or whose
pages have nothing broken left, is reported for removal.

## Warnings do not

A warning is something that depends on context the checker does not always have. A root-absolute
reference like `/assets/logo.png` is right if the site is mounted at the root of a domain and
wrong if it is served from a sub-path. Ordinarily the checker cannot tell which — but when
`siteUrl` already declares a sub-path mount, it warns about a root-absolute reference even if the
reference resolves today, since that is the one case it can actually judge. It reports and
continues either way.

## In a pipeline

```yaml
- run: npx canopy-page check docs/site
- run: npx canopy-page build docs/site -o dist/help
```

The first step is the fast one: it never renders. Putting it before an expensive job means a
broken link costs seconds rather than a full build.
