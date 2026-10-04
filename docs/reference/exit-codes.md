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
published, an image that does not exist, a wikilink matching nothing — or that the build itself
could not go ahead, such as a region fragment that is missing. When any is present, `build` writes
no output at all.

That is a deliberate contract rather than an implementation detail: a site published with half
its images missing is worse than a site that did not publish, because nobody finds out until a
reader does.

[What check reports](check.md) lists every error and warning, what each one says, and what to do
about it.

## A site that is already broken

A site adopted from another tool often arrives already publishing broken links and missing
images — the first `check` is where they surface, and fixing them can take longer than the rest of
the site should wait. [`knownBroken`](settings.md#knownbroken) in `settings.json` names the pages
being fixed and why. Broken links and images on those pages become one warning per entry, naming
the reason and listing each one, and the build goes ahead. A new break anywhere
else is still an error, so the contract above holds for everything not on the list. And the list
only shrinks: an entry that matches no page, or whose pages have nothing broken left, is reported
for removal — a baseline being paid down, not a switch that quietly turns the checker off.

## Warnings do not

A warning is something that depends on context the checker does not always have, or a nudge
rather than a defect. A root-absolute reference like `/assets/logo.png` is right if something on
the host answers it, which the checker cannot see; a page with no `description:` is fine on a site
nobody searches. It reports and continues, and the exit code stays `0`.

## In a pipeline

```yaml
- run: npx canopy-page check docs/site
- run: npx canopy-page build docs/site -o dist/help
```

The first step is the fast one: it never renders. Putting it before an expensive job means a
broken link costs seconds rather than a full build.
