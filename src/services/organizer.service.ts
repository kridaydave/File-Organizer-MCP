/**
 * File Organizer MCP Server v3.2.0
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
}

export interface OrganizeResult {
  statistics: Record<string, number>;
  actions: OrganizeAction[];
  errors: string[];
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
  ): Promise<OrganizationPlan> {
    const moves: OrganizationPlan["moves"] = [];
    const categoryCounts: Record<string, number> = {};
    const skippedFiles: { path: string; reason: string }[] = [];
    const warnings: string[] = [];
    const conflicts: any[] = [];

    // Track planned destinations to handle batch-internal collisions
    const plannedDestinations = new Set<string>();

    for (const file of files) {
      try {
        // Use the stateful categorizer (rules aware)
        const category = this.categorizer.getCategory(file.name);

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
        let conflictResolution: "rename" | "skip" | "overwrite" | undefined;

        // Check conflict with Disk OR Previous Planned Move
        if ((await fileExists(destPath)) || plannedDestinations.has(destPath)) {
          hasConflict = true;

          if (conflictStrategy === "skip") {
            conflictResolution = "skip";
          } else if (conflictStrategy === "overwrite") {
            conflictResolution = "overwrite";
          } else if (conflictStrategy === "overwrite_if_newer") {
            // Note: We can only check disk timestamp, not "planned" file timestamp easily if batch collision.
            // For simplicity, we assume disk check.
            // usage: if file exists on disk, check time.
            // if file is only in plannedDestinations, we treat as standard collision (rename).

            if (await fileExists(destPath)) {
              const srcStat = await fs.stat(file.path);
              const destStat = await fs.stat(destPath);
              if (srcStat.mtime > destStat.mtime) {
                conflictResolution = "overwrite";
              } else {
                conflictResolution = "skip";
              }
            } else {
              // Collision with another file in this batch -> Default to rename to avoid data loss
              conflictResolution = "rename";
            }
          } else {
            conflictResolution = "rename";
          }

          // Perform Rename Simulation if needed
          if (conflictResolution === "rename") {
            const ext = path.extname(destPath);
            const base = path.basename(destPath, ext);
            let counter = 1;
            const originalBase = base;
            // Check against Disk AND Plan
            while (
              (await fileExists(destPath)) ||
              plannedDestinations.has(destPath)
            ) {
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
      } catch (error) {
        skippedFiles.push({
          path: file.path,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
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
    const { dryRun = false, conflictStrategy = "rename" } = options;

    // 1. Generate Plan (Now includes resolved paths)
    const plan = await this.generateOrganizationPlan(
      directory,
      files,
      conflictStrategy,
    );

    if (dryRun) {
      return {
        dry_run: true,
        total_files: plan.moves.length,
        statistics: plan.categoryCounts,
        actions: plan.moves.map((m) => ({
          file: path.basename(m.source),
          from: m.source,
          to: m.destination,
          category: m.category as CategoryName,
        })),
        errors: plan.warnings,
        directory,
      } as any;
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

        // --- Handle Overwrites ---
        if (
          move.conflictResolution === "overwrite" ||
          move.conflictResolution === "overwrite_if_newer"
        ) {
          let backupCreated = false;
          if (await fileExists(targetPath)) {
            // BACKUP EXISTING FILE
            const backupName = `${Date.now()}_overwrite_${path.basename(targetPath)}`;
            overwrittenBackupPath = path.join(backupDir, backupName);
            await fs.rename(targetPath, overwrittenBackupPath);
            backupCreated = true;
          }

          // Now standard move/rename will work as target is gone
          try {
            await fs.rename(sourcePath, targetPath);
          } catch (renameErr) {
            // BUG-003 FIX: Restore backup if rename fails
            if (backupCreated && overwrittenBackupPath) {
              try {
                await fs.rename(overwrittenBackupPath, targetPath);
              } catch (restoreErr) {
                const criticalMsg = `CRITICAL: Failed to restore backup for ${targetPath}. Original may be lost. Error: ${(restoreErr as Error).message}`;
                errors.push(criticalMsg);
                logger.error(criticalMsg);
              }
            }
            throw renameErr;
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
              try {
                // Try atomic rename first (atomic operation on same filesystem)
                await fs.rename(sourcePath, effectivePath);
                success = true;
                finalDest = effectivePath;
              } catch (renameErr: any) {
                if (renameErr.code === "EXDEV") {
                  // Cross-device move required - use copy-unlink with rollback on failure
                  try {
                    await fs.copyFile(
                      sourcePath,
                      effectivePath,
                      constants.COPYFILE_EXCL,
                    );
                    // Copy succeeded - now unlink source (if this fails, rollback the copy)
                    try {
                      await fs.unlink(sourcePath);
                      success = true;
                      finalDest = effectivePath;
                    } catch (unlinkErr) {
                      // CRITICAL: Unlink failed - rollback by deleting the copied file
                      logger.error(
                        `Failed to unlink source ${sourcePath} after cross-device copy. Rolling back.`,
                      );
                      try {
                        await fs.unlink(effectivePath);
                        logger.info(
                          `Successfully rolled back copied file ${effectivePath}`,
                        );
                      } catch (rollbackErr) {
                        const criticalMsg = `CRITICAL: Failed to rollback ${effectivePath} after failed source unlink. Both files may exist.`;
                        logger.error(criticalMsg);
                        errors.push(criticalMsg);
                      }
                      throw unlinkErr;
                    }
                  } catch (copyErr: any) {
                    if (copyErr.code === "EEXIST") {
                      // Race condition - file appeared during rename/copy
                      retryCount++;
                      effectivePath = path.join(
                        destDir,
                        `${sourceBaseName}_${retryCount}${sourceExt}`,
                      );
                      logger.debug(
                        `Race condition for ${sourcePath}, retrying as ${effectivePath}`,
                      );
                    } else {
                      throw copyErr;
                    }
                  }
                } else if (renameErr.code === "EEXIST") {
                  // Race condition - file appeared during rename
                  retryCount++;
                  effectivePath = path.join(
                    destDir,
                    `${sourceBaseName}_${retryCount}${sourceExt}`,
                  );
                  logger.debug(
                    `Race condition for ${sourcePath}, retrying as ${effectivePath}`,
                  );
                } else {
                  // Unexpected error during rename
                  logger.error(
                    `Unexpected error during atomic move of ${sourcePath}: ${renameErr.message}`,
                  );
                  throw renameErr;
                }
              }
            }

            if (!success) {
              throw new Error(
                `Failed to move ${sourcePath} after 100 retries due to race conditions.`,
              );
            }
          } else {
            // RACE CONDITION FIX: Use atomic rename instead of copy-unlink
            // If EXDEV (cross-device), use copy-unlink with rollback on failure
            try {
              // Try atomic rename first (truly atomic on same filesystem)
              await fs.rename(sourcePath, targetPath);
              finalDest = targetPath;
            } catch (renameErr: any) {
              if (renameErr.code === "EXDEV") {
                // Cross-device move - fallback to copy-unlink with rollback
                try {
                  await fs.copyFile(
                    sourcePath,
                    targetPath,
                    constants.COPYFILE_EXCL,
                  );
                  // Copy succeeded - attempt to unlink source with rollback on failure
                  try {
                    await fs.unlink(sourcePath);
                    finalDest = targetPath;
                  } catch (unlinkErr) {
                    // CRITICAL: Rollback the copy if unlink fails to prevent data duplication
                    logger.error(
                      `Failed to unlink source ${sourcePath} after cross-device copy. Rolling back.`,
                    );
                    try {
                      await fs.unlink(targetPath);
                      logger.info(`Successfully rolled back ${targetPath}`);
                    } catch (rollbackErr) {
                      errors.push(
                        `CRITICAL: Failed to rollback ${targetPath}. Both files may exist.`,
                      );
                    }
                    throw unlinkErr;
                  }
                } catch (copyErr: any) {
                  if (copyErr.code === "EEXIST") {
                    throw new Error(
                      `Destination ${targetPath} unexpectedly exists (Race Condition).`,
                    );
                  }
                  throw copyErr;
                }
              } else if (renameErr.code === "EEXIST") {
                throw new Error(
                  `Destination ${targetPath} unexpectedly exists (Race Condition).`,
                );
              } else {
                throw renameErr;
              }
            }
          }
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
      } catch (error) {
        const msg = `Failed to move ${move.source}: ${(error as Error).message}`;
        errors.push(msg);
        logger.error(msg);
      }
    }

    // 3. Save Manifest if any actions occurred
    if (rollbackActions.length > 0) {
      try {
        await rollbackService.createManifest(
          `Organization of ${directory} (${rollbackActions.length} files)`,
          rollbackActions,
        );
      } catch (manifestErr) {
        const msg = `Failed to create rollback manifest: ${(manifestErr as Error).message}`;
        errors.push(msg);
        logger.error(msg);
      }
    }

    return {
      statistics: plan.categoryCounts,
      actions: actionsPerformed,
      errors,
    };
  }

  private async cleanupEmptyFolders(
    directory: string,
    stats: Record<string, number>,
  ): Promise<void> {
    // Implementation kept for compatibility
  }
}
