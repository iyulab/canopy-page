import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitObserver } from "./lastmod.js";

const execFileAsync = promisify(execFile);

/** Room for the history of a large repository: ~100 bytes a commit, a million commits. */
const MAX_BUFFER = 128 * 1024 * 1024;

/**
 * The commit graph of HEAD, read in ONE `git log` so that questions about it — which commits a commit
 * contains — are answered in memory instead of with a process each. A process per question is what
 * made judging two hundred pages take fifteen seconds on Windows.
 */
export interface History {
  /** The commit a hash (abbreviated or full) names in HEAD's history; `"ambiguous"` when it names several. */
  find(prefix: string): string | "ambiguous" | undefined;
  /** The day (`YYYY-MM-DD`, the committer's calendar) of a commit in the graph. */
  day(hash: string): string;
  /** Whether `ancestor` is `descendant` or one of the commits it contains. */
  contains(descendant: string, ancestor: string): boolean;
}

/** HEAD's commit graph, or `undefined` when git cannot read one (no commit yet). */
export async function readHistory(cwd: string, observe?: GitObserver): Promise<History | undefined> {
  const args = ["log", "--topo-order", "--format=%H %cs %P", "HEAD"];
  observe?.(args);
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("git", args, { cwd, maxBuffer: MAX_BUFFER }));
  } catch {
    return undefined;
  }
  // Topological order lists every commit before the commits it contains, so a commit can only contain
  // commits listed after it. That bounds each walk below to the part of the graph that can matter.
  const position = new Map<string, number>();
  const days: string[] = [];
  const parents: string[][] = [];
  const hashes: string[] = [];
  for (const line of stdout.split("\n")) {
    const [hash, day, ...rest] = line.trim().split(" ");
    if (hash === undefined || hash === "" || day === undefined) continue;
    position.set(hash, hashes.length);
    hashes.push(hash);
    days.push(day);
    parents.push(rest.filter(Boolean));
  }
  const contains = (descendant: string, ancestor: string): boolean => {
    const from = position.get(descendant);
    const target = position.get(ancestor);
    if (from === undefined || target === undefined || target < from) return false;
    if (target === from) return true;
    const seen = new Set<number>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const at = stack.pop() as number;
      for (const parent of parents[at] ?? []) {
        const index = position.get(parent);
        // A commit listed after the target cannot contain it; nothing past it needs walking.
        if (index === undefined || index > target || seen.has(index)) continue;
        if (index === target) return true;
        seen.add(index);
        stack.push(index);
      }
    }
    return false;
  };
  return {
    find(prefix) {
      if (position.has(prefix)) return prefix;
      const matches = hashes.filter((hash) => hash.startsWith(prefix));
      if (matches.length > 1) return "ambiguous";
      return matches[0];
    },
    day: (hash) => days[position.get(hash) ?? -1] ?? "",
    contains,
  };
}

/** Every commit in HEAD's history that changed something `pathspec` names, newest first. */
export async function commitsTouching(pathspec: string, cwd: string, observe?: GitObserver): Promise<string[]> {
  const args = ["log", "--format=%H", "HEAD", "--", pathspec];
  observe?.(args);
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: MAX_BUFFER });
    return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
