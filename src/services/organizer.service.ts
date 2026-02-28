/**
 * File Organizer MCP Server v3.4.1
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
import { CATEGORIES } from "../constants.js";
import { fileExists } from "../utils/file-utils.js";
import { logger } from "../utils/logger.js";
import { isErrnoException } from "../utils/error-handler.js";
import { CategorizerService } from "./categorizer.service.js";
import { RollbackService } from "./rollback.service.js";
import { PathValidatorService } from "./path-validator.service.js";
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
    let hasOverwrites = false;

    // Check if any move needs overwrite backup
    if (
      plan.moves.some(
        (m) =>
          m.conflictResolution === "overwrite" ||
          m.conflictResolution === "overwrite_if_newer",
      )
    ) {
      await fs.mkdir(backupDir, { recursive: true });
      hasOverwrites = true;
    }

    for (const move of plan.moves) {
      if (move.hasConflict && move.conflictResolution === "skip") {
        continue;
      }

      // Check for Windows reserved names to avoid security errors on non-Windows platforms (or hard errors on Windows)
      const windowsReservedRegex =
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

      // Check source filename (with extension - "CON.txt" is also invalid)
      const sourceBase = path.basename(move.source);
      if (windowsReservedRegex.test(sourceBase)) {
        const msg = `Skipped reserved Windows filename: ${move.source}`;
        logger.warn(msg);
        continue;
      }

      // Check destination filename
      const destBase = path.basename(move.destination);
      if (windowsReservedRegex.test(destBase)) {
        const msg = `Skipped reserved Windows filename in destination: ${move.destination}`;
        logger.warn(msg);
        continue;
      }

      try {
        await fs.mkdir(path.dirname(move.destination), { recursive: true });

        const targetPath = move.destination;
        const sourcePath = move.source;

        let finalDest = targetPath;
        let overwrittenBackupPath: string | undefined;
        let skipped = false;

        // --- Handle Overwrites (overwrite, overwrite_if_newer) ---
        if (
          move.conflictResolution === "overwrite" ||
          move.conflictResolution === "overwrite_if_newer"
        ) {
          // TOCTOU-FIX: Handle overwrite_if_newer at execution time
          // We check timestamps at execution (not planning) to get accurate info
          if (move.conflictResolution === "overwrite_if_newer") {
            try {
              const destStat = await fs.stat(targetPath);
              const srcStat = await fs.stat(sourcePath);
              if (srcStat.mtime < destStat.mtime) {
                // Source is not newer - skip this file
                const msg = `Skipped ${sourcePath}: destination is newer`;
                logger.info(msg);
                errors.push(msg);
                continue;
              }
            } catch (statErr: unknown) {
              if (isErrnoException(statErr) && statErr.code === "ENOENT") {
                // Destination doesn't exist - proceed with move (no overwrite needed)
                logger.debug(
                  `Destination ${targetPath} does not exist, proceeding with move`,
                );
              } else {
                throw statErr;
              }
            }
          }

          // Check if destination exists and needs backup
          // TOCTOU-FIX: Don't pre-check - attempt operation and handle errors
          // This avoids race window between check and rename
          try {
            // First try to rename (will fail if destination exists)
            await fs.rename(sourcePath, targetPath);
            // Success - no overwrite needed
          } catch (renameErr: unknown) {
            if (isErrnoException(renameErr) && renameErr.code === "EEXIST") {
              // Destination exists - need to handle overwrite
              const backupName = `${Date.now()}_overwrite_${path.basename(targetPath)}`;
              overwrittenBackupPath = path.join(backupDir, backupName);

              try {
                // Backup existing file
                await fs.rename(targetPath, overwrittenBackupPath);
                // Now retry the original move
                await fs.rename(sourcePath, targetPath);
              } catch (backupErr: unknown) {
                // Restore backup if secondary operation fails
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
        }
        // --- Handle Safe Moves (No Overwrite Intended) ---
        else {
          // Logic:
          // 1. If strategy is 'rename', we already computed a unique name in Plan.
          //    But race condition might mean someone took it.
          // 2. We use atomic COPYFILE_EXCL to ensure we don't clobber.

          if (move.conflictResolution === "rename") {
            // Extract the original filename from the source file
            const sourceExt = path.extname(sourcePath);
            const sourceBaseName = path.basename(sourcePath, sourceExt);
            const destDir = path.dirname(targetPath);

            // Extract the counter from the planned targetPath to continue from there
            // e.g., if plan gave us "test_1.txt", start retrying from counter=2
            let startCounter = 1;
            const plannedBaseName = path.basename(
              targetPath,
              path.extname(targetPath),
            );
            const counterMatch = plannedBaseName.match(/_(\d+)$/);
            if (counterMatch && counterMatch[1]) {
              startCounter = parseInt(counterMatch[1], 10) + 1;
            }

            let success = false;
            let retryCount = startCounter - 1; // Will increment to startCounter on first EEXIST
            let effectivePath = targetPath;

            while (!success && retryCount < 100) {
              // HIGH-001 FIX: Validate source file integrity before each retry attempt
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
                // Atomic COPY with COPYFILE_EXCL to prevent overwrites
                await fs.copyFile(
                  sourcePath,
                  effectivePath,
                  constants.COPYFILE_EXCL,
                );
                copySucceeded = true;

                // HIGH-001 FIX: Delete Source after successful copy (with robust cleanup)
                try {
                  await fs.unlink(sourcePath);
                  success = true;
                  finalDest = effectivePath;
                } catch (unlinkErr) {
                  // HIGH-001 FIX: If unlink fails, source file may be in inconsistent state
                  // Do NOT retry - this is a critical error
                  const cleanupMsg = `Failed to unlink source ${sourcePath} after copy. Source file may be in inconsistent state.`;
                  logger.error(cleanupMsg);

                  try {
                    await fs.unlink(effectivePath);
                    logger.info(
                      `Successfully cleaned up copied file ${effectivePath}`,
                    );
                  } catch (cleanupErr) {
                    // Cleanup failed - log critical error with both file paths
                    const criticalMsg = `CRITICAL: Failed to cleanup copied file ${effectivePath} after failed source unlink. Manual intervention may be required.`;
                    logger.error(criticalMsg);
                    errors.push(criticalMsg);
                  }

                  // HIGH-001 FIX: Categorize unlink errors as critical - don't retry
                  const errMessage =
                    unlinkErr instanceof Error
                      ? unlinkErr.message
                      : String(unlinkErr);
                  throw new Error(
                    `CRITICAL: Source file ${sourcePath} unlink failed after successful copy. ` +
                      `Source file integrity compromised. Error: ${errMessage}`,
                  );
                }
              } catch (err: unknown) {
                // HIGH-001 FIX: Distinguish between copy errors and unlink errors
                // Only retry on EEXIST errors from copy operation
                // NOTE: Use isErrnoException instead of instanceof Error to handle cross-realm errors (Jest VM modules)
                if (
                  !copySucceeded &&
                  isErrnoException(err) &&
                  err.code === "EEXIST"
                ) {
                  // Race condition hit during copy! Increment counter and try again
                  retryCount++;
                  // Use consistent naming: originalname_1.ext, originalname_2.ext, etc.
                  effectivePath = path.join(
                    destDir,
                    `${sourceBaseName}_${retryCount}${sourceExt}`,
                  );
                  logger.debug(
                    `Race condition detected for ${sourcePath}, retrying as ${effectivePath}`,
                  );
                } else if (copySucceeded) {
                  // HIGH-001 FIX: Unlink failed - source compromised, do not retry
                  logger.error(
                    `Unlink failed after successful copy for ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`,
                  );
                  throw err;
                } else {
                  // Unexpected error during copy - log and rethrow
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
          } else {
            // TOCTOU-FIX: Handle disk conflicts at execution time when no batch collision was detected
            // Use the conflictStrategy to resolve the conflict
            const sourceExt = path.extname(sourcePath);
            const sourceBaseName = path.basename(sourcePath, sourceExt);
            const destDir = path.dirname(targetPath);

            // Extract counter from planned path if available
            let startCounter = 0;
            const plannedBaseName = path.basename(
              targetPath,
              path.extname(targetPath),
            );
            const counterMatch = plannedBaseName.match(/_(\d+)$/);
            if (counterMatch && counterMatch[1]) {
              startCounter = parseInt(counterMatch[1], 10) + 1;
            }

            let success = false;
            let retryCount = startCounter - 1;
            let effectivePath = targetPath;

            // Apply conflict strategy at execution time (act-then-handle-error pattern)
            while (!success && !skipped && retryCount < 100) {
              try {
                // Atomic COPY with COPYFILE_EXCL to prevent overwrites
                await fs.copyFile(
                  sourcePath,
                  effectivePath,
                  constants.COPYFILE_EXCL,
                );

                // Delete source after successful copy
                try {
                  await fs.unlink(sourcePath);
                  success = true;
                  finalDest = effectivePath;
                } catch (unlinkErr) {
                  // Cleanup copied file if unlink fails
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
                  // Race condition: destination file exists, apply conflict strategy
                  if (move.conflictResolution === "skip") {
                    // Skip this file - don't move it
                    const msg = `Skipped ${sourcePath}: destination ${effectivePath} already exists`;
                    logger.info(msg);
                    errors.push(msg);
                    skipped = true; // Mark as skipped
                    success = true; // Exit the loop
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
          }
        }

        // Don't add to actions if file was skipped
        if (skipped) {
          continue;
        }

        actionsPerformed.push({
          file: path.basename(sourcePath),
          from: sourcePath,
          to: finalDest,
          category: move.category as CategoryName,
        });

        rollbackActions.push({
          type: "move",
          originalPath: sourcePath,
          currentPath: finalDest,
          overwrittenBackupPath: overwrittenBackupPath,
          timestamp: Date.now(),
        });

        // HIGH-002 FIX: Save manifest incrementally after each successful operation
        // This ensures partial successes can be rolled back if a later operation fails
        try {
          await rollbackService.createManifest(
            `Organization of ${directory} (${rollbackActions.length} files)`,
            [...rollbackActions], // Create a copy to ensure we capture current state
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
}
