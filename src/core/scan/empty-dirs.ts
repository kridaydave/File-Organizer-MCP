/**
 * Empty directory audit — list directories that hold no entries
 *
 * A directory is empty when its listing came back with zero entries. That is a
 * literal reading of "empty" on purpose: a directory holding only dotfiles,
 * only a subdirectory, or only a symlink has entries, so it is not reported.
 * Callers pair this with a cleanup step, and a directory that merely looks
 * idle at a glance is the one most likely to hold something worth keeping.
 *
 * Real subdirectories are descended into; symlinked directories are never
 * entered. Before each descent the child's canonical path is re-resolved and
 * checked against the root, because a subdirectory can be swapped for a
 * symlink between the listing and the descent and the name we hold no longer
 * names what it pointed at.
 */

import fs from "fs/promises";
import path from "path";
import { CONFIG, SKIP_DIRECTORIES } from "../../config.js";
import { resolveExistingAncestor } from "../../utils/path-security.js";
import { isErrnoException } from "../../utils/error-handler.js";
import { isSubPath } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import { ValidationError, type EmptyDirectoryResult } from "../../types.js";

const SKIPPED_DIRS: ReadonlySet<string> = new Set(SKIP_DIRECTORIES);

/** Empty directories reported when the caller sets no cap. */
const DEFAULT_LIMIT = 100;

export interface FindEmptyDirectoriesOptions {
  /** Descend into subdirectories. Defaults to true. */
  recurse?: boolean;
  /**
   * How many levels below the root to walk. Defaults to the configured
   * `maxScanDepth`, so the walk stays bounded even when nothing is passed.
   */
  maxDepth?: number;
  /** Cap on returned empty directories. Defaults to 100. */
  limit?: number;
}

/**
 * List the empty directories under `directory`.
 *
 * Read-only: it lists directories and never creates, moves, or removes one.
 * `depth_limited` and `result_limited` report when the walk stopped early, so a
 * short list is never mistaken for a complete one.
 */
export async function findEmptyDirectories(
  directory: string,
  options: FindEmptyDirectoriesOptions = {},
): Promise<EmptyDirectoryResult> {
  const recurse = options.recurse ?? true;
  const maxDepth = options.maxDepth ?? CONFIG.security.maxScanDepth;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const found: string[] = [];
  const visited = new Set<string>();
  let scanned = 0;
  let depthLimited = false;
  let resultLimited = false;
  /** Set once the cap cut the walk short, so parents stop descending too. */
  let stopped = false;

  // Canonical root every descent must stay under.
  let rootReal: string;
  try {
    rootReal = (await resolveExistingAncestor(directory)).resolvedPath;
  } catch {
    rootReal = path.resolve(directory);
  }

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (stopped) return;

    // depth 0 is the root the caller named. Failing to list it means the
    // answer would be a clean bill of health for a directory we never saw, so
    // that is an error. Deeper directories disappearing mid-walk is ordinary
    // filesystem churn and stays silent.
    const isRoot = depth === 0;

    let realDir = dir;
    try {
      realDir = await fs.realpath(dir);
    } catch {
      // Unresolvable root is reported per-entry below; keep walking it.
    }
    if (visited.has(realDir)) return;
    visited.add(realDir);

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      const code = isErrnoException(error) ? error.code : undefined;
      if (isRoot && (code === "ENOENT" || code === "ENOTDIR")) {
        // No path in the message: createErrorResponse sanitizes, but a path we
        // were never given permission to show should not be spelled out here.
        throw new ValidationError(
          code === "ENOTDIR"
            ? "Directory is not a directory"
            : "Directory does not exist or is not readable",
        );
      }
      if (code !== "ENOENT") {
        logger.debug(`Unreadable directory ${dir}`, { error });
      }
      return;
    }
    scanned += 1;

    // No entries at all is the whole definition. An empty directory has no
    // subdirectory left to descend into.
    if (entries.length === 0) {
      found.push(dir);
      return;
    }

    if (!recurse) return;

    for (const entry of entries) {
      // withFileTypes reports lstat semantics, so a symlinked directory fails
      // isDirectory() and is never entered.
      if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;

      if (depth >= maxDepth) {
        depthLimited = true;
        continue;
      }
      if (found.length >= limit) {
        // A subdirectory is left unexplored, so the list is not complete.
        resultLimited = true;
        stopped = true;
        return;
      }

      const fullPath = path.join(dir, entry.name);
      let childReal: string | undefined;
      try {
        const resolved = await resolveExistingAncestor(fullPath);
        if (resolved.exists) childReal = resolved.resolvedPath;
      } catch (error) {
        logger.debug(`Unresolvable subdirectory ${fullPath}`, { error });
      }
      // Not under the root any more, so the name we hold does not name what it
      // pointed at. Do not descend.
      if (childReal !== undefined && isSubPath(rootReal, childReal)) {
        await walk(fullPath, depth + 1);
      }
    }
  };

  await walk(directory, 0);

  const emptyDirs = found.sort();

  return {
    directory,
    scanned_count: scanned,
    depth_limited: depthLimited,
    result_limited: resultLimited,
    limit,
    total_count: emptyDirs.length,
    empty_dirs: emptyDirs,
  };
}