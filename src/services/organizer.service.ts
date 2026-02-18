/**
 * File Organizer MCP Server v3.4.0
 * Organizer Service
 */

import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import type {
  FileWithSize,
  OrganizeAction,
  CategoryName,
  OrganizationPlan,
  RollbackAction,
} from "../types.js";
import {
  fileExists,
  isWindowsReservedName,
  performAtomicMove,
} from "../utils/file-utils.js";
import { logger } from "../utils/logger.js";
import { isErrnoException } from "../utils/error-handler.js";
import { CategorizerService } from "./categorizer.service.js";
import { RollbackService } from "./rollback.service.js";
import { MetadataService } from "./metadata.service.js";

export type ConflictStrategy =
  | "rename"
  | "skip"
  | "overwrite"
  | "overwrite_if_newer";

export interface OrganizeOptions {
  dryRun?: boolean;
  conflictStrategy?: ConflictStrategy;
  useContentAnalysis?: boolean;
}

export interface OrganizeResult {
  statistics: Record<string, number>;
  actions: OrganizeAction[];
  errors: string[];
  // BUG-003 FIX: Track partial failure information
  errorCount: number;
  successCount: number;
  aborted: boolean;
}

// BUG-003 FIX: Maximum consecutive errors before aborting to prevent endless processing
const MAX_CONSECUTIVE_ERRORS = 10;

interface BatchMoveResult {
  action: OrganizeAction;
  rollbackAction: RollbackAction;
  skipped?: boolean;
}

/**
 * Organizer Service - file organization logic
 */
export class OrganizerService {
  constructor(
    private categorizer: CategorizerService = new CategorizerService(),
    private metadataService: MetadataService = new MetadataService(),
  ) {}

  /**
   * Generate a plan for organization without moving files
   * @param directory - Target directory for organization
   * @param files - Array of files with size information to process
   * @param conflictStrategy - Strategy for handling file name conflicts
   * @param conflictStrategy.rename - Append counter to filename (e.g., file_1.txt)
   * @param conflictStrategy.skip - Skip files with conflicts
   * @param conflictStrategy.overwrite - Replace existing files
   * @param conflictStrategy.overwrite_if_newer - Only overwrite if source is newer
   * @example
   * ```ts
   * const plan = await service.generateOrganizationPlan(
   *   '/downloads',
   *   files,
   *   'rename'
   * );
   * ```
   * @returns Promise<OrganizationPlan> - Organization plan with moves, categoryCounts, skippedFiles tracking, conflicts, and warnings
   */
  async generateOrganizationPlan(
    directory: string,
    files: FileWithSize[],
    conflictStrategy: ConflictStrategy = "rename",
    useContentAnalysis: boolean = false,
  ): Promise<OrganizationPlan> {
    const moves: OrganizationPlan["moves"] = [];
    const categoryCounts: Record<string, number> = {};
    const skippedFiles: { path: string; reason: string }[] = [];
    const warnings: string[] = [];
    const conflicts: Array<{ file: string; reason: string }> = [];

    if (!files || !Array.isArray(files) || files.length === 0) {
      return {
        moves,
        categoryCounts,
        conflicts,
        skippedFiles,
        estimatedDuration: 0,
        warnings,
      };
    }

    // Track planned destinations to handle batch-internal collisions
    const plannedDestinations = new Set<string>();

    // BUG-003 FIX: Track consecutive errors for abort threshold
    let consecutiveErrors = 0;
    let processedCount = 0;

    for (const file of files) {
      // BUG-003 FIX: Check if we've hit the error threshold
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        warnings.push(
          `Aborted after ${MAX_CONSECUTIVE_ERRORS} consecutive errors. ${files.length - processedCount} files remaining unprocessed.`,
        );
        break;
      }

      try {
        // Use the stateful categorizer (rules aware)
        // Pass useContentAnalysis to enable content-based type verification
        const category = await this.categorizer.getCategory(
          file.name,
          useContentAnalysis,
          file.path,
        );

        if (!categoryCounts[category]) categoryCounts[category] = 0;
        categoryCounts[category]++;

        // Get metadata-based subpath (e.g., "2024/02" for images or "Artist/Album" for audio)
        const metadataSubpath = await this.metadataService.getMetadataSubpath(
          file.path,
          category,
        );

        // Build destination path with optional metadata subdirectories
        const destFolder = metadataSubpath
          ? path.join(directory, category, metadataSubpath)
          : path.join(directory, category);
        let destPath = path.join(destFolder, file.name);
        let hasConflict = false;
        const conflictResolution: ConflictStrategy = conflictStrategy;

        // BUG-TOCTOU-FIX: Don't check disk for file existence here - use "act-then-handle-error" pattern
        // Only check against batch-internal collisions (plannedDestinations) since those are guaranteed
        // Disk-based conflicts will be handled at execution time with proper EEXIST error handling
        if (plannedDestinations.has(destPath)) {
          hasConflict = true;

          // Perform Rename Simulation if needed (only against batch collisions)
          if (conflictResolution === "rename") {
            const ext = path.extname(destPath);
            const base = path.basename(destPath, ext);
            let counter = 1;
            const originalBase = base;
            // Only check against planned destinations in batch (not disk)
            while (plannedDestinations.has(destPath)) {
              destPath = path.join(
                destFolder,
                `${originalBase}_${counter}${ext}`,
              );
              counter++;
            }
          }
        }

        if (conflictResolution !== "skip") {
          plannedDestinations.add(destPath);
        }

        moves.push({
          source: file.path,
          destination: destPath, // Resolved path
          category,
          hasConflict,
          conflictResolution,
        });

        // BUG-003 FIX: Reset consecutive errors on success
        consecutiveErrors = 0;
      } catch (error) {
        skippedFiles.push({
          path: file.path,
          reason: error instanceof Error ? error.message : String(error),
        });

        // BUG-003 FIX: Increment consecutive error count
        consecutiveErrors++;
      }

      processedCount++;
    }

