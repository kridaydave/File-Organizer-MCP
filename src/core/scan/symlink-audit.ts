/**
 * Symlink audit — find symlinks that dangle or resolve outside the allowed roots
 *
 * Walks a directory without following a link. For each symlink it reads the
 * link value (readlink) and canonicalizes the target path (realpath) but never
 * opens or reads the target. Containment is decided by the shared whitelist
 * check in src/utils/path-security.ts, the same one the validation layer uses,
 * so the audit and the organizer agree on what "outside" means.
 */

import fs from "fs/promises";
import path from "path";
import { CONFIG, SKIP_DIRECTORIES } from "../../config.js";
import {
  isPathInAllowedDirectories,
  resolveExistingAncestor,
} from "../../utils/path-security.js";
import { isErrnoException } from "../../utils/error-handler.js";
import { isSubPath } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import type {
  BrokenSymlinkFinding,
  BrokenSymlinkResult,
  SymlinkIssueKind,
} from "../../types.js";

/**
 * A link chain that loops back on itself. Reported as its own kind so a loop
 * is never mistaken for a plain missing target.
 */
const CIRCULAR: SymlinkIssueKind = "circular";

const SKIPPED_DIRS: ReadonlySet<string> = new Set(SKIP_DIRECTORIES);

function finding(
  linkPath: string,
  linkTarget: string,
  kind: SymlinkIssueKind,
  detail: string,
  resolvedTarget?: string,
): BrokenSymlinkFinding {
  return {
    path: linkPath,
    link_target: linkTarget,
    kind,
    detail,
    ...(resolvedTarget !== undefined && { resolved_target: resolvedTarget }),
  };
}

/**
 * Classify one symlink. Returns undefined when the link resolves to an
 * existing path inside the allowed roots, which is the healthy case.
 */
async function inspectLink(
  linkPath: string,
): Promise<BrokenSymlinkFinding | undefined> {
  let linkTarget: string;
  try {
    linkTarget = await fs.readlink(linkPath);
  } catch (error) {
    // ENOENT means the link itself vanished mid-walk. Nothing to report.
    if (!isErrnoException(error) || error.code !== "ENOENT") {
      logger.debug(`Unreadable symlink ${linkPath}`, { error });
    }
    return undefined;
  }

  const absoluteTarget = path.resolve(path.dirname(linkPath), linkTarget);

  let resolved: { resolvedPath: string; exists: boolean };
  try {
    resolved = await resolveExistingAncestor(absoluteTarget);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ELOOP") {
      return finding(
        linkPath,
        linkTarget,
        CIRCULAR,
        "Link chain loops back on itself and cannot be resolved",
      );
    }
    logger.debug(`Unresolvable symlink target ${linkPath}`, { error });
    return finding(
      linkPath,
      linkTarget,
      "dangling",
      "Target could not be resolved",
    );
  }

  if (!resolved.exists) {
    return finding(
      linkPath,
      linkTarget,
      "dangling",
      "Target does not exist",
      resolved.resolvedPath,
    );
  }

  if (!isPathInAllowedDirectories(resolved.resolvedPath)) {
    return finding(
      linkPath,
      linkTarget,
      "escapes_allowed_roots",
      "Target resolves outside the allowed directories",
      resolved.resolvedPath,
    );
  }

  return undefined;
}

/**
 * Report broken and escaping symlinks under `directory`.
 *
 * Real subdirectories are descended into; symlinked directories are audited as
 * links and never entered. Before each descent the child's canonical path is
 * re-resolved and checked against the root, because a subdirectory can be
 * swapped for a symlink between the listing and the descent and the name we
 * hold no longer names what it pointed at.
 */
export async function auditSymlinks(
  directory: string,
): Promise<BrokenSymlinkResult> {
  const findings: BrokenSymlinkFinding[] = [];
  const visited = new Set<string>();
  let scanned = 0;
  let truncated = false;

  // Canonical root every descent must stay under.
  let rootReal: string;
  try {
    rootReal = (await resolveExistingAncestor(directory)).resolvedPath;
  } catch {
    rootReal = path.resolve(directory);
  }

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > CONFIG.security.maxScanDepth) {
      truncated = true;
      return;
    }

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
      if (!isErrnoException(error) || error.code !== "ENOENT") {
        logger.debug(`Unreadable directory ${dir}`, { error });
      }
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        scanned += 1;
        const result = await inspectLink(fullPath);
        if (result) findings.push(result);
      } else if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
        let childReal: string | undefined;
        try {
          const resolved = await resolveExistingAncestor(fullPath);
          if (resolved.exists) childReal = resolved.resolvedPath;
        } catch (error) {
          logger.debug(`Unresolvable subdirectory ${fullPath}`, { error });
        }
        // Not under the root any more, so the name we hold does not name what
        // it pointed at. Do not descend. If a link now sits there it is still
        // worth auditing as a link, which is how a swap gets reported.
        if (childReal !== undefined && isSubPath(rootReal, childReal)) {
          await walk(fullPath, depth + 1);
          continue;
        }
        scanned += 1;
        const result = await inspectLink(fullPath);
        if (result) findings.push(result);
      }
    }
  };

  await walk(directory, 0);

  return {
    directory,
    scanned_count: scanned,
    truncated,
    total_count: findings.length,
    dangling_count: findings.filter((f) => f.kind === "dangling").length,
    escaping_count: findings.filter((f) => f.kind === "escapes_allowed_roots")
      .length,
    circular_count: findings.filter((f) => f.kind === CIRCULAR).length,
    findings,
  };
}
