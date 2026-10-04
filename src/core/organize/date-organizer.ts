/**
 * Date Organizer — sorts any file into a date folder (YYYY/MM by default).
 *
 * The plan is the same scan -> categorize -> plan -> move loop the rest of the
 * organize_* tools use, with one difference: the bucket comes from a date
 * instead of a category. Moves go through safeAtomicMove, so a destination can
 * never be silently clobbered, and every performed move is recorded in a
 * rollback manifest.
 *
 * Date resolution, in order of preference:
 * - "exif"  EXIF DateTimeOriginal (CreateDate when DateTimeOriginal is absent).
 *           Only image files carry one; a file without a usable EXIF date has no
 *           date at all and is left where it is, reported in `noDateFiles`.
 * - "auto"  EXIF when present, mtime otherwise. `dateSource` on each move says
 *           which one was used, so a fallback is never silent.
 * - "mtime" filesystem modification time, never reads metadata.
 */

import fs from "fs/promises";
import path from "path";
import type { FileWithSize, RollbackAction } from "../../types.js";
import { MetadataService } from "../../services/metadata/service.js";
import { FileScannerService } from "../scan/scanner.js";
import { RollbackService } from "./rollback.js";
import { safeAtomicMove } from "../io/atomic-move.js";
import { logger } from "../../utils/logger.js";
import { isErrnoException, sanitizeErrorMessage } from "../../utils/error-handler.js";

export type DateSourcePreference = "auto" | "exif" | "mtime";
/** Which date actually decided the folder. */
export type ResolvedDateSource = "exif" | "mtime";
export type DateFolderFormat = "YYYY/MM" | "YYYY/MM/DD" | "YYYY";

export interface DateOrganizeOptions {
  /** Already validated by the caller (validateStrictPath). */
  sourceDir: string;
  /** Already validated by the caller (validateStrictPath). */
  targetDir: string;
  dateFormat?: DateFolderFormat;
  dateSource?: DateSourcePreference;
  recursive?: boolean;
  dryRun?: boolean;
}

export interface DateOrganizeMove {
  /** Base name of the source file. */
  file: string;
  /** Absolute source path, platform-native (a real filesystem path). */
  from: string;
  /** Absolute destination actually used, platform-native (a real filesystem path). */
  to: string;
  /**
   * Logical destination folder label, always forward-slashed ("2024/03"),
   * identical on every platform. Not a filesystem path — see `to`.
   */
  folder: string;
  /** ISO timestamp of the instant that chose the folder. */
  date: string;
  /**
   * `YYYY-MM-DD` in the calendar `folder` was derived from, so a caller can
   * check the folder without re-deriving the timezone.
   */
  calendarDate: string;
  dateSource: ResolvedDateSource;
}

export interface DateOrganizeResult {
  success: boolean;
  organizedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  moves: DateOrganizeMove[];
  /** Files left untouched because no usable date was available. */
  noDateFiles: string[];
  /**
   * Logical folder label (forward-slashed, relative to targetDir) -> file names
   * placed in it. Keys are the same strings as `moves[].folder`.
   */
  structure: Record<string, string[]>;
  manifestId?: string;
  /**
   * False unless this run's moves are recorded in a manifest — so false after a
   * dry run, and false when a manifest could not be written after moves happened.
   */
  undoAvailable: boolean;
}

const MAX_COLLISION_RETRIES = 100;

/** EXIF is UTC-anchored wall clock; mtime is a true instant read in local time. */
interface ResolvedDate {
  date: Date;
  source: ResolvedDateSource;
  /** `YYYY-MM-DD` in the calendar the folder is derived from. */
  calendarDate: string;
}

function calendarParts(
  date: Date,
  utc: boolean,
): { year: string; month: string; day: string } {
  const year = String(utc ? date.getUTCFullYear() : date.getFullYear());
  const month = String((utc ? date.getUTCMonth() : date.getMonth()) + 1).padStart(
    2,
    "0",
  );
  const day = String(utc ? date.getUTCDate() : date.getDate()).padStart(2, "0");
  return { year, month, day };
}

/**
 * One calendar triple feeds both the folder label and `calendarDate`, so the two
 * can never disagree: the reported date always explains the folder.
 */
