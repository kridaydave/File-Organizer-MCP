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

import {
  ValidationError,
  type RollbackManifest,
  type RollbackAction,
} from "../../types.js";
import { fileExists } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import { CONFIG } from "../../config.js";
import { getRollbackDirectory } from "../../core/config/paths.js";
import { PathValidatorService } from "../../services/path-validator.service.js";
import {
  manifestIntegrityService,
  manifestActionTarget,
  MANIFEST_ID_PATTERN,
} from "./manifest-integrity.js";
import { safeAtomicMove } from "../io/atomic-move.js";
import { HashCalculatorService } from "../hash/hasher.js";

/**
 * How much file content one manifest may re-read to fill in per-file hashes.
 *
 * A digest is only obtainable by reading every byte of the file, so recording
 * hashes for an unbounded organize would add a second full pass over the whole
 * batch and make organize's cost scale with the directory. The budget caps that
 * pass: files are hashed in manifest order until the cap is spent and the rest
 * are left unrecorded. A manifest is therefore only partially verifiable, which
 * `verifyManifestFiles` reports as `unverifiable` — never as "unchanged".
 */
const DEFAULT_HASH_BUDGET_BYTES = 32 * 1024 * 1024;

/**
 * Every path a manifest's undo will read, write, or delete.
 *
 * A move reads `currentPath` and writes `originalPath`, and may also move the
 * overwritten file back from `overwrittenBackupPath`. A copy undo deletes
 * `currentPath`, and a delete undo writes `originalPath` from `backupPath`.
 * All of them count: a manifest sharing any one of them with a newer manifest
 * can collide with that manifest's undo.
 *
 * This is a filesystem comparison, so `path` is the right tool here. The
 * contract string in this file is the manifest id, never a normalized path.
 */
function rollbackTouchedPaths(manifest: RollbackManifest): Set<string> {
  const touched = new Set<string>();
  for (const action of manifest.actions) {
    for (const candidate of [
      action.originalPath,
      action.currentPath,
      action.backupPath,
      action.overwrittenBackupPath,
    ]) {
      if (typeof candidate === "string" && candidate.length > 0) {
        touched.add(normalizeForCompare(candidate));
      }
    }
  }
  return touched;
}

/**
 * Normalize a path for equality. Case matters on a case-sensitive filesystem
 * and does not on Windows or a default macOS volume, so folding unconditionally
 * would refuse a legitimate undo on Linux while ignoring it would miss a real
 * collision on Windows.
 */
function normalizeForCompare(candidate: string): string {
  const normalized = path.resolve(candidate);
  return process.platform === "win32" || process.platform === "darwin"
    ? normalized.toLowerCase()
    : normalized;
}

/**
 * How many paths two manifests both touch.
 *
 * Exported so the overlap rule is testable on its own, without a rollback
 * directory, and so a reader of the guard can see it is a pure comparison.
 */
/** One newer manifest that stands in the way of undoing a given one. */
interface NewerConflict {
  id: string;
  /** How many paths the two manifests both touch. */
  overlappingPaths: number;
  /** False when the manifest's own signature did not verify. */
  verified: boolean;
}

export function overlappingPathCount(
  target: RollbackManifest,
  newer: RollbackManifest,
): number {
  const newerPaths = rollbackTouchedPaths(newer);
  let shared = 0;
  for (const candidate of rollbackTouchedPaths(target)) {
    if (newerPaths.has(candidate)) shared++;
  }
  return shared;
}

/** How much of a batch `createManifest` spends on content hashes. */
export interface ManifestIntegrityOptions {
  /**
   * Content bytes this manifest may read to record hashes. Pass 0 to record
   * none, e.g. for a caller that is already paying for its own hashing.
   */
  hashBudgetBytes?: number;
}

export class RollbackService {
  private storageDir: string;
  private pathValidator: PathValidatorService;

