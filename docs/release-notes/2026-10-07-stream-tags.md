---
description: Tags in a stream section — on each post, on the list, and a page for every tag.
---
# Tags in a stream

canopy-page 0.26.0 reads a stream post's `tags:`. They close the post and its item in the list,
each leading to the tag's page — `tags/<slug>.html` in the section — which lists the posts carrying
it; `tags/index.html` lists every tag with how many posts carry it. Tags spelled differently but
named alike (`Design`, `design`) are one tag, shown the way most posts spell it, and a tag in any
script keeps its letters. [`strings.tags`](../reference/settings.md#strings) names them in your
words; the [showcase blog](../showcase/host-blog/index.md) is tagged.

`check` names a tag that can have no page — one with no letters or digits, or one called `index` —
and a page of your own where a tag page would go. A manual page's `tags:` are left as they were.
