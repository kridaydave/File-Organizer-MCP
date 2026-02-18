/**
 * File Organizer MCP Server v3.4.0
 * Rollback Service
 *
 * Manages operation manifests and performs undo operations.
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import os from "os";
import type { RollbackManifest, RollbackAction } from "../types.js";
import { fileExists } from "../utils/file-utils.js";
import { logger } from "../utils/logger.js";
import { CONFIG } from "../config.js";
import { PathValidatorService } from "./path-validator.service.js";
import { manifestIntegrityService } from "./manifest-integrity.service.js";

export class RollbackService {
  private storageDir: string;
  private pathValidator: PathValidatorService;

  constructor() {
    this.storageDir = path.join(process.cwd(), ".file-organizer-rollbacks");
    this.pathValidator = new PathValidatorService(process.cwd(), [
      process.cwd(),
      os.tmpdir(),
    ]);
  }

  private async ensureStorage(): Promise<void> {
    if (!(await fileExists(this.storageDir))) {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  /**
   * Create and save a new rollback manifest
   */
  async createManifest(
    description: string,
    actions: RollbackAction[],
  ): Promise<string> {
    await this.ensureStorage();

    const id = randomUUID();
    const timestamp = Date.now();
    const hash = manifestIntegrityService.computeHash(actions, timestamp);

    const manifest: RollbackManifest = {
      id,
      timestamp,
      description,
      actions,
      version: "1.0",
      hash,
    };

    const signature = manifestIntegrityService.computeSignature(manifest);
    manifest.signature = signature;

    const filePath = path.join(this.storageDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));

    logger.info(`Created rollback manifest: ${id} (${actions.length} actions)`);
    return id;
  }

  /**
   * List available rollbacks
   *
   * SECURITY JUSTIFICATION (SEC-001):
   * - storageDir is an internal path constructed in the constructor from process.cwd()
   *   (line 33: path.join(process.cwd(), ".file-organizer-rollbacks"))
   * - Files read are NOT user-provided - they're internal manifest files created by this service
   *   (createManifest method writes JSON files with validated UUID names)
   * - Path validation happens at other layers: storageDir is hardcoded, filenames are filtered
   *   for ".json" extension, and rollback() validates UUID format before reading
   */
  async listManifests(): Promise<RollbackManifest[]> {
    if (!(await fileExists(this.storageDir))) return [];

    const files = await fs.readdir(this.storageDir);
    const manifests: RollbackManifest[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const content = await fs.readFile(
            path.join(this.storageDir, file),
            "utf-8",
          );
          manifests.push(JSON.parse(content));
        } catch (e) {
          logger.error(`Failed to parse rollback manifest ${file}: ${e}`);
        }
      }
    }

    return manifests.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Restore state from a manifest (Undo)
   * @param manifestId - UUID of the manifest to rollback
   * @returns Promise<{ success: number; failed: number; errors: string[] }> - Results object with success count, failed count, and error messages
   * @throws {Error} When manifest ID format is invalid (must be valid UUID format)
   * @throws {Error} When manifest file is not found
   * @throws {Error} When manifest JSON parsing fails
   * @throws {Error} When file path validation fails for security reasons
   *
   * SECURITY JUSTIFICATION (SEC-001):
   * - storageDir is an internal path constructed in the constructor from process.cwd()
   *   (line 33: path.join(process.cwd(), ".file-organizer-rollbacks"))
   * - File read is NOT user-provided - it's an internal manifest file created by this service
   * - Path validation happens at other layers: storageDir is hardcoded, manifestId is validated
   *   as UUID format (line 105-111) before being used to construct the file path
   */
  async rollback(
    manifestId: string,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    // Security: Validate ID format (UUID)
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        manifestId,
      )
    ) {
      throw new Error(`Invalid manifest ID format: ${manifestId}`);
    }

    await this.ensureStorage();
    const filePath = path.join(this.storageDir, `${manifestId}.json`);

    if (!(await fileExists(filePath))) {
      throw new Error(`Manifest ${manifestId} not found`);
    }

    let manifest: RollbackManifest;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      manifest = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Failed to parse manifest ${manifestId}: ${(error as Error).message}`,
      );
    }

    const verification = manifestIntegrityService.verifyManifest(manifest);
    if (!verification.valid) {
      throw new Error(`Manifest integrity check failed: ${verification.error}`);
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Track completed actions for potential rollback recovery
    const completedActions: Array<{
      action: RollbackAction;
      stage: "move" | "restore" | "copy" | "delete";
      paths: { from: string; to: string };
    }> = [];

    // Reverse actions: Undo last action first
    const reverseActions = [...manifest.actions].reverse();

    try {
      for (const action of reverseActions) {
        // Validate paths before operations
        if (
          action.originalPath &&
          !this.pathValidator.isPathAllowed(action.originalPath)
        ) {
          throw new Error(`Invalid original path: ${action.originalPath}`);
        }
        if (
          action.currentPath &&
          !this.pathValidator.isPathAllowed(action.currentPath)
        ) {
          throw new Error(`Invalid current path: ${action.currentPath}`);
        }

        if (
          (action.type === "move" || action.type === "rename") &&
          action.currentPath
        ) {
          // Undo Move/Rename: Move currentPath -> originalPath
          // TOCTOU-safe: Try the operation directly, handle ENOENT
          try {
            await fs.access(action.currentPath);
          } catch {
            throw new Error(`Current file not found: ${action.currentPath}`);
          }

          await fs.mkdir(path.dirname(action.originalPath), {
            recursive: true,
          });

          // TOCTOU-safe: Try rename directly, handle EEXIST
          try {
            await fs.rename(action.currentPath, action.originalPath);
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "EEXIST") {
              throw new Error(
                `Destination already exists, would overwrite: ${action.originalPath}`,
              );
            }
            throw e;
          }

          // Track successful move for potential recovery
          completedActions.push({
            action,
            stage: "move",
            paths: { from: action.currentPath, to: action.originalPath },
          });

          // 2. Restore the overwritten file if it exists
          if (action.overwrittenBackupPath) {
            // TOCTOU-safe: Try rename directly, handle errors
            try {
              await fs.rename(action.overwrittenBackupPath, action.currentPath);
            } catch (e) {
              const err = e as NodeJS.ErrnoException;
              if (err.code === "ENOENT") {
                results.errors.push(
                  `Critical: Original file backup missing: ${action.overwrittenBackupPath}`,
                );

                // Attempt to recover: revert the move operation
                try {
                  await fs.rename(action.originalPath, action.currentPath);
                  results.errors.push(
                    `Recovered: Reverted move for ${action.originalPath} -> ${action.currentPath}`,
                  );
                } catch (recoveryError) {
                  results.errors.push(
                    `CRITICAL: Partial rollback state - file at ${action.originalPath}, expected at ${action.currentPath}. Recovery failed: ${(recoveryError as Error).message}`,
                  );
                }

                results.failed++;
                continue;
              }
              if (err.code === "EEXIST") {
                throw new Error(
                  `Cannot restore backup, destination occupied: ${action.currentPath}`,
                );
              }
              throw e;
            }

            // Track successful restore
            completedActions.push({
              action,
              stage: "restore",
              paths: {
                from: action.overwrittenBackupPath,
                to: action.currentPath,
              },
            });
          }

          results.success++;
        } else if (action.type === "copy" && action.currentPath) {
          // Undo Copy: Delete the copied file (currentPath)
          try {
            await fs.access(action.currentPath);
            await fs.unlink(action.currentPath);
            // Track successful copy undo for potential recovery
            completedActions.push({
              action,
              stage: "copy",
              paths: { from: action.currentPath, to: "" },
            });
            results.success++;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") {
              results.errors.push(
                `File to un-copy not found: ${action.currentPath}`,
              );
              results.failed++;
            } else {
              throw e;
            }
          }
        } else if (action.type === "delete") {
          // Undo Delete: Restore from backup
          if (!action.backupPath) {
            results.failed++;
            results.errors.push(
              `Cannot restore deleted file: no backup path recorded`,
            );
            continue;
          }

          await fs.mkdir(path.dirname(action.originalPath), {
            recursive: true,
          });

          // TOCTOU-safe: Try rename directly, handle errors
          try {
            await fs.rename(action.backupPath, action.originalPath);
            // Track successful delete undo for potential recovery
            completedActions.push({
              action,
              stage: "delete",
              paths: { from: action.backupPath, to: action.originalPath },
            });
            results.success++;
          } catch (e) {
            const err = e as NodeJS.ErrnoException;
            if (err.code === "ENOENT") {
              results.failed++;
              results.errors.push(
                `Cannot restore deleted file. Backup not found: ${action.backupPath}`,
              );
              continue;
            }
            if (err.code === "EEXIST") {
              throw new Error(
                `Cannot restore, destination already exists: ${action.originalPath}`,
              );
            }
            throw e;
          }
        }
      }
    } catch (error) {
      results.failed++;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const actionType =
        error instanceof Error && "action" in error
          ? (error as { action?: { type?: string } }).action?.type || "unknown"
          : "unknown";
      const actionPath =
        error instanceof Error && "action" in error
          ? (error as { action?: { originalPath?: string } }).action
              ?.originalPath || "unknown path"
          : "unknown path";
      results.errors.push(
        `Failed to undo ${actionType} for ${actionPath}: ${errorMessage}`,
      );

      // Attempt to recover already completed actions to restore to original state
      if (completedActions.length > 0) {
        results.errors.push(
          `Attempting recovery: Reverting ${completedActions.length} successfully completed actions`,
        );

        // Reverse the completed actions to restore them in correct order
        for (const completed of [...completedActions].reverse()) {
          try {
            if (completed.stage === "move") {
              // Revert the move: move back from original to current
              await fs.rename(completed.paths.to, completed.paths.from);
              results.errors.push(
                `Recovered move: Reverted ${completed.paths.to} -> ${completed.paths.from}`,
              );
            } else if (completed.stage === "restore") {
              // Revert the restore: move back from current to backup location
              await fs.rename(completed.paths.to, completed.paths.from);
              results.errors.push(
                `Recovered restore: Reverted ${completed.paths.to} -> ${completed.paths.from}`,
              );
            } else if (completed.stage === "copy") {
              // Revert copy undo: recreate the copied file (would require backup, but we don't have it)
              // Note: We can't fully recover copy operation undo, since we don't have the file content
              results.errors.push(
                `Warning: Cannot recover copy operation - file content not available: ${completed.paths.from}`,
              );
            } else if (completed.stage === "delete") {
              // Revert delete undo: delete the restored file and move backup back
              await fs.unlink(completed.paths.to);
              await fs.rename(completed.paths.from, completed.paths.to);
              results.errors.push(
                `Recovered delete: Reverted ${completed.paths.to} -> ${completed.paths.from}`,
              );
            }
          } catch (recoveryError) {
            results.errors.push(
              `Recovery failed for ${completed.stage} action: ${(recoveryError as Error).message}`,
            );
          }
        }
      }
    }

    // Cleanup manifest to prevent re-running only if full rollback succeeded
    if (results.failed === 0) {
      try {
        await fs.unlink(filePath);
      } catch (e) {
        throw new Error(
          `Rollback completed but failed to delete manifest ${manifestId}: ${(e as Error).message}`,
        );
      }
    } else {
      results.errors.push(
        `Manifest not deleted: ${manifestId} remains available for retry or manual recovery`,
      );
    }

    // Document partial state if some actions completed before failures
    if (completedActions.length > 0 && results.failed > 0) {
      results.errors.push(
        `Partial rollback state documented: ${completedActions.length} actions were successfully undone before failures occurred. Recovery attempted.`,
      );
    }

    return results;
  }
}
