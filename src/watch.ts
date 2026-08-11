import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import { extname, resolve, sep } from "node:path";

/**
 * Serving a build's output locally during authoring.
 *
 * This is a preview server for one author on one machine, not a production
 * origin: no range requests, no caching headers, no compression. The only
 * thing it has to get right is not serving a path outside the directory it
 * was told to serve.
 */

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Check if a resolved file path contains any dot-prefixed segments (hidden files
 * or directories). A request for `/.git/config` has `basename(...) === "config"`,
 * which doesn't start with `.`, but the path contains the hidden segment `.git`.
 * We reject any such path to avoid serving hidden version control, metadata, or
 * temporary files that happen to exist under the served root.
 */
function hasHiddenSegment(root: string, filePath: string): boolean {
  const relative = filePath.slice(root.length);
  const segments = relative.split(sep).filter((s) => s.length > 0);
  return segments.some((s) => s.startsWith("."));
}

/**
 * Something about running `watch` itself, as opposed to `check.ts`'s findings
 * (about the site) or `InitError` (about `init`) — a port already in use is
 * the case this exists for. The message is the whole of what a reader needs,
 * same reasoning as `SiteError` in `site.ts`.
 */
export class WatchError extends Error {}

/**
 * Resolve a request URL to a path inside `root`, refusing anything that
 * would land outside it.
 *
 * A percent-encoded "..%2F" is exactly as much a traversal attempt as a
 * literal one, so decoding happens before the containment check runs — a
 * check against the raw string would let the encoded form through.
 *
 * Malformed percent-encoding (e.g. %zz, lone %) throws URIError in
 * decodeURIComponent — catching it here prevents an unhandled rejection
 * that would hang the connection.
 */
function resolveRequestPath(root: string, url: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.split("?")[0] ?? "/");
  } catch {
    // Malformed percent-encoding results in 404
    return undefined;
  }
  const target = resolve(root, decoded.replace(/^\/+/, ""));
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(rootWithSep)) return undefined;
  return target;
}

/** Resolve a request URL to the file that answers it, following one directory→index.html hop. */
async function resolveFile(
  root: string,
  url: string,
  triedIndex = false,
): Promise<string | undefined> {
  const target = resolveRequestPath(root, url);
  if (target === undefined) return undefined;
  try {
    const stats = await stat(target);
    if (stats.isDirectory()) {
      if (triedIndex) return undefined;
      return resolveFile(root, `${url.replace(/\/?$/, "/")}index.html`, true);
    }
    return target;
  } catch {
    return undefined;
  }
}

/** A running preview server, and how to stop it. */
export interface StaticServer {
  /** The port actually bound — the same value passed in, unless it was 0. */
  readonly port: number;
  close(): Promise<void>;
}

/** Serve the files in `root` over HTTP on `port` (0 for an OS-assigned port). */
export function serveStatic(root: string, port: number): Promise<StaticServer> {
  const absoluteRoot = resolve(root);
  // Path segments this server never has a reason to answer for — the same
  // reasoning `isSkippedDir` in vault.ts applies to what a build publishes.
  const server = http.createServer((req, res) => {
    void (async () => {
      const file = await resolveFile(absoluteRoot, req.url ?? "/");
      if (file === undefined || hasHiddenSegment(absoluteRoot, file)) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": contentType(file) });
        res.end(body);
      } catch {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not Found");
      }
    })();
  });

  return new Promise((resolvePromise, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "EADDRINUSE"
          ? new WatchError(`Port ${port} is already in use — pick another with --port.`)
          : error,
      );
    });
    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : port;
      resolvePromise({
        port: actualPort,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
