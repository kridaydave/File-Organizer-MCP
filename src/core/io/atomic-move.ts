/**
 * Centralized Atomic Move Primitive
 *
 * Guarantees data safety invariants:
 * 1. Non-destructive moves with COPYFILE_EXCL to prevent silent overwrites
 * 2. Unlink rollback: if unlinking the source fails, immediately cleans up the destination
 * 3. Cross-device (EXDEV) safe fallback without loading full file into memory
 * 4. Case-only rename detection on case-insensitive filesystems (macOS APFS / Windows NTFS)
 * 5. Returns structured RollbackAction for audit & undo logs
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { isErrnoException } from "../../utils/error-handler.js";
import { logger } from "../../utils/logger.js";
import type { RollbackAction } from "../types/system.js";

const COPYFILE_EXCL = fsSync.constants?.COPYFILE_EXCL ?? 1;

export interface AtomicMoveOptions {
  overwrite?: boolean;
  copyInsteadOfMove?: boolean;
  backupBeforeOverwrite?: (destPath: string) => Promise<string | undefined>;
}

export interface AtomicMoveResult {
  success: boolean;
  sourcePath: string;
  destinationPath: string;
  rollbackAction?: RollbackAction;
}

/**
 * Checks if two paths refer to the same file with different case on a case-insensitive filesystem.
 */
function isCaseOnlyRename(src: string, dest: string): boolean {
  if (path.dirname(src) !== path.dirname(dest)) {
    return false;
  }
  return (
    path.basename(src).toLowerCase() === path.basename(dest).toLowerCase() &&
    path.basename(src) !== path.basename(dest)
  );
}

/**
 * Atomically moves or copies a file from sourcePath to destinationPath.
 */
export async function safeAtomicMove(
  sourcePath: string,
  destinationPath: string,
  options: AtomicMoveOptions = {},
): Promise<AtomicMoveResult> {
  const { overwrite = false, copyInsteadOfMove = false, backupBeforeOverwrite } = options;

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });

  // Handle identity move (source and destination are identical path)
  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    return {
      success: true,
      sourcePath,
      destinationPath,
    };
  }

  // Handle case-only renames on case-insensitive filesystems (e.g. test.txt -> TEST.txt)
  if (isCaseOnlyRename(sourcePath, destinationPath)) {
    // On case-sensitive filesystems a case-colliding name can be a genuinely
    // different file; refuse to clobber it, matching COPYFILE_EXCL semantics.
    // On case-insensitive filesystems lstat(dest) resolves to the source file
    // itself (same inode), so the rename proceeds.
    let collides = false;
    try {
      const [destStat, srcStat] = await Promise.all([
        fs.lstat(destinationPath),
        fs.lstat(sourcePath),
      ]);
      collides = destStat.ino !== srcStat.ino || destStat.dev !== srcStat.dev;
    } catch {
      // Destination not statable (ENOENT) — safe to proceed with the rename.
    }
    if (collides) {
      const eexist = new Error(
        `Destination file already exists: ${path.basename(destinationPath)}`,
      ) as NodeJS.ErrnoException;
      eexist.code = "EEXIST";
      throw eexist;
    }
    const tempIntermediate = `${destinationPath}.tmp-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    await fs.rename(sourcePath, tempIntermediate);
    await fs.rename(tempIntermediate, destinationPath);

    return {
      success: true,
      sourcePath,
      destinationPath,
      rollbackAction: {
        type: "move",
        originalPath: sourcePath,
        currentPath: destinationPath,
        timestamp: Date.now(),
      },
    };
  }

  // If overwrite is requested and destination exists, take a backup first if provided
  let backupPath: string | undefined;
  if (overwrite) {
    try {
      const destStat = await fs.stat(destinationPath);
      if (destStat.isFile() && backupBeforeOverwrite) {
        backupPath = await backupBeforeOverwrite(destinationPath);
      }
      if (destStat.isFile()) {
        await fs.unlink(destinationPath);
      }
    } catch (statErr) {
      if (!isErrnoException(statErr) || statErr.code !== "ENOENT") {
        throw statErr;
      }
    }
  }

  // Attempt atomic COPY with COPYFILE_EXCL to guarantee destination cannot be clobbered
  try {
    await fs.copyFile(sourcePath, destinationPath, COPYFILE_EXCL);
  } catch (copyErr) {
    if (isErrnoException(copyErr) && copyErr.code === "EEXIST" && !overwrite) {
      // Callers (rename/organizer/rollback) branch on errno.code; the message
      // carries only the basename so internal paths never leak into results.
      const eexist = new Error(
        `Destination file already exists: ${path.basename(destinationPath)}`,
        { cause: copyErr },
      ) as NodeJS.ErrnoException;
      eexist.code = "EEXIST";
      throw eexist;
    }
    throw copyErr;
  }

  // If operation is a copy, we are done
  if (copyInsteadOfMove) {
    return {
      success: true,
      sourcePath,
      destinationPath,
      rollbackAction: {
        type: "copy",
        originalPath: sourcePath,
        currentPath: destinationPath,
        timestamp: Date.now(),
      },
    };
  }

  // Operation is a move: unlink the source file with rollback cleanup on failure
  try {
    await fs.unlink(sourcePath);
  } catch (unlinkErr) {
    logger.error(`Failed to unlink source ${sourcePath} after copy. Cleaning up copied destination.`);
    try {
      await fs.unlink(destinationPath);
    } catch (cleanupErr) {
      logger.error(`CRITICAL: Failed to clean up copied destination ${destinationPath} after source unlink failed.`);
    }
    throw unlinkErr;
  }

  return {
    success: true,
    sourcePath,
    destinationPath,
    rollbackAction: {
      type: "move",
      originalPath: sourcePath,
      currentPath: destinationPath,
      timestamp: Date.now(),
      backupPath,
    },
  };
}
