/**
 * Quarantine Service — reversible set-aside for flagged files.
 *
 * A quarantine is not a second move implementation. Every move goes through
 * safeAtomicMove, the same primitive the organizer moves through, and every
 * batch is written as a RollbackService manifest, the same manifest
 * undo_last_operation reads. Restoring runs that primitive in reverse and
 * writes a manifest of its own, so the restore is reversible too: undoing a
 * restore puts the files back in quarantine.
 *
 * The quarantine root is a hidden child of the source directory
 * (getQuarantineDirectory). That keeps it inside the allow-list grant the
 * source already has, so validateStrictPath accepts it without any extra
 * configuration — and an explicitly configured root is validated the same way,
 * so it cannot escape the allowed directories.
 *
 * Nothing is deleted here. A quarantined file stays readable on disk; the only
 * thing quarantine changes is where it lives.
 */

import path from "path";

import type {
  QuarantineItem,
  QuarantineResult,
  RestoreResult,
  RollbackAction,
  RollbackManifest,
} from "../../types.js";
import { ValidationError } from "../../types.js";
import { fileExists, isSubPath } from "../../utils/file-utils.js";
import { isErrnoException, sanitizeErrorMessage } from "../../utils/error-handler.js";
import { logger } from "../../utils/logger.js";
import {
  PathValidatorService,
  validateStrictPath,
} from "../../services/path-validator.service.js";
import { safeAtomicMove } from "../io/atomic-move.js";
import { getQuarantineDirectory } from "../config/paths.js";
import { manifestIntegrityService } from "./manifest-integrity.js";
import { RollbackService } from "./rollback.js";

/**
 * Manifest descriptions are how a quarantine manifest is told apart from an
 * organize or restore one — the same place the organizer already records what
 * a manifest is for.
 */
export const QUARANTINE_DESCRIPTION_PREFIX = "Quarantine of ";
const RESTORE_DESCRIPTION_PREFIX = "Restore of quarantine ";

/** UUID shape, matching the check RollbackService.rollback applies. */
const MANIFEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How many names to try before giving up on one file. The plan already avoids
 * names taken in this batch and names on disk; this covers the case where the
 * disk changes between planning and moving.
 */
const MAX_NAME_ATTEMPTS = 100;

export interface QuarantineFilesOptions {
  /** Directory the files are taken from. Validated before anything moves. */
  directory: string;
  /** File paths inside `directory`. Validated before anything moves. */
  files: string[];
  /**
   * Where to put them. Defaults to getQuarantineDirectory(directory) and is
   * validated with the same gate either way.
   */
  quarantineDir?: string;
  /** Plan only. Defaults to true so a bare call writes nothing. */
  dryRun?: boolean;
  /** Caller's note, recorded in the manifest description. */
  reason?: string;
}

export interface RestoreQuarantineOptions {
  /** Quarantine manifest to restore. Defaults to the most recent one. */
  quarantineId?: string;
  /** Plan only. Defaults to true so a bare call writes nothing. */
  dryRun?: boolean;
}

export class QuarantineService {
  constructor(
    private readonly rollback: RollbackService = new RollbackService(),
    private readonly pathValidator: PathValidatorService = new PathValidatorService(),
  ) {}