  constructor(storageDir: string = getRollbackDirectory()) {
    this.storageDir = storageDir;
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
    options: ManifestIntegrityOptions = {},
  ): Promise<string> {
    await this.ensureStorage();

    const id = randomUUID();
    const timestamp = Date.now();
    const recordedActions = await this.recordContentHashes(
      actions,
      options.hashBudgetBytes ?? DEFAULT_HASH_BUDGET_BYTES,
    );
    const hash = manifestIntegrityService.computeHash(
      recordedActions,
      timestamp,
    );

    const manifest: RollbackManifest = {
      id,
      timestamp,
      description,
      actions: recordedActions,
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
   * Copy the actions, adding a content digest to each one whose file could be
   * read inside the remaining budget.
   *
   * The caller's actions are left untouched: a manifest that could only hash
   * part of its batch is still a valid manifest, and an action that cannot be
   * hashed simply carries no digest, which is how the format already reads.
   */
  private async recordContentHashes(
    actions: RollbackAction[],
    budgetBytes: number,
  ): Promise<RollbackAction[]> {
    if (budgetBytes <= 0 || actions.length === 0) return actions;

    const hasher = new HashCalculatorService();
    const recorded: RollbackAction[] = [];
    let remaining = budgetBytes;

    for (const action of actions) {
      const target = manifestActionTarget(action);
      if (!target) {
        recorded.push(action);
        continue;
      }

      let size: number;
      try {
        size = (await fs.stat(target)).size;
      } catch {
        // Gone or unreadable: there is no digest to record, and that must not
        // fail the operation that the manifest is being written for.
        recorded.push(action);
        continue;
      }
      // Skipping rather than stopping keeps one large file from spending the
      // whole budget while smaller ones behind it go unrecorded.
      if (size > remaining) {
        recorded.push(action);
        continue;
      }

      let hashed: RollbackAction = action;
      try {
        const identity = await hasher.calculateContentIdentity(target);
        hashed = {
          ...action,
          contentHash: identity.digest,
          hashMethod: identity.method,
        };
      } catch (e) {
        logger.warn(
          `No content hash recorded for one rollback action: ${(e as Error).message}`,
        );
      }
      remaining -= size;
      recorded.push(hashed);
    }

    return recorded;
  }

  /**
   * Read one manifest and confirm it is the one this machine wrote.
   *
   * Verification is not optional: the paths inside a manifest are read by
   * callers, so an unauthenticated manifest file must never be trusted. A
   * caller that has no use for the actions gets the ids from `listManifests`
   * instead.
   */
  async getManifest(manifestId: string): Promise<RollbackManifest> {
    if (!MANIFEST_ID_PATTERN.test(manifestId)) {
      throw new ValidationError(`Invalid manifest ID format: ${manifestId}`);
    }

    await this.ensureStorage();
    const filePath = path.join(this.storageDir, `${manifestId}.json`);

    if (!(await fileExists(filePath))) {
      throw new ValidationError(`Manifest ${manifestId} not found`);
    }

    let manifest: RollbackManifest;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      manifest = JSON.parse(content);
    } catch (error) {
      throw new ValidationError(
        `Failed to parse manifest ${manifestId}: ${(error as Error).message}`,
        { field: "manifest_id" },
      );
    }

    const verification = manifestIntegrityService.verifyManifest(manifest);
    if (!verification.valid) {
      throw new ValidationError(
        `Manifest integrity check failed: ${verification.error}`,
        { field: "manifest_id" },
      );
    }

    return manifest;
  }

  /**
   * Delete a spent manifest. Quarantine calls this once a restore has landed,
   * so a finished quarantine no longer offers itself as a restore target the
   * same way rollback() retires the manifest it just applied.
   */
  async removeManifest(manifestId: string): Promise<void> {
    if (!MANIFEST_ID_PATTERN.test(manifestId)) {
      throw new ValidationError(`Invalid manifest ID format: ${manifestId}`);
    }

    await this.unlinkManifestFile(manifestId);
  }

  /**
   * Remove the manifest file from storage. Callers are responsible for having
   * resolved the id safely first.
   */
  private async unlinkManifestFile(manifestId: string): Promise<void> {
    await fs.unlink(path.join(this.storageDir, `${manifestId}.json`));
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
          const parsed: unknown = JSON.parse(content);
          if (typeof parsed !== "object" || parsed === null) {
            logger.error(
              `Skipping rollback manifest ${file}: not a manifest object`,
            );
            continue;
          }
          manifests.push(parsed as RollbackManifest);
        } catch (e) {
          logger.error(`Failed to parse rollback manifest ${file}: ${e}`);
        }
      }
    }

    return manifests.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Manifests newer than `target` that touch a path `target` also touches.
   *
   * Rolling back out of order is the one case the per-action guards cannot
   * make safe: `safeAtomicMove` refuses EEXIST and delete-restore uses
   * COPYFILE_EXCL, so the batch dies at the collision and the best-effort
   * recovery is the only thing between the user and a half-undone tree. A newer
   * manifest that moved the same path is exactly that collision, and it is
   * knowable before anything is touched, so it is checked before anything is
   * touched.
   *
   * A candidate whose signature does not verify counts as a conflict rather
   * than being ignored. Ignoring it would let a forged manifest hide a real
   * overlap, and the failure mode of not ignoring it is a refused undo, not a
   * damaged one.
   */
  private async findNewerConflicts(
    target: RollbackManifest,
  ): Promise<NewerConflict[]> {
    const candidates = (await this.listManifests()).filter(
      (m) => m.id !== target.id && m.timestamp > target.timestamp,
    );
    if (candidates.length === 0) return [];

    const conflicts: NewerConflict[] = [];
    for (const manifest of candidates) {
      const verified = manifestIntegrityService.verifyManifest(manifest).valid;
      const overlappingPaths = overlappingPathCount(target, manifest);
      if (!verified || overlappingPaths > 0) {
        conflicts.push({ id: manifest.id, overlappingPaths, verified });
      }
    }
    return conflicts;
  }

  /**
   * The refusal a `rollback()` that would collide returns instead of starting.
   *
   * Refusing rather than warning is the deliberate choice. The alternative, a
   * warning, leaves the user with exactly the mid-batch EEXIST throw that
   * exists today: some files already moved, then a best-effort recovery that
   * itself uses `overwrite: true`. A refusal costs the user one undo they could
   * not have completed safely anyway, and it costs them zero files. The way
   * through is to undo the newer operation first, which is the order the
   * filesystem already implies.
   */
  private conflictRefusal(
    manifestId: string,
    conflicts: NewerConflict[],
  ): { success: number; failed: number; errors: string[] } {
    const details = conflicts
      .map((c) =>
        c.verified
          ? `${c.id} (${c.overlappingPaths} shared path(s))`
          : `${c.id} (integrity check failed, so its paths cannot be ruled out)`,
      )
      .join(", ");

    return {
      success: 0,
      failed: 1,
      errors: [
        `Refused to undo manifest ${manifestId}: a newer operation already touched at least one of the same paths, so undoing this one out of order would collide with it partway through. Undo the newer operation first, then retry. Conflicting manifests: ${details}`,
        `Manifest not deleted: ${manifestId} remains available for retry or manual recovery`,
      ],
    };
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
    await this.ensureStorage();
    // getManifest validates the id as a UUID before it is joined onto the
    // storage directory, so filePath is only built from an already-safe value.
    const manifest = await this.getManifest(manifestId);
    const filePath = path.join(this.storageDir, `${manifestId}.json`);

    // Selective undo makes out-of-order rollback reachable, so the overlap that
    // a later operation creates is checked here, before the first move. The
    // newest manifest has nothing newer than it, so the common case is
    // unaffected by this read.
    const conflicts = await this.findNewerConflicts(manifest);
    if (conflicts.length > 0) {
      return this.conflictRefusal(manifestId, conflicts);
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

          // TOCTOU-safe: Use safeAtomicMove (handles exclusive copy, case-only renames, and unlink cleanup)
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

          // Track successful move for potential recovery
          completedActions.push({
            action,
            stage: "move",
            paths: { from: action.currentPath, to: action.originalPath },
          });

          // 2. Restore the overwritten file if it exists
          if (action.overwrittenBackupPath) {
            // TOCTOU-safe: Try restore directly, handle errors
            try {
              await safeAtomicMove(action.overwrittenBackupPath, action.currentPath);
            } catch (e) {
              const err = e as NodeJS.ErrnoException;
              if (err.code === "ENOENT") {
                results.errors.push(
                  `Critical: Original file backup missing: ${action.overwrittenBackupPath}`,
                );

                // Attempt to recover: revert the move operation
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

          // TOCTOU-safe: Try restore directly with COPYFILE_EXCL to prevent overwriting destination
          try {
            await fs.copyFile(
              action.backupPath,
              action.originalPath,
              constants.COPYFILE_EXCL,
            );
            // Do not delete the backup file until the entire rollback completes successfully
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
              await safeAtomicMove(completed.paths.to, completed.paths.from, { overwrite: true });
              results.errors.push(
                `Recovered move: Reverted ${completed.paths.to} -> ${completed.paths.from}`,
              );
            } else if (completed.stage === "restore") {
              // Revert the restore: move back from current to backup location
              await safeAtomicMove(completed.paths.to, completed.paths.from, { overwrite: true });
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
              // Revert delete undo: delete the restored file (backup is still preserved on disk)
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

    // Document partial state if some actions completed before failures
    if (completedActions.length > 0 && results.failed > 0) {
      results.errors.push(
        `Partial rollback state documented: ${completedActions.length} actions were successfully undone before failures occurred. Recovery attempted.`,
      );
    }

    return results;
  }
}
