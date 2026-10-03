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
  from: string;
  /** Destination actually used (or the planned one in a dry run). */
  to: string;
  /** Destination folder relative to targetDir, e.g. "2024/03". */
  folder: string;
  /** ISO timestamp of the date that chose the folder. */
  date: string;
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
  /** Folder (relative to targetDir) -> file names placed in it. */
  structure: Record<string, string[]>;
  manifestId?: string;
  /** False when moves happened but the manifest could not be written. */
  undoAvailable: boolean;
}

const MAX_COLLISION_RETRIES = 100;

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
      undoAvailable: true,
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

      const folder = this.dateFolder(resolved.date, dateFormat);
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
        dateSource: resolved.source,
      };

      if (dryRun) {
        result.moves.push(move);
        continue;
      }

      try {
        const moved = await this.moveWithCollisionRetry(file.path, destination);
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

    result.organizedFiles = result.moves.length;
    for (const move of result.moves) {
      (result.structure[move.folder] ??= []).push(path.basename(move.to));
    }

    return result;
  }

  /**
   * Folder name for a date, e.g. "2024/03". Local calendar components, matching
   * the rest of the organizer's metadata subpaths.
   */
  dateFolder(date: Date, format: DateFolderFormat): string {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    switch (format) {
      case "YYYY":
        return year;
      case "YYYY/MM/DD":
        return path.join(year, month, day);
      case "YYYY/MM":
      default:
        return path.join(year, month);
    }
  }

  private async resolveDate(
    file: FileWithSize,
    preference: DateSourcePreference,
  ): Promise<{ date: Date; source: ResolvedDateSource } | null> {
    if (preference === "auto" || preference === "exif") {
      const exifDate = await this.exifDate(file);
      if (exifDate) {
        return { date: exifDate, source: "exif" };
      }
      if (preference === "exif") {
        return null;
      }
    }

    const mtime = file.modified ?? (await this.statMtime(file.path));
    if (!mtime || isNaN(mtime.getTime())) {
      return null;
    }
    return { date: mtime, source: "mtime" };
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
   * The date folder is generated from a Date, so only the file name can carry
   * traversal — check it anyway.
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

    const destination = path.join(targetRoot, folder, fileName);
    if (!path.resolve(destination).startsWith(targetRoot + path.sep)) {
      return null;
    }
    return destination;
  }

  /**
   * Move via safeAtomicMove (COPYFILE_EXCL, no silent overwrite), retrying with
   * a " (n)" suffix when the destination is taken.
   * @returns the destination actually used
   */
  private async moveWithCollisionRetry(
    source: string,
    destination: string,
  ): Promise<string> {
    const extension = path.extname(destination);
    const base = destination.slice(0, destination.length - extension.length);

    for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
      const candidate =
        attempt === 0 ? destination : `${base} (${attempt})${extension}`;
      try {
        const moved = await safeAtomicMove(source, candidate);
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
