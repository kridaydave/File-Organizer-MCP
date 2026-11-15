/**
 * Config — per-directory verdicts for configured allowed roots
 *
 * loadCustomAllowedDirs() throws away every reason a directory was rejected and
 * returns only the survivors, which is why nothing could tell a user their
 * config had a typo. This module is the single place that decides whether one
 * configured directory is usable, and the loader filters through it so the
 * gate and the doctor report can never drift apart.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { getAlwaysBlockedPatterns, isExternalVolumePath } from "./security.js";
import { isSubPath } from "../../utils/file-utils.js";

export type AllowedDirRejection =
  | "missing"
  | "not_a_directory"
  | "symlink"
  | "path_traversal"
  | "null_byte"
  | "outside_home"
  | "external_volume_not_allowed"
  | "non_string";

export interface AllowedDirVerdict {
  /** The string exactly as the user wrote it in config.json. */
  configured: string;
  /** Absolute path with `~` expanded, for display only. */
  resolved: string;
  exists: boolean;
  isDirectory: boolean;
  symlink: boolean;
  /** False when loadCustomAllowedDirs() would drop this directory. */
  accepted: boolean;
  rejection?: AllowedDirRejection;
  /** True when the always-blocked pattern list rejects the resolved path. */
  blockedByPolicy: boolean;
}

function expandUserDir(dir: string): string {
  return dir.startsWith("~") ? path.join(os.homedir(), dir.slice(1)) : dir;
}

export function inspectAllowedDir(
  dir: unknown,
  allowExternalVolumes: boolean,
): AllowedDirVerdict {
  if (typeof dir !== "string") {
    return {
      configured: String(dir),
      resolved: String(dir),
      exists: false,
      isDirectory: false,
      symlink: false,
      accepted: false,
      rejection: "non_string",
      blockedByPolicy: false,
    };
  }
  const expanded = expandUserDir(dir);
  const resolved = path.resolve(expanded);
  const blockedPatterns = getAlwaysBlockedPatterns();
  const blockedByPolicy = blockedPatterns.some((pattern) =>
    pattern.test(resolved),
  );

  const verdict: AllowedDirVerdict = {
    configured: dir,
    resolved,
    exists: false,
    isDirectory: false,
    symlink: false,
    accepted: false,
    blockedByPolicy,
  };

  if (expanded.includes("\0")) {
    verdict.rejection = "null_byte";
    return verdict;
  }
  if (expanded.includes("..")) {
    verdict.rejection = "path_traversal";
    return verdict;
  }

  // Walk every ancestor step and note whether any of them is a symlink.
  // lstatSync on the final component alone misses a linked parent.
  //
  // Being reached through a link is not itself a rejection: on macOS /var is a
  // link to /private/var, and a machine whose temp root is a link would have
  // every configured directory under it refused. What matters is where the link
  // leads, and the containment checks below judge that on the canonical path.
  // The flag is still recorded, because the doctor report should be able to say
  // it.
  let current = resolved;
  const root = path.parse(current).root;
  while (current !== root) {
    try {
      const linkStat = fs.lstatSync(current);
      if (linkStat.isSymbolicLink()) {
        verdict.symlink = true;
        break;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    current = path.dirname(current);
  }

  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(expanded);
  } catch {
    verdict.rejection = "missing";
    return verdict;
  }

  verdict.exists = true;
  verdict.isDirectory = stats.isDirectory();
  if (stats.isSymbolicLink()) {
    verdict.symlink = true;
    verdict.rejection = "symlink";
    return verdict;
  }
  if (!stats.isDirectory()) {
    verdict.rejection = "not_a_directory";
    return verdict;
  }

  let realResolved: string;
  try {
    realResolved = fs.realpathSync(expanded);
  } catch {
    realResolved = resolved;
  }
  // Canonicalise both sides before asking whether one contains the other. The
  // home directory can be reached through a link too, the same way the temp root
  // can, and comparing a real path against a typed one answers "outside home"
  // for a directory that is plainly inside it.
  let realHome: string;
  try {
    realHome = fs.realpathSync(os.homedir());
  } catch {
    realHome = os.homedir();
  }
  const insideHome =
    isSubPath(realHome, realResolved) || isSubPath(os.homedir(), resolved);
  const externalVolume = isExternalVolumePath(realResolved);
  if (!insideHome) {
    if (!(allowExternalVolumes && externalVolume)) {
      verdict.rejection = externalVolume
        ? "external_volume_not_allowed"
        : "outside_home";
      return verdict;
    }
  }

  verdict.accepted = true;
  return verdict;
}

export function inspectAllowedDirs(
  dirs: readonly unknown[],
  allowExternalVolumes: boolean,
): AllowedDirVerdict[] {
  return dirs.map((dir) => inspectAllowedDir(dir, allowExternalVolumes));
}