  /**
   * Move flagged files into the quarantine directory.
   *
   * Every path is validated before the first move, so a batch containing one
   * forbidden path moves nothing at all rather than half of itself.
   */
  async quarantine(options: QuarantineFilesOptions): Promise<QuarantineResult> {
    const { files, reason } = options;
    const dryRun = options.dryRun ?? true;

    const sourceDir = await validateStrictPath(options.directory);
    const targetDir = await validateStrictPath(
      options.quarantineDir ?? getQuarantineDirectory(sourceDir),
    );

    const plan: QuarantineItem[] = [];
    const skipped: { path: string; reason: string }[] = [];
    const claimed = new Set<string>();
    const seen = new Set<string>();

    for (const file of files) {
      const source = await validateStrictPath(file);
      if (!isSubPath(sourceDir, source)) {
        throw new ValidationError(
          "Every file must live inside the directory being quarantined",
        );
      }
      // A file already in quarantine has nowhere to go; asking again would
      // otherwise nest it one level deeper per call.
      if (isSubPath(targetDir, source)) {
        skipped.push({
          path: source,
          reason: "Already in the quarantine directory",
        });
        continue;
      }
      if (seen.has(source)) {
        skipped.push({ path: source, reason: "Listed more than once" });
        continue;
      }
      seen.add(source);

      const name = path.basename(source);
      const destination = await this.nextFreeDestination(
        targetDir,
        name,
        claimed,
      );
      claimed.add(path.basename(destination));
      plan.push({ file: name, from: source, to: destination });
    }

    const result: QuarantineResult = {
      directory: sourceDir,
      quarantine_dir: targetDir,
      dry_run: dryRun,
      requested: files.length,
      planned: plan.length,
      quarantined: 0,
      items: plan,
      skipped,
      errors: [],
      ...(reason !== undefined && { reason }),
    };

    if (dryRun) {
      return result;
    }

    const moved: QuarantineItem[] = [];
    const rollbackActions: RollbackAction[] = [];

    for (const item of plan) {
      try {
        const destination = await this.moveInto(item, targetDir, claimed);
        moved.push({ ...item, to: destination });
        rollbackActions.push({
          type: "move",
          originalPath: item.from,
          currentPath: destination,
          timestamp: Date.now(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(
          sanitizeErrorMessage(`Failed to quarantine ${item.file}: ${message}`),
        );
        logger.error(`Failed to quarantine ${item.file}: ${message}`);
      }
    }

    if (rollbackActions.length > 0) {
      try {
        result.manifest_id = await this.rollback.createManifest(
          `${QUARANTINE_DESCRIPTION_PREFIX}${sourceDir} (${rollbackActions.length} files)${
            reason ? `: ${reason}` : ""
          }`,
          rollbackActions,
        );
      } catch (error) {
        // The files already moved. Say so plainly rather than reporting a
        // clean batch the user cannot undo.
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(
          sanitizeErrorMessage(
            `Quarantine manifest was not written, so these moves cannot be undone: ${message}`,
          ),
        );
      }
    }

    result.items = moved;
    result.quarantined = moved.length;
    return result;
  }

  /**
   * Put quarantined files back where they came from.
   *
   * Reads the quarantine manifest, verifies its integrity, then moves each
   * file back to the path the manifest recorded as its origin. A restore that
   * lands writes its own manifest, so undo_last_operation can put the files
   * back into quarantine. The quarantine manifest is deleted once the restore
   * is complete, the same way rollback retires a spent manifest.
   */
  async restore(
    options: RestoreQuarantineOptions = {},
  ): Promise<RestoreResult> {
    const dryRun = options.dryRun ?? true;
    const manifestId = options.quarantineId ?? (await this.latestQuarantineId());
    if (!manifestId) {
      throw new ValidationError("No quarantine manifest is available to restore");
    }

    const manifest = await this.readManifest(manifestId);
    const moves = manifest.actions.filter(
      (action) => action.type === "move" && action.currentPath,
    );

    const result: RestoreResult = {
      dry_run: dryRun,
      quarantine_id: manifestId,
      requested: moves.length,
      planned: moves.length,
      restored: 0,
      items: moves.map((action) => ({
        file: path.basename(action.currentPath as string),
        from: action.currentPath as string,
        to: action.originalPath,
      })),
      errors: [],
    };

    // Paths come off disk, so re-check them against the allow-list rather
    // than trusting the manifest to still describe reachable paths. A refused
    // file is dropped from the plan, not just reported: leaving it in would
    // move it on the apply pass.
    const allowed = result.items.filter((item) => {
      if (
        this.pathValidator.isPathAllowed(item.from) &&
        this.pathValidator.isPathAllowed(item.to)
      ) {
        return true;
      }
      result.errors.push(
        `Refused to restore ${item.file}: a recorded path is outside the allowed directories`,
      );
      return false;
    });

    if (dryRun) {
      result.items = allowed;
      result.planned = allowed.length;
      return result;
    }

    const restored: QuarantineItem[] = [];
    const rollbackActions: RollbackAction[] = [];

    for (const item of allowed) {
      try {
        await safeAtomicMove(item.from, item.to);
        restored.push(item);
        rollbackActions.push({
          type: "move",
          originalPath: item.from,
          currentPath: item.to,
          timestamp: Date.now(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(
          sanitizeErrorMessage(`Failed to restore ${item.file}: ${message}`),
        );
        logger.error(`Failed to restore ${item.file}: ${message}`);
      }
    }

    if (rollbackActions.length > 0) {
      try {
        result.manifest_id = await this.rollback.createManifest(
          `${RESTORE_DESCRIPTION_PREFIX}${manifestId} (${rollbackActions.length} files)`,
          rollbackActions,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(
          sanitizeErrorMessage(
            `Restore manifest was not written, so this restore cannot be undone: ${message}`,
          ),
        );
      }
      // Retire the spent manifest only on a clean restore, the same rule
      // rollback applies. A partial restore keeps it so the untouched files
      // are still described somewhere and the restore can be retried.
      if (result.errors.length === 0) {
        await this.rollback.removeManifest(manifestId);
      }
    }

    result.items = restored;
    result.planned = restored.length;
    result.restored = restored.length;
    return result;
  }

  /**
   * Move one planned file, re-picking the name if the disk disagrees with the
   * plan. safeAtomicMove never overwrites, so EEXIST means "pick another name",
   * not "give up" — two files with the same basename both end up in quarantine.
   */
  private async moveInto(
    item: QuarantineItem,
    targetDir: string,
    claimed: Set<string>,
  ): Promise<string> {
    let destination = item.to;

    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
      try {
        await safeAtomicMove(item.from, destination);
        claimed.add(path.basename(destination));
        return destination;
      } catch (error) {
        if (isErrnoException(error) && error.code === "EEXIST") {
          destination = await this.nextFreeDestination(
            targetDir,
            item.file,
            claimed,
          );
          continue;
        }
        throw error;
      }
    }

    throw new ValidationError(
      `Could not find a free name in the quarantine directory for ${item.file}`,
    );
  }

  /**
   * First destination for `name` that is neither claimed by this batch nor
   * already on disk, appending `_1`, `_2`, ... on collision.
   */
  private async nextFreeDestination(
    targetDir: string,
    name: string,
    claimed: Set<string>,
  ): Promise<string> {
    const extension = path.extname(name);
    const base = path.basename(name, extension);

    for (let counter = 0; counter < MAX_NAME_ATTEMPTS; counter++) {
      const candidateName =
        counter === 0 ? name : `${base}_${counter}${extension}`;
      if (claimed.has(candidateName)) continue;
      const candidate = path.join(targetDir, candidateName);
      if (await fileExists(candidate)) continue;
      return candidate;
    }

    throw new ValidationError(
      `Could not find a free name in the quarantine directory for ${name}`,
    );
  }

  /** Id of the newest quarantine manifest, if there is one. */
  private async latestQuarantineId(): Promise<string | undefined> {
    const manifests = await this.rollback.listManifests();
    return manifests.find((manifest) =>
      manifest.description.startsWith(QUARANTINE_DESCRIPTION_PREFIX),
    )?.id;
  }

  /**
   * Load one manifest by id and check its integrity before any path in it is
   * trusted. listManifests returns newest first.
   */
  private async readManifest(manifestId: string): Promise<RollbackManifest> {
    if (!MANIFEST_ID_PATTERN.test(manifestId)) {
      throw new ValidationError("Invalid quarantine manifest id format");
    }

    const manifests = await this.rollback.listManifests();
    const manifest = manifests.find((candidate) => candidate.id === manifestId);
    if (!manifest) {
      throw new ValidationError(
        `Quarantine manifest ${manifestId} was not found`,
      );
    }

    const verification = manifestIntegrityService.verifyManifest(manifest);
    if (!verification.valid) {
      throw new ValidationError(
        "Quarantine manifest failed its integrity check",
      );
    }

    return manifest;
  }
}

