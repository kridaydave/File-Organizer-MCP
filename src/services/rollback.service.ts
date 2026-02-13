/**
 * File Organizer MCP Server v3.2.0
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

function isValidPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== "string") return false;
  // Prevent path traversal attacks
  const resolved = path.resolve(filePath);
  const cwd = process.cwd();
  // Allow paths within cwd or temp directories
  return resolved.startsWith(cwd) || resolved.startsWith(os.tmpdir());
}

export class RollbackService {
  private storageDir: string;

  constructor() {
    // Store manifests in .agent/rollbacks or similar if possible,
    // but for this MCP, let's store in a hidden directory in the workspace or temp?
    // Let's use `.file-organizer-rollbacks` in the CWD (User's workspace root usually).
    this.storageDir = path.join(process.cwd(), ".file-organizer-rollbacks");
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
    const manifest: RollbackManifest = {
      id,
      timestamp: Date.now(),
      description,
      actions,
    };

    const filePath = path.join(this.storageDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));

    logger.info(`Created rollback manifest: ${id} (${actions.length} actions)`);
    return id;
  }

  /**
   * List available rollbacks
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
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Reverse actions: Undo last action first
    const reverseActions = [...manifest.actions].reverse();

    for (const action of reverseActions) {
      try {
        // Validate paths before operations
        if (action.originalPath && !isValidPath(action.originalPath)) {
          throw new Error(`Invalid original path: ${action.originalPath}`);
        }
        if (action.currentPath && !isValidPath(action.currentPath)) {
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
          }

          results.success++;
        } else if (action.type === "copy" && action.currentPath) {
          // Undo Copy: Delete the copied file (currentPath)
          try {
            await fs.access(action.currentPath);
            await fs.unlink(action.currentPath);
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
          results.success++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to undo ${action.type} for ${action.originalPath}: ${(error as Error).message}`,
        );
      }
    }

    // Cleanup manifest to prevent re-running
    try {
      await fs.unlink(filePath);
    } catch (e) {
      // Throwing is better here to warn the user that the manifest is still there
      // and might be re-runnable (risky).
      throw new Error(
        `Rollback completed but failed to delete manifest ${manifestId}: ${(e as Error).message}`,
      );
    }

    return results;
  }
}
