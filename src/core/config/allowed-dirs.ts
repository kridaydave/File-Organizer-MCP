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
  | "external_volume_not_allowed";

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
  dir: string,
  allowExternalVolumes: boolean,
): AllowedDirVerdict {
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

  const insideHome = isSubPath(os.homedir(), resolved);
  const externalVolume = isExternalVolumePath(resolved);
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
  dirs: readonly string[],
  allowExternalVolumes: boolean,
): AllowedDirVerdict[] {
  return dirs.map((dir) => inspectAllowedDir(dir, allowExternalVolumes));
}
