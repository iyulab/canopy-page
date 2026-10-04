---
description: "Publishing a non-English site: lang for the document itself, strings for the reader chrome's own text."
---
# Publishing a non-English site

`lang` and `strings` are what a non-English site needs beyond everything else in this guide.

## `lang`

```json
{ "lang": "ko-KR" }
```

A [BCP 47](https://www.rfc-editor.org/rfc/rfc5646) tag for `<html lang>` — worth setting for any
non-English site, since assistive technology reads pronunciation rules from it and browsers use it
for translation offers, hyphenation, and font fallback. It changes exactly that one attribute.
Every word canopy and canopy-page write around your content — "Search", "Toggle color theme", the
navigation landmarks — is their own UI, not vault content, so `lang` alone leaves all of it
English.

## `strings`

`strings` is the second half: an override for each piece of that UI text.

```json
{ "strings": { "search": "검색", "toggleTheme": "테마 전환" } }
```

Every key is optional — a key left out keeps its English default.
[Strings](../reference/settings.md#strings) in the settings reference lists each one, its default,
and where it appears. There is no built-in
translation table — canopy-page has no way to guess what your language calls "Search", the same
reasoning [`home.label`](../reference/settings.md#home) already follows.

## A complete example

[`ko-settings.json`](localizing.assets/ko-settings.json) is a full `lang` + `strings` pair for a
Korean site — every key filled in, ready to paste into your own `settings.json`.

## More than one edition

A site published in several languages is several sites, one settings file each, mirroring each
other's structure. [`alternates`](../reference/settings.md#where-the-site-stands) tells each
edition where the others stand, so every page links its counterparts for search engines. To offer
them to readers too, place a [`language` slot](../reference/theming.md#slots) in a `header`
region of your own: it becomes a link to this page in each other edition, named in that
edition's own language.

## Proving it resolves

Two shapes this guide's own words describe but do not, by themselves, prove: a directory name
outside ASCII, and an asset that sits beside the page that references it — this page's own
`ko-settings.json`, in `localizing.assets/` next to it. [한국어-예시](한국어-예시/index.md) is the
other one — a page whose directory name is Korean, linked from right here, so this sentence is
itself the proof: if you can follow that link, canopy-page percent-encoded and resolved a
non-ASCII path correctly.
