import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import { basename, extname, resolve, sep } from "node:path";
import { watch as watchFiles } from "chokidar";
import { buildSite } from "./build.js";
import { isSkippedDir } from "./vault.js";

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

const DEBOUNCE_MS = 300;

/** What a watch run needs to know. */
export interface WatchOptions {
  /** Directory holding the settings file. */
  dir: string;
  /** Directory to write the site into, and to serve. */
  out: string;
  /** Port to serve on. */
  port: number;
  /** Called after every rebuild attempt (not the initial build) with its exit code. */
  onRebuild?: (code: number) => void;
}

/** A running watch session, and how to stop it. */
export interface WatchHandle {
  /** The port actually bound. */
  readonly port: number;
  close(): Promise<void>;
}

/** `Error#message` if it's one, else a `String()` fallback for whatever else a rejection carries. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Build once, then rebuild on every source change and serve the result.
 *
 * The server binds before the first build runs: a port already in use is an
 * environment problem that has nothing to do with the site, and failing on
 * it immediately — via `WatchError`, which propagates uncaught to `cli.ts` —
 * costs nothing. Binding after a multi-second build would waste that build
 * on a run that was always going to fail.
 *
 * A failed *rebuild* (as opposed to this first build) is reported and
 * nothing else: `buildSite`'s existing contract (an error means nothing is
 * written) means the previous, working output just keeps being served. The
 * process only ever stops on the initial build failing — there is nothing to
 * serve yet, so the server is closed again — or on the caller closing it.
 *
 * `buildSite` is not guaranteed to only resolve with an exit code: a
 * malformed `settings.json` (edited mid-session) or a transient fs error
 * (e.g. a lock held by an editor's save, more likely here since the watcher
 * below has no `awaitWriteFinish`) surfaces as a thrown `SiteError` instead.
 * Both the initial build and every rebuild treat a throw exactly like a
 * nonzero exit code — the alternative, letting a rebuild's rejection go
 * uncaught, would take down the whole watch process over one bad save.
 */
export async function watchSite(options: WatchOptions): Promise<WatchHandle | undefined> {
  const { dir, out, port, onRebuild } = options;
  const server = await serveStatic(out, port);
  let initialCode: number;
  try {
    initialCode = await buildSite({ dir, out });
  } catch (error) {
    console.error(`canopy-page: build failed — ${errorMessage(error)}`);
    await server.close();
    return undefined;
  }
  if (initialCode !== 0) {
    await server.close();
    return undefined;
  }

  const absoluteDir = resolve(dir);
  const resolvedOut = resolve(out);
  const outWithSep = resolvedOut.endsWith(sep) ? resolvedOut : resolvedOut + sep;

  let rebuildTimer: NodeJS.Timeout | undefined;
  let rebuilding = false;
  let rebuildQueued = false;
  // Tracks the rebuild currently running (if any) so close() can drain it
  // instead of resolving while it's still writing to `out` in the
  // background — see close() below.
  let currentRebuild: Promise<void> | undefined;

  function runRebuild(): void {
    if (rebuilding) {
      rebuildQueued = true;
      return;
    }
    rebuilding = true;
    currentRebuild = buildSite({ dir, out })
      .then(
        (code) => {
          console.log(
            code === 0
              ? "canopy-page: rebuilt"
              : "canopy-page: rebuild failed — serving the last successful build",
          );
          onRebuild?.(code);
        },
        (error: unknown) => {
          // Same outcome as a nonzero exit code — the last successful build
          // keeps being served — reported distinctly since it's a different
          // failure shape. onRebuild still fires so a caller waiting on it
          // (a test, or a future CLI status line) doesn't hang forever.
          console.error(
            `canopy-page: rebuild failed — serving the last successful build (${errorMessage(error)})`,
          );
          onRebuild?.(1);
        },
      )
      .finally(() => {
        rebuilding = false;
        currentRebuild = undefined;
        if (rebuildQueued) {
          rebuildQueued = false;
          runRebuild();
        }
      });
  }

  function scheduleRebuild(): void {
    if (rebuildTimer !== undefined) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(runRebuild, DEBOUNCE_MS);
  }

  // Ignoring is structural only — dot-directories, node_modules, and the
  // resolved output directory itself (unignored, a build watching its own
  // output would rebuild forever). Content-level exclusions (settings.exclude)
  // are deliberately not repeated here: vault.ts already restates canopy's
  // exclusion rules once as a tracked debt, and a watch trigger that fires on
  // an excluded file costs one redundant rebuild, not a wrong answer.
  const watcher = watchFiles(absoluteDir, {
    ignoreInitial: true,
    ignored: (watchedPath: string) => {
      const resolved = resolve(watchedPath);
      if (resolved === absoluteDir) return false;
      if (resolved === resolvedOut || resolved.startsWith(outWithSep)) return true;
      return isSkippedDir(basename(resolved));
    },
  });
  // chokidar.watch() returns before its initial directory scan finishes
  // arming the underlying OS watches — a file saved in that window can go
  // unnoticed. Waiting for "ready" here means the promise this function
  // returns is only kept once a change is guaranteed to be caught, which is
  // what lets a caller (a test, or a human saving a file right after start)
  // trust that watch mode is actually watching.
  await new Promise<void>((res) => watcher.once("ready", res));
  watcher.on("all", scheduleRebuild);
  // chokidar emits "error" for real, plausible triggers — a watched folder
  // renamed or deleted mid-session, EPERM on Windows, ENOSPC from an inotify
  // watch limit on Linux, EACCES on an unreadable subdirectory. An
  // EventEmitter's "error" event with no listener throws uncaught, which
  // would take down the whole watch process — exactly what this file's other
  // error handling (buildSite failures never killing the process) exists to
  // avoid. Reporting and continuing is the same "keep running" contract.
  watcher.on("error", (error: unknown) => {
    console.error(`canopy-page: watch error — ${errorMessage(error)}`);
  });

  console.log(`canopy-page: watching ${dir}, serving http://localhost:${server.port}/`);

  return {
    port: server.port,
    close: async () => {
      if (rebuildTimer !== undefined) clearTimeout(rebuildTimer);
      // A rebuild queued behind one already in flight (see runRebuild) hasn't
      // started yet — cancelling it here means close() doesn't leave a fresh,
      // unsignaled canopy build spawning after it returns, same as clearing
      // rebuildTimer above does for one that was merely scheduled.
      rebuildQueued = false;
      // Closing the watcher first means no further change can schedule a new
      // rebuild while we drain below — only what's already running is left
      // to wait out, since rebuildQueued was just cleared above.
      await watcher.close();
      // A rebuild already in flight keeps writing to `out` and calling
      // onRebuild after this close() would otherwise have returned, which
      // breaks the "everything this started has stopped" contract close()
      // is supposed to have. The loop (rather than a single await) guards
      // against runRebuild reassigning currentRebuild synchronously from
      // inside the previous one's `finally` — which can no longer chain into
      // an actual rebuild now that rebuildQueued is cleared, but leaves the
      // loop here as the correct shape regardless.
      while (currentRebuild !== undefined) {
        await currentRebuild;
      }
      await server.close();
    },
  };
}
