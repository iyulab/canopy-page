# Exit codes

`check` and `build` are meant to be run by a pipeline, so what they report matters less than what
they return.

## The codes

| Code | Meaning |
|---|---|
| `0` | Nothing broken. Warnings may still have been printed |
| non-zero | At least one error. `build` wrote nothing |

## Errors stop the build

An error means a reader would hit something that is not there — a link to a page that was never
published, an image that does not exist, a wikilink matching nothing. When any is present,
`build` writes no output at all.

That is a deliberate contract rather than an implementation detail: a site published with half
its images missing is worse than a site that did not publish, because nobody finds out until a
reader does.

See [Error messages](<error messages.md>) for what each one says and how to read it.

## Warnings do not

A warning is something that depends on context the checker does not have. A root-absolute
reference like `/assets/logo.png` is right if the site is mounted at the root of a domain and
wrong if it is served from a sub-path — and where a site will be served from is not a checker's to
know. It reports and continues.

## In a pipeline

```yaml
- run: npx canopy-page check docs/site
- run: npx canopy-page build docs/site -o dist/help
```

The first step is the fast one: it never renders. Putting it before an expensive job means a
broken link costs seconds rather than a full build.
