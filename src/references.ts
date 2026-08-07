/**
 * Finding the references a document makes: links, images, wikilinks.
 *
 * A checker needs to know what a page points at before anything is built, which
 * means reading markdown without rendering it. This is deliberately a smaller
 * job than parsing: it looks for the shapes that address a file and ignores
 * everything else about the document.
 *
 * Code is skipped — fenced blocks and inline spans — because a fenced example
 * of a broken link is documentation, not a broken link. That is the one place a
 * naive scan gets it loudly wrong, and it is the case documentation sites hit
 * most, since they are full of examples.
 *
 * What this does *not* do is decide which page a reference resolves to when
 * several could match. That question belongs to the renderer, and answering it
 * differently here would produce a checker that disagrees with the build. The
 * checker only ever asks whether anything is there.
 */

/** Something a document points at. */
export interface Reference {
  /** The target exactly as written. */
  target: string;
  kind: "link" | "image" | "wikilink";
  /** 1-based line in the document, so a finding can name where to look. */
  line: number;
  /**
   * The destination ran into a space and stopped there, leaving the rest of the
   * line outside the link. `target` is what the renderer will use, which is not
   * what the author wrote — the one case where reporting the target alone
   * describes something nobody typed.
   */
  cutAtSpace?: true;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /`[^`]*`/g;
// `![alt](url)` and `[text](url)`, with the URL taken up to whitespace or `)`.
// Angle-bracketed URLs (`[x](<a b.md>)`) are the escape hatch for spaces.
const INLINE_LINK = /(!?)\[[^\]]*\]\(\s*(<[^>]*>|[^\s)]*)/g;
// `[id]: url "optional title"` — where a reference-style link's target lives.
const LINK_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const HTML_IMG = /<img\b[^>]*\bsrc\s*=\s*["']([^"']*)["']/gi;

function unwrap(url: string): string {
  return url.startsWith("<") && url.endsWith(">") ? url.slice(1, -1) : url;
}

/**
 * Did this destination stop at a space that was meant to be part of it?
 *
 * An unbracketed destination ends at the first space, so `(../a b/c.md)` links
 * `../a` and leaves ` b/c.md` as text. What follows a real destination is
 * optional whitespace, an optional quoted title, and `)`. Anything else means
 * the path was cut, which is worth saying — the alternative is a message about
 * a target the author never wrote.
 */
function cutAtSpace(raw: string, after: string): boolean {
  if (raw.startsWith("<")) return false;
  const remainder = after.slice(0, after.indexOf(")") === -1 ? undefined : after.indexOf(")"));
  const title = remainder.trim();
  return title !== "" && !/^["'(]/.test(title);
}

/**
 * Extract every reference in a markdown document, in document order.
 *
 * Frontmatter is left alone: it is metadata for the renderer, and a path in it
 * means whatever the consuming site decides it means.
 */
export function extractReferences(markdown: string): Reference[] {
  const references: Reference[] = [];
  const lines = markdown.split(/\r?\n/);
  let fence: string | undefined;
  let inFrontmatter = lines[0]?.trim() === "---";

  lines.forEach((rawLine, i) => {
    const line = i + 1;

    if (inFrontmatter) {
      if (i > 0 && rawLine.trim() === "---") inFrontmatter = false;
      return;
    }

    const fenceMatch = FENCE.exec(rawLine);
    if (fence !== undefined) {
      // A fence closes on a marker of the same kind and at least the same length,
      // so a longer fence can quote a shorter one.
      if (fenceMatch?.[1]?.startsWith(fence[0] as string) && fenceMatch[1].length >= fence.length) {
        fence = undefined;
      }
      return;
    }
    if (fenceMatch?.[1] !== undefined) {
      fence = fenceMatch[1];
      return;
    }

    const text = rawLine.replace(INLINE_CODE, "");

    const definition = LINK_DEFINITION.exec(text);
    if (definition?.[1] !== undefined) {
      references.push({ target: unwrap(definition[1]), kind: "link", line });
      return;
    }

    for (const match of text.matchAll(INLINE_LINK)) {
      const raw = match[2] ?? "";
      const target = unwrap(raw);
      if (target === "") continue;
      references.push({
        target,
        kind: match[1] === "!" ? "image" : "link",
        line,
        ...(cutAtSpace(raw, text.slice(match.index + match[0].length)) ? { cutAtSpace: true } : {}),
      });
    }
    for (const match of text.matchAll(HTML_IMG)) {
      const target = match[1] ?? "";
      if (target !== "") references.push({ target, kind: "image", line });
    }
    for (const match of text.matchAll(WIKILINK)) {
      const target = (match[1] ?? "").trim();
      if (target !== "") references.push({ target, kind: "wikilink", line });
    }
  });

  return references;
}

/**
 * True when a URL addresses something outside the site and must not be checked.
 *
 * These are the cases canopy states it leaves exactly as written: a scheme
 * (`https:`, `mailto:`), a protocol-relative URL, a root-absolute path — a
 * deployment path whose meaning depends on where the site is mounted — and a
 * bare fragment, which addresses the page it is on.
 */
export function isExternalUrl(url: string): boolean {
  return (
    url === "" || url.startsWith("#") || url.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(url)
  );
}

/** Strip a query string or fragment, which address a place *within* a target. */
export function targetPath(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Turn a URL path into the site path it addresses, undoing percent-encoding.
 *
 * A reference is a URL and the site is files, so the two spellings of one path —
 * `a%20b/note.md` and `a b/note.md` — have to meet before anything is compared.
 * Editors write the encoded form on their own for any path containing a space,
 * and this checker's own advice for a destination that stops at a space is to
 * "write the space as %20", so without this it rejects what it just recommended.
 *
 * Decoded per segment, never across the whole path: `%2F` is a slash inside one
 * name rather than a directory boundary. A malformed escape comes back
 * undefined, and the reference is left alone — which is what the renderer does
 * with it, and the checker's job is to agree with the renderer.
 *
 * TODO(upstream: claudedocs/issues/ISSUE-canopy-20260807-link-target-resolution.md)
 * — canopy applies this same rule when it rewrites links, and does not expose
 * it, so the rule is spelled out twice and can drift. It just did: canopy
 * learned to read this encoding one release before this file did.
 */
export function decodeTarget(path: string): string | undefined {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return undefined;
    }
    if (decoded.includes("/")) return undefined;
    segments.push(decoded);
  }
  return segments.join("/");
}

/**
 * Resolve a site-relative target against the document holding it.
 *
 * `..` is honoured so a page can point at a sibling folder. A target that walks
 * above the site root addresses something the site was never given, so it comes
 * back undefined and is left alone rather than reported.
 */
export function resolveFrom(documentPath: string, target: string): string | undefined {
  const segments = documentPath.split("/").slice(0, -1);
  for (const part of target.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return undefined;
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join("/");
}
