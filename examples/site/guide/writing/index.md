# Writing pages

Ordinary markdown. What follows is only the part where a site of many documents differs from a
single one.

## A page is named by its own heading

The name a page is shown under is resolved in this order:

```
frontmatter title  →  the heading the page opens with  →  the filename
```

That one name reaches the sidebar entry, the browser tab, and the text of every backlink pointing
at the page. This document is filed as `writing/index.md` and is called "Writing pages"
everywhere, because that is what its first line says.

The order matters most where filenames are identifiers and documents are prose — a folder of
`ORD_LIST.md` and `ORD_DETAIL.md` produces a readable sidebar without anyone writing a label for
each one. Where a filename genuinely reads better, add a `title:` line and it wins.

## Linking to another page

Both spellings work and both are checked:

```markdown
[Installing canopy-page](../install.md)
[[install]]
```

A markdown link is a path relative to the document. A wikilink is a name resolved across the whole
site. Either way the published link points at the built page — you write `.md`, readers get
`.html` — and either way, a link to something that does not exist stops the build.

A link into a section of another page keeps its anchor: [the exit code table](../../reference/exit-codes.md#the-codes).

A path containing a space works whichever way an editor writes it. These two links address the
same document and both resolve:

```markdown
[angle brackets](<../../reference/error messages.md>)
[percent-encoded](../../reference/error%20messages.md)
```

[Try the first](<../../reference/error messages.md>) · [try the second](../../reference/error%20messages.md).
Editors pick the second form on their own when you insert a link, without anyone typing an
escape — so a folder named `release notes` is enough to meet this.

## Backlinks come free

Nothing on this page declares who links to it. The list at the foot is built by inverting every
link in the site, so a page always knows what refers to it — which is the thing that rots first
when a sidebar is maintained by hand.

## What the checker refuses

- A link or wikilink pointing at nothing published
- An image that is not a published file
- A page the settings file places twice

And what it warns about without stopping: pages no section covers, a root-absolute reference that
would break under a sub-path mount, and an `exclude` pattern that matched nothing.

References inside code fences are left alone. An example of a broken link is documentation, not a
broken link:

```markdown
[this is never checked](nowhere.md)
```

Next: [Code and math](code-and-math.md).
