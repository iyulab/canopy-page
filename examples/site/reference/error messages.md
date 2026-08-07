# Error messages

Every message names the page and the line it is about. This page exists partly to be linked to:
its filename contains a space, which is the case that makes link spelling matter — see
[Writing pages](../guide/writing/index.md).

## A link points at nothing published

```
guide/install.md:12  link to "../reference/exit-code.md" — no such page
```

The path is reported as written, resolved against the document holding it. If the destination
stops at a space, the message says that instead of naming the truncated path — an unbracketed
destination ends at the first space, so `[x](../a b/c.md)` links `../a` and leaves the rest as
text, and the target a message would otherwise name is one nobody wrote.

## A wikilink matches nothing

```
guide/writing/index.md:31  wikilink [[instal]] matches no page
```

Reported separately because an unresolved wikilink renders as plain text rather than as a broken
link. Nothing on the published page looks wrong, so without the message nobody knows to look.

## An image is not a published file

```
index.md:4  image "assets/diagram.png" is not a published file
```

"Not published" covers three cases at once: the file does not exist, it is excluded, or it sits
above the site root. All three end the same way for a reader.

## A page is placed twice

```
settings.sections[0].items[3]: "guide/install" is placed more than once
```

A settings error rather than a content one, so it names the position in the file. A section's own
index page is not counted here — the section heading already links it, so naming it in `items`
asks for what is there rather than for a second copy.

## Warnings

```
2 page(s) no section covers: reference/exit-codes.md, reference/error messages.md
exclude "_archive" matched nothing
32 page(s) checked, nothing broken, 22 warning(s)
```

The last line is the summary. It carries the warning count so "nothing broken" cannot be read as
"nothing to look at".
