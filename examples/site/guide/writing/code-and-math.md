# Code and math

Everything on this page renders at build time. No script runs in the reader's browser.

## Syntax highlighting

Fences are highlighted by language, and the first code block of a site looks exactly like the
last one — the highlighter settles each grammar as it loads, so a build cannot produce two
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

A fence naming a language nothing can resolve renders as a plain block rather than failing:

```notalanguage
this still renders
```

## Math

Written between dollars, rendered to HTML with the fonts bundled into the site, so it needs no
network:

$$
\text{pages} = \sum_{s \in \text{sections}} |s|
$$

Inline as well: a site of $n$ documents resolves its links in one pass, not $n$.

## Callouts

> [!NOTE]
> A note carries context the surrounding prose would interrupt.

> [!WARNING]
> A warning is what a reader will wish they had read.

> [!TIP]
> Callout syntax is the same one GitHub renders, so a document reads correctly both in the
> repository and on the published site.

## Long enough for a contents list

The list at the top of this page was not written by hand. Every page with at least two headings
gets one, built from the same heading ids that `[[page#heading]]` links target — so a contents
entry and a cross-page link can never disagree about where a section is.

### A third-level heading

Nested one level in the contents list, matching its depth here.

### Another one

And that is the whole page.
