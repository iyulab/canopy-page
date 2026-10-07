---
description: A stream's list in pages — ten posts to a page unless pageSize says otherwise.
---
# A stream's list in pages

canopy-page 0.25.0 pages a long stream. A stream section's index lists its newest ten posts; the
rest continue on `page/2.html`, `page/3.html` … in the section, each page ending with the way to
the pages beside it. `pageSize` on the section — or on the site, for a whole-site stream — sets
another count, and [`strings.pageOf`, `newerPosts` and `olderPosts`](../reference/settings.md#strings)
say it in your words. The [showcase blog](../showcase/host-blog/index.md) shows two to a page.

A stream with more than ten posts is paged as soon as you upgrade. A page of your own at one of
those paths (`blog/page/2.md`) is refused, like any file where the build writes one of its own.
