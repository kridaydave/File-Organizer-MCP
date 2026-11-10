/**
 * File Organizer MCP Server v5.0.0
 * Rollback Service
 *
 * Manages operation manifests and performs undo operations.
 */

import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import type { RollbackManifest, RollbackAction } from "../../types.js";
import { fileExists } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import { CONFIG } from "../../config.js";
import { getRollbackDirectory } from "../../core/config/paths.js";
import { PathValidatorService } from "../../services/path-validator.service.js";
import { manifestIntegrityService } from "./manifest-integrity.js";
import { safeAtomicMove } from "../io/atomic-move.js";

const ROLLBACK_LOCK_FILE = ".rollback.lock";
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = 60 * 60 * 1000; // 1 hour - never steal from active holder; rely on token check

export class RollbackService {
  private storageDir: string;
  private pathValidator: PathValidatorService;
  private lockFilePath: string;
  private currentLockToken: string | null = null;

  constructor(storageDir: string = getRollbackDirectory()) {
    this.storageDir = storageDir;
    this.lockFilePath = path.join(this.storageDir, ROLLBACK_LOCK_FILE);
    // Do not restrict rollback paths to CWD. Manifests may reference any
    // directory that was permitted at organize-time (e.g. Downloads, Desktop).
    // Security is enforced by manifest HMAC integrity and the global
    // path-security whitelist (Layer 4.5) inside PathValidatorService.
    this.pathValidator = new PathValidatorService();
  }

