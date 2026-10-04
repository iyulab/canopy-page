---
description: "Syntax highlighting, math, and callouts, all rendered at build time with no script needed to read them."
---
# Code and math

Everything on this page renders at build time — no script is needed to show the highlighting,
math, or callouts below.

## Syntax highlighting

Fences are highlighted by language, in a light and a dark palette that switch with the reader's
system setting or the theme toggle. The first code block of a site looks exactly like the last
one — the highlighter settles each grammar as it loads, so a build cannot produce two
different colourings for two identical blocks.

```ts
import { build } from "@iyulab/canopy";

const bundle = await build({
  documents: [
    { path: "index.md", content: "# Home\n\nSee [[notes/idea]]." },
  ],
});
```

```python
def pages(tree: dict) -> list[str]:
    return sorted(p for p in tree if p.endswith(".md"))
```

```json
{ "title": "Product Help", "sections": [{ "path": "guide" }] }
```

A fence with no language, or naming one nothing can resolve, renders as plain text — the same
background and font as every other code block, just without coloring — rather than failing. A typo
in a fence's language never fails a build:

```notalanguage
this still renders
```

A block wider than the screen scrolls sideways rather than wrapping, which would break its
indentation; [a shadow marks the edge](../reading.md#scrolling-a-wide-code-block) with more to
see.

## Math

Written between dollars, rendered to HTML when the site is built, with the fonts bundled into the
site — reading a page with math needs no network and no script:

```markdown
Inline: a site of $n$ documents resolves its links in one pass, not $n$.

$$
\text{pages} = \sum_{s \in \text{sections}} |s|
$$
```

Rendered:

$$
\text{pages} = \sum_{s \in \text{sections}} |s|
$$

Inline as well: a site of $n$ documents resolves its links in one pass, not $n$.

Two rules keep prose about money from turning into a formula:

- `$…$` is **not** math when the opening `$` is followed by a space, the closing `$` is preceded
  by one, or the closing `$` is followed directly by a digit. This sentence
  costs $5 and $10 total to write, and stays text.
- A paragraph of nothing but `$$…$$` is display math, set on its own line. A `$$…$$` inside a
  sentence stays inline.

## Callouts

> [!NOTE]
> A note carries context the surrounding prose would interrupt.

> [!WARNING]
> A warning is what a reader will wish they had read.

> [!TIP]
> Callout syntax is the same one GitHub renders, so a document reads correctly both in the
> repository and on the published site.

A blockquote whose first line is `> [!type]`, optionally followed by a title, becomes a callout:

```markdown
> [!tip] Optional title
> Body in regular markdown.
```

Five styles: `note`, `tip`, `warning`, `danger` and `quote`. Common aliases map onto them —
`info` is a note, `error` is danger — and a type nothing recognizes falls back to a note rather
than failing. Only a top-level blockquote becomes a callout; one nested inside another blockquote
stays a plain quote. [Theming](../../reference/theming.md#tokens) lists the colours each one
reads.

## Long enough for a contents list

The list at the top of this page was not written by hand. Every page with at least two headings
gets one, built from the same heading ids that `[[page#heading]]` links target — so a contents
entry and a cross-page link can never disagree about where a section is. A page with a single
heading gets none: one heading is not a structure worth navigating.

### A third-level heading

Nested one level in the contents list, matching its depth here.

### Another one

And that is the whole page.