    return {
      moves,
      categoryCounts,
      conflicts,
      skippedFiles,
      estimatedDuration: files.length * 0.05,
      warnings,
    };
  }

  /**
   * Organize files into category folders
   */
  async organize(
    directory: string,
    files: FileWithSize[],
    options: OrganizeOptions = {},
  ): Promise<OrganizeResult> {
    const {
      dryRun = false,
      conflictStrategy = "rename",
      useContentAnalysis = false,
    } = options;

    // 1. Generate Plan (Now includes resolved paths)
    const plan = await this.generateOrganizationPlan(
      directory,
      files,
      conflictStrategy,
      useContentAnalysis,
    );

    if (dryRun) {
      return {
        statistics: plan.categoryCounts,
        actions: plan.moves.map((m) => ({
          file: path.basename(m.source),
          from: m.source,
          to: m.destination,
          category: m.category as CategoryName,
        })),
        errors: plan.warnings,
        errorCount: 0,
        successCount: plan.moves.length,
        aborted: false,
      };
    }

    // 2. Execute
    const rollbackActions: RollbackAction[] = [];
    const actionsPerformed: OrganizeAction[] = [];
    const errors: string[] = [];

    const rollbackService = new RollbackService();

    // 2. Prepare Backup Directory for Overwrites
    const backupDir = path.join(process.cwd(), ".file-organizer-backups");

    // Check if any move needs overwrite backup
    if (
      plan.moves.some(
        (m) =>
          m.conflictResolution === "overwrite" ||
          m.conflictResolution === "overwrite_if_newer",
      )
    ) {
      await fs.mkdir(backupDir, { recursive: true });
    }

    for (const move of plan.moves) {
      if (move.hasConflict && move.conflictResolution === "skip") {
        continue;
      }

      if (isWindowsReservedName(move.source)) {
        const msg = `Skipped reserved Windows filename: ${move.source}`;
        logger.warn(msg);
        continue;
      }

      if (isWindowsReservedName(move.destination)) {
        const msg = `Skipped reserved Windows filename in destination: ${move.destination}`;
        logger.warn(msg);
        continue;
      }

      try {
        const result = await this.executeBatchMove(move, backupDir, errors);

        if (result === null) {
          continue;
        }

        actionsPerformed.push(result.action);
        rollbackActions.push(result.rollbackAction);

        // HIGH-002 FIX: Save manifest incrementally after each successful operation
        // This ensures partial successes can be rolled back if a later operation fails
        try {
          await rollbackService.createManifest(
            `Organization of ${directory} (${rollbackActions.length} files)`,
            [...rollbackActions],
          );
        } catch (manifestErr) {
          const manifestError =
            manifestErr instanceof Error
              ? manifestErr
              : new Error(String(manifestErr));
          const msg = `Failed to update rollback manifest: ${manifestError.message}`;
          errors.push(msg);
          logger.error(msg, {
            operation: "manifest_update",
            directory,
            rollbackCount: rollbackActions.length,
            error: manifestError.message,
            errorStack: manifestError.stack,
          });
        }
      } catch (error) {
        const msg = `Failed to move ${move.source}: ${(error as Error).message}`;
        errors.push(msg);
        logger.error(msg);
      }
    }

    // BUG-003 FIX: Calculate error and success counts for result
    const errorCount = errors.length;
    const successCount = actionsPerformed.length;
    const aborted = plan.warnings.some((w) => w.includes("Aborted after"));

    return {
      statistics: plan.categoryCounts,
      actions: actionsPerformed,
      errors,
      errorCount,
      successCount,
      aborted,
    };
  }

  /**
   * Execute a single file move operation with conflict handling
   * @param move - The move operation to execute
   * @param backupDir - Directory for backup files during overwrites
   * @returns BatchMoveResult with action and rollback info, or null if skipped
   * @private
   */
  private async executeBatchMove(
    move: OrganizationPlan["moves"][0],
    backupDir: string,
    errors: string[],
  ): Promise<BatchMoveResult | null> {
    await fs.mkdir(path.dirname(move.destination), { recursive: true });

    const targetPath = move.destination;
    const sourcePath = move.source;

    let finalDest = targetPath;
    let overwrittenBackupPath: string | undefined;

    if (
      move.conflictResolution === "overwrite" ||
      move.conflictResolution === "overwrite_if_newer"
    ) {
      if (move.conflictResolution === "overwrite_if_newer") {
        try {
          const destStat = await fs.stat(targetPath);
          const srcStat = await fs.stat(sourcePath);
          if (srcStat.mtime < destStat.mtime) {
            const msg = `Skipped ${sourcePath}: destination is newer`;
            logger.info(msg);
            errors.push(msg);
            return null;
          }
        } catch (statErr: unknown) {
          if (isErrnoException(statErr) && statErr.code === "ENOENT") {
            logger.debug(
              `Destination ${targetPath} does not exist, proceeding with move`,
            );
          } else {
            throw statErr;
          }
        }
      }

      try {
        await fs.rename(sourcePath, targetPath);
      } catch (renameErr: unknown) {
        if (isErrnoException(renameErr) && renameErr.code === "EEXIST") {
          const backupName = `${Date.now()}_overwrite_${path.basename(targetPath)}`;
          overwrittenBackupPath = path.join(backupDir, backupName);

          try {
            await fs.rename(targetPath, overwrittenBackupPath);
            await fs.rename(sourcePath, targetPath);
          } catch (backupErr: unknown) {
            try {
              await fs.rename(overwrittenBackupPath!, targetPath);
            } catch (restoreErr) {
              const criticalMsg = `CRITICAL: Failed to restore backup for ${targetPath}. Original may be lost. Error: ${(restoreErr as Error).message}`;
              errors.push(criticalMsg);
              logger.error(criticalMsg);
            }
            throw backupErr;
          }
        } else {
          throw renameErr;
        }
      }
    } else {
      if (move.conflictResolution === "rename") {
        const result = await this.executeRenameMove(
          sourcePath,
          targetPath,
          errors,
        );
        if (result === null) {
          return null;
        }
        finalDest = result;
      } else {
        const result = await this.executeDiskConflictMove(
          sourcePath,
          targetPath,
          move.conflictResolution ?? "rename",
          errors,
        );
        if (result.skipped) {
          return null;
        }
        finalDest = result.finalDest;
      }
    }

    return {
      action: {
        file: path.basename(sourcePath),
        from: sourcePath,
        to: finalDest,
        category: move.category as CategoryName,
      },
      rollbackAction: {
        type: "move",
        originalPath: sourcePath,
        currentPath: finalDest,
        overwrittenBackupPath: overwrittenBackupPath,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Execute a move with rename conflict resolution (retry loop)
   * @private
   */
  private async executeRenameMove(
    sourcePath: string,
    targetPath: string,
    errors: string[],
  ): Promise<string | null> {
    const sourceExt = path.extname(sourcePath);
    const sourceBaseName = path.basename(sourcePath, sourceExt);
    const destDir = path.dirname(targetPath);

    let startCounter = 1;
    const plannedBaseName = path.basename(targetPath, path.extname(targetPath));
    const counterMatch = plannedBaseName.match(/_(\d+)$/);
    if (counterMatch && counterMatch[1]) {
      startCounter = parseInt(counterMatch[1], 10) + 1;
    }

    let success = false;
    let retryCount = startCounter - 1;
    let effectivePath = targetPath;

    while (!success && retryCount < 100) {
      try {
        await fs.access(sourcePath, constants.F_OK);
      } catch (accessErr) {
        logger.error(
          `Source file ${sourcePath} not accessible before retry attempt ${retryCount + 1}. File may be corrupted or partially processed.`,
        );
        throw new Error(
          `Source file integrity check failed for ${sourcePath}: File not accessible before retry`,
        );
      }

      let copySucceeded = false;

      try {
        await fs.copyFile(sourcePath, effectivePath, constants.COPYFILE_EXCL);
        copySucceeded = true;

        try {
          await fs.unlink(sourcePath);
          success = true;
        } catch (unlinkErr) {
          const cleanupMsg = `Failed to unlink source ${sourcePath} after copy. Source file may be in inconsistent state.`;
          logger.error(cleanupMsg);

          try {
            await fs.unlink(effectivePath);
            logger.info(`Successfully cleaned up copied file ${effectivePath}`);
          } catch (cleanupErr) {
            const criticalMsg = `CRITICAL: Failed to cleanup copied file ${effectivePath} after failed source unlink. Manual intervention may be required.`;
            logger.error(criticalMsg);
            errors.push(criticalMsg);
          }

          const errMessage =
            unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr);
          throw new Error(
            `CRITICAL: Source file ${sourcePath} unlink failed after successful copy. Source file integrity compromised. Error: ${errMessage}`,
          );
        }
      } catch (err: unknown) {
        if (!copySucceeded && isErrnoException(err) && err.code === "EEXIST") {
          retryCount++;
          effectivePath = path.join(
            destDir,
            `${sourceBaseName}_${retryCount}${sourceExt}`,
          );
          logger.debug(
            `Race condition detected for ${sourcePath}, retrying as ${effectivePath}`,
          );
        } else if (copySucceeded) {
          logger.error(
            `Unlink failed after successful copy for ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`,
          );
          throw err;
        } else {
          logger.error(
            `Unexpected error during atomic move of ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`,
          );
          throw err;
        }
      }
    }

    if (!success) {
      throw new Error(
        `Failed to move ${sourcePath} after 100 retries due to race conditions.`,
      );
    }

    return effectivePath;
  }

  /**
   * Execute a move handling disk conflicts with skip or rename fallback
   * @private
   */
  private async executeDiskConflictMove(
    sourcePath: string,
    targetPath: string,
    conflictResolution: ConflictStrategy,
    errors: string[],
  ): Promise<{ finalDest: string; skipped: boolean }> {
    const sourceExt = path.extname(sourcePath);
    const sourceBaseName = path.basename(sourcePath, sourceExt);
    const destDir = path.dirname(targetPath);

    let startCounter = 0;
    const plannedBaseName = path.basename(targetPath, path.extname(targetPath));
    const counterMatch = plannedBaseName.match(/_(\d+)$/);
    if (counterMatch && counterMatch[1]) {
      startCounter = parseInt(counterMatch[1], 10) + 1;
    }

    let success = false;
    let skipped = false;
    let retryCount = startCounter - 1;
    let effectivePath = targetPath;
    let finalDest = targetPath;

    while (!success && !skipped && retryCount < 100) {
      try {
        await fs.copyFile(sourcePath, effectivePath, constants.COPYFILE_EXCL);

        try {
          await fs.unlink(sourcePath);
          success = true;
          finalDest = effectivePath;
        } catch (unlinkErr) {
          logger.error(
            `Failed to unlink source ${sourcePath}. Cleaning up copy.`,
          );
          try {
            await fs.unlink(effectivePath);
          } catch (cleanupErr) {
            errors.push(
              `CRITICAL: Failed to cleanup ${effectivePath} after failed source unlink`,
            );
          }
          throw unlinkErr;
        }
      } catch (err: unknown) {
        if (isErrnoException(err) && err.code === "EEXIST") {
          if (conflictResolution === "skip") {
            const msg = `Skipped ${sourcePath}: destination ${effectivePath} already exists`;
            logger.info(msg);
            errors.push(msg);
            skipped = true;
            success = true;
          } else {
            retryCount++;
            effectivePath = path.join(
              destDir,
              `${sourceBaseName}_${retryCount}${sourceExt}`,
            );
            logger.debug(
              `Disk conflict detected for ${sourcePath}, retrying as ${effectivePath}`,
            );
          }
        } else {
          throw err;
        }
      }
    }

    if (!success) {
      throw new Error(
        `Failed to move ${sourcePath} after 100 retries due to race conditions.`,
      );
    }

    return { finalDest, skipped };
  }
}