  private async ensureStorage(): Promise<void> {
    if (!(await fileExists(this.storageDir))) {
      await this.migrateLegacyStorage();
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  private async tryAcquireLock(): Promise<boolean> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      const stat = await fs.stat(this.lockFilePath).catch(() => null);

      if (stat) {
        const lockAge = Date.now() - stat.mtimeMs;
        if (lockAge > LOCK_STALE_MS) {
          logger.warn("Stale rollback lock detected, removing");
          await fs.unlink(this.lockFilePath).catch(() => null);
        } else {
          // Lock is held by someone else and is fresh (alive)
          return false;
        }
      }

      const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
      try {
        await fs.writeFile(this.lockFilePath, token, {
          flag: "wx",
        });
        this.currentLockToken = token;
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  private async acquireLock(): Promise<void> {
    const start = Date.now();
    const staleDeadline = start + LOCK_STALE_MS;

    while (true) {
      const held = await this.tryAcquireLock();
      if (held) return;

      // Check if lock still exists and is fresh (held by active process)
      try {
        const stat = await fs.stat(this.lockFilePath).catch(() => null);
        if (stat) {
          const lockAge = Date.now() - stat.mtimeMs;
          if (lockAge > LOCK_STALE_MS) {
            // Should be stolen by tryAcquireLock above
            continue;
          }
          // Lock is held by active process - wait for it to finish (release)
          if (Date.now() - start > 600000) { // 10 minutes max wait
            throw new Error("History lock timeout — another writer is stuck");
          }
          await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
          continue;
        } else {
          // Lock was released, try to acquire again
          await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
          continue;
        }
      } catch {
        if (Date.now() - start > 600000) {
          throw new Error("History lock timeout — another writer is stuck");
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
        continue;
      }
    }
  }

  private async checkLock(): Promise<void> {
    if (!this.currentLockToken) {
      throw new Error(
        "Lost the manifest lock — another process reclaimed the rollback directory while this operation was still running, so it stopped before touching another file",
      );
    }
    try {
      const content = await fs
        .readFile(this.lockFilePath, "utf-8")
        .catch(() => null);
      if (content !== this.currentLockToken) {
        throw new Error(
          "Lost the manifest lock — another process reclaimed the rollback directory while this operation was still running, so it stopped before touching another file",
        );
      }
      // Keep lock alive by updating mtime
      try {
        const now = new Date();
        await fs.utimes(this.lockFilePath, now, now);
      } catch {
        // ignore
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Lost the manifest lock")
      ) {
        throw error;
      }
      throw new Error(
        "Lost the manifest lock — another process reclaimed the rollback directory while this operation was still running, so it stopped before touching another file",
        { cause: error },
      );
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      if (this.currentLockToken) {
        const content = await fs
          .readFile(this.lockFilePath, "utf-8")
          .catch(() => null);
        if (content === this.currentLockToken) {
          await fs.unlink(this.lockFilePath).catch(() => null);
        }
        this.currentLockToken = null;
      } else {
        await fs.unlink(this.lockFilePath).catch(() => null);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * One-time carry-over of manifests from the legacy cwd-based location.
   * Without it, undo silently loses history after this change (or whenever
   * the server's launch directory differs from the last run).
   */
  private async migrateLegacyStorage(): Promise<void> {
    if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID) return;

    const legacyDir = path.join(process.cwd(), ".file-organizer-rollbacks");
    try {
      const entries = await fs.readdir(legacyDir);
      await fs.mkdir(this.storageDir, { recursive: true });
      for (const entry of entries.filter((f) => f.endsWith(".json"))) {
        const target = path.join(this.storageDir, entry);
        if (!(await fileExists(target))) {
          await fs.copyFile(path.join(legacyDir, entry), target);
        }
      }
      if (entries.length > 0) {
        logger.info(`Migrated rollback manifests from ${legacyDir}`);
      }
    } catch {
      // No legacy storage — nothing to migrate.
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
   */
  async rollback(
    manifestId: string,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    await this.acquireLock();
    try {
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
          { cause: error },
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
          await this.checkLock();
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
            try {
              await fs.access(action.currentPath);
            } catch {
              throw new Error(`Current file not found: ${action.currentPath}`);
            }

            await fs.mkdir(path.dirname(action.originalPath), {
              recursive: true,
            });

            try {
              await safeAtomicMove(action.currentPath, action.originalPath);
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code === "EEXIST") {
                throw new Error(
                  `Destination already exists, would overwrite: ${action.originalPath}`,
                  { cause: e },
                );
              }
              throw e;
            }

            completedActions.push({
              action,
              stage: "move",
              paths: { from: action.currentPath, to: action.originalPath },
            });

            if (action.overwrittenBackupPath) {
              try {
                await safeAtomicMove(action.overwrittenBackupPath, action.currentPath);
              } catch (e) {
                const err = e as NodeJS.ErrnoException;
                if (err.code === "ENOENT") {
                  results.errors.push(
                    `Critical: Original file backup missing: ${action.overwrittenBackupPath}`,
                  );

                  try {
                    await safeAtomicMove(action.originalPath, action.currentPath);
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
                    { cause: e },
                  );
                }
                throw e;
              }

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
            try {
              await fs.access(action.currentPath);
              await fs.unlink(action.currentPath);
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

            try {
              await fs.copyFile(
                action.backupPath,
                action.originalPath,
                constants.COPYFILE_EXCL,
              );
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
                  { cause: e },
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

        if (completedActions.length > 0) {
          results.errors.push(
            `Attempting recovery: Reverting ${completedActions.length} successfully completed actions`,
          );

          for (const completed of [...completedActions].reverse()) {
            try {
              if (completed.stage === "move") {
                await safeAtomicMove(completed.paths.to, completed.paths.from, { overwrite: true });
                results.errors.push(
                  `Recovered move: Reverted ${completed.paths.to} -> ${completed.paths.from}`,
                );
              } else if (completed.stage === "restore") {
                await safeAtomicMove(completed.paths.to, completed.paths.from, { overwrite: true });
                results.errors.push(
                  `Recovered restore: Reverted ${completed.paths.to} -> ${completed.paths.from}`,
                );
              } else if (completed.stage === "copy") {
                results.errors.push(
                  `Warning: Cannot recover copy operation - file content not available: ${completed.paths.from}`,
                );
              } else if (completed.stage === "delete") {
                await fs.unlink(completed.paths.to);
                results.errors.push(
                  `Recovered delete: Reverted ${completed.paths.to}`,
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

      // Cleanup backups and manifest only if full rollback succeeded
      if (results.failed === 0) {
        for (const completed of completedActions) {
          if (completed.stage === "delete" && completed.paths.from) {
            try {
              await fs.unlink(completed.paths.from);
            } catch {
              // Ignore backup deletion error if already unlinked
            }
          }
        }
        try {
          await fs.unlink(filePath);
        } catch (e) {
          throw new Error(
            `Rollback completed but failed to delete manifest ${manifestId}: ${(e as Error).message}`,
            { cause: e },
          );
        }
      } else {
        results.errors.push(
          `Manifest not deleted: ${manifestId} remains available for retry or manual recovery`,
        );
      }

      if (completedActions.length > 0 && results.failed > 0) {
        results.errors.push(
          `Partial rollback state documented: ${completedActions.length} actions were successfully undone before failures occurred. Recovery attempted.`,
        );
      }

      return results;
    } finally {
      await this.releaseLock();
    }
  }
}