function resolved(date: Date, source: ResolvedDateSource): ResolvedDate {
  const parts = calendarParts(date, source === "exif");
  return { date, source, calendarDate: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Containment that also holds when `root` is a filesystem root ("/" or "C:\\"). */
function isInside(root: string, candidate: string): boolean {
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate === root || candidate.startsWith(prefix);
}

/** Canonical path of the deepest ancestor of `dir` that exists, or null. */
async function deepestExistingDir(dir: string): Promise<string | null> {
  let current = dir;
  for (;;) {
    const real = await fs.realpath(current).catch(() => null);
    if (real) return real;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export class DateOrganizerService {
  constructor(
    private readonly metadataService: MetadataService = new MetadataService(),
    private readonly rollbackService: RollbackService = new RollbackService(),
  ) {}

  async organize(options: DateOrganizeOptions): Promise<DateOrganizeResult> {
    const dateFormat = options.dateFormat ?? "YYYY/MM";
    const dateSource = options.dateSource ?? "auto";
    const dryRun = options.dryRun ?? false;

    const result: DateOrganizeResult = {
      success: true,
      organizedFiles: 0,
      skippedFiles: 0,
      errors: [],
      moves: [],
      noDateFiles: [],
      structure: {},
      // A dry run moves nothing, so nothing it reports is undoable; saying
      // otherwise would invite an agent to look for a manifest that cannot exist.
      undoAvailable: !dryRun,
    };

    const files = await new FileScannerService().getAllFiles(
      options.sourceDir,
      options.recursive ?? false,
    );
    const targetRoot = path.resolve(options.targetDir);
    const rollbackActions: RollbackAction[] = [];

    for (const file of files) {
      const resolved = await this.resolveDate(file, dateSource);
      if (!resolved) {
        result.skippedFiles++;
        result.noDateFiles.push(file.name);
        continue;
      }

      const folder = this.dateFolder(
        resolved.date,
        dateFormat,
        resolved.source === "exif",
      );
      const destination = this.resolveDestination(targetRoot, folder, file.name);
      if (!destination) {
        result.skippedFiles++;
        result.errors.push({
          file: file.name,
          error: "Unsafe destination path rejected",
        });
        continue;
      }

      const move: DateOrganizeMove = {
        file: file.name,
        from: file.path,
        to: destination,
        folder,
        date: resolved.date.toISOString(),
        calendarDate: resolved.calendarDate,
        dateSource: resolved.source,
      };

      if (dryRun) {
        result.moves.push(move);
        continue;
      }

      try {
        const moved = await this.moveWithCollisionRetry(
          file.path,
          destination,
          targetRoot,
        );
        move.to = moved;
        result.moves.push(move);
        if (moved !== destination) {
          logger.info("Date-organized onto a de-duplicated name", {
            file: file.name,
            folder,
          });
        }
        rollbackActions.push({
          type: "move",
          originalPath: file.path,
          currentPath: moved,
          timestamp: Date.now(),
        });
      } catch (error) {
        result.skippedFiles++;
        result.errors.push({
          file: file.name,
          error: sanitizeErrorMessage(
            error instanceof Error ? error : String(error),
          ),
        });
        logger.error("Failed to date-organize file", error, { file: file.name });
      }
    }

    if (!dryRun && rollbackActions.length > 0) {
      await this.writeManifest(options, rollbackActions, result);
    }
    if (!dryRun && result.manifestId === undefined) {
      // Nothing was recorded for undo, so nothing this run did is reversible.
      result.undoAvailable = false;
    }

    result.organizedFiles = result.moves.length;
    for (const move of result.moves) {
      (result.structure[move.folder] ??= []).push(path.basename(move.to));
    }

    return result;
  }

  /**
   * Logical folder label for a date, in the documented `YYYY/MM` form.
   *
   * This is a LOGICAL identifier, not a filesystem path: the "/" is always a
   * forward slash, on every platform. Two levels are always two levels, so an
   * agent reading `structure` or `moves[].folder` gets the same answer on
   * Windows as on Linux. Filesystem paths are derived from it in
   * `resolveDestination`, where the platform separator belongs.
   *
   * `utc` picks the calendar the label is read in. EXIF is wall-clock data that
   * exif-parser anchors to UTC, so reading it in UTC recovers the calendar the
   * camera recorded; reading it locally would slide a photo taken just after
   * midnight into the previous month. mtime is a true instant, so its calendar
   * is the user's local day.
   */
  dateFolder(date: Date, format: DateFolderFormat, utc = false): string {
    const calendar = calendarParts(date, utc);

    switch (format) {
      case "YYYY":
        return calendar.year;
      case "YYYY/MM/DD":
        return `${calendar.year}/${calendar.month}/${calendar.day}`;
      case "YYYY/MM":
      default:
        return `${calendar.year}/${calendar.month}`;
    }
  }

  private async resolveDate(
    file: FileWithSize,
    preference: DateSourcePreference,
  ): Promise<ResolvedDate | null> {
    if (preference === "auto" || preference === "exif") {
      const exifDate = await this.exifDate(file);
      if (exifDate) {
        return resolved(exifDate, "exif");
      }
      if (preference === "exif") {
        return null;
      }
    }

    const mtime = file.modified ?? (await this.statMtime(file.path));
    if (!mtime || isNaN(mtime.getTime())) {
      return null;
    }
    return resolved(mtime, "mtime");
  }

  /** EXIF date taken, or null when absent, unreadable, or not an image. */
  private async exifDate(file: FileWithSize): Promise<Date | null> {
    try {
      const metadata = await this.metadataService.extractMetadata(
        file.path,
        path.extname(file.path).toLowerCase(),
      );
      const raw = metadata?.dateTaken;
      if (typeof raw !== "string") {
        return null;
      }
      const date = new Date(raw);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      // Malformed metadata is an mtime decision (or a skip under "exif"), not a
      // reason to abandon the file.
      logger.debug("EXIF date extraction failed", {
        file: file.name,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async statMtime(filePath: string): Promise<Date | null> {
    try {
      return (await fs.stat(filePath)).mtime;
    } catch (error) {
      logger.debug("mtime lookup failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Destination for one file, or null when the name could escape the target.
   * The logical `folder` label ("2024/05") is split into its parts and rejoined
   * with the platform separator here, which is the only place a separator may
   * appear. The date folder is generated from a Date, so only the file name can
   * carry traversal — check it anyway.
   *
   * This is a LEXICAL pre-filter. A directory already inside the target can be a
   * symlink pointing out of it, and path.resolve cannot see that, so
   * `resolveMoveParent` re-checks containment against the real filesystem before
   * anything is written.
   */
  private resolveDestination(
    targetRoot: string,
    folder: string,
    fileName: string,
  ): string | null {
    if (
      fileName === "." ||
      fileName === ".." ||
      path.basename(fileName) !== fileName ||
      fileName.includes("\0")
    ) {
      return null;
    }

    const segments = folder.split("/").filter((segment) => segment.length > 0);
    if (segments.some((segment) => segment === "." || segment === "..")) {
      return null;
    }

    const destination = path.join(targetRoot, ...segments, fileName);
    if (!isInside(targetRoot, path.resolve(destination))) {
      return null;
    }
    return destination;
  }

  /**
   * Resolve the parent a move will write into and prove it is still inside the
   * validated target, on the real filesystem rather than lexically.
   *
   * Checked BEFORE the mkdir as well as after: the escaping component is an
   * existing directory symlink, so resolving the deepest existing ancestor finds
   * it while there is still nothing to create. Refusing here means a hostile or
   * accidental link inside the target cannot even leave an empty directory
   * behind outside it.
   *
   * Returns the destination built from the RESOLVED parent, so the path recorded
   * in the rollback manifest is where the file really ends up, or null when the
   * parent escapes the target.
   */
  private async resolveMoveParent(
    candidate: string,
    targetRoot: string,
  ): Promise<string | null> {
    const parent = path.dirname(candidate);

    const existing = await deepestExistingDir(parent);
    if (!existing || !isInside(targetRoot, existing)) {
      return null;
    }

    const created = await fs
      .mkdir(parent, { recursive: true })
      .then(() => true)
      .catch(() => false);
    if (!created) {
      return null;
    }

    const realParent = await fs.realpath(parent).catch(() => null);
    if (!realParent || !isInside(targetRoot, realParent)) {
      return null;
    }

    return path.join(realParent, path.basename(candidate));
  }

  /**
   * Move via safeAtomicMove (COPYFILE_EXCL, no silent overwrite), retrying with
   * a " (n)" suffix when the destination is taken.
   * @returns the destination actually used
   */
  private async moveWithCollisionRetry(
    source: string,
    destination: string,
    targetRoot: string,
  ): Promise<string> {
    const extension = path.extname(destination);
    const base = destination.slice(0, destination.length - extension.length);

    for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
      const candidate =
        attempt === 0 ? destination : `${base} (${attempt})${extension}`;

      const resolved = await this.resolveMoveParent(candidate, targetRoot);
      if (!resolved) {
        throw new Error(
          "Destination parent resolves outside the validated target directory",
        );
      }

      try {
        const moved = await safeAtomicMove(source, resolved);
        return moved.destinationPath;
      } catch (error) {
        if (isErrnoException(error) && error.code === "EEXIST") {
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Failed to find a free destination name after ${MAX_COLLISION_RETRIES} attempts`,
    );
  }

  /**
   * Moves that are not in a manifest are not undoable, so a failed manifest
   * write is reported as a failure rather than logged and forgotten.
   */
  private async writeManifest(
    options: DateOrganizeOptions,
    actions: RollbackAction[],
    result: DateOrganizeResult,
  ): Promise<void> {
    try {
      result.manifestId = await this.rollbackService.createManifest(
        `Date organization from ${options.sourceDir} to ${options.targetDir} (${actions.length} files)`,
        actions,
      );
    } catch (error) {
      result.success = false;
      result.undoAvailable = false;
      result.errors.push({
        file: "N/A",
        error:
          `Rollback manifest could not be written, so the ${actions.length} file(s) ` +
          `moved by this run are NOT undoable: ` +
          sanitizeErrorMessage(error instanceof Error ? error : String(error)),
      });
      logger.error("Failed to create rollback manifest for date organization");
    }
  }
}
