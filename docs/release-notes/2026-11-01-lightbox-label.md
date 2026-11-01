---
description: The image lightbox's close button can be labelled in your language, and every sentence canopy-page's own scripts show is now one overridable list.
---
# The lightbox's close button speaks your language

canopy-page 0.28.0 lets a non-English site translate the one piece of its own interface that was
still English: with `lang` and every `strings` key filled in, the image lightbox's close button was
read aloud by a screen reader as "Close".

## `strings.lightboxClose`

```json
{ "lang": "ko-KR", "strings": { "lightboxClose": "닫기" } }
```

The close button of the lightbox — the overlay a click on a page's image opens — takes this as its
accessible name. Left out, it keeps `Close`. It sits in the
[Strings table](../reference/settings.md#strings) beside `searchFailed`, the other sentence
canopy-page's own scripts show, and in the Korean example of
[Publishing a non-English site](../guide/localizing.md).

## Nothing else is left in English

Every sentence canopy-page's own scripts show a reader is now listed in one place, and a test fails
any script that sets a hard-coded sentence — an accessible name, a title, a placeholder or text —
that is not on that list. A future script cannot add a string you cannot translate without the build
of canopy-page itself noticing.
