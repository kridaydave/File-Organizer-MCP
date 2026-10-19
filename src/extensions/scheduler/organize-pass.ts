/**
 * Single-pass organization — one scan, one plan, every planned move, one
 * history entry, then the caller exits. A pass is not capped at one file: it
 * moves each matching file the scanner finds.
 *
 * This is the unit an OS timer (cron, launchd, systemd timer, Task Scheduler)
 * drives. It holds no watcher, no timer, and no open handle, so the process
 * ends on its own. The watch daemon keeps its own loop for now; when #52
 * rewrites that daemon as a thin loop, it calls runOrganizePass() per tick
 * instead of its private copy of the pass.
 */

import { FileScannerService } from "../../core/scan/scanner.js";
import { OrganizerService } from "../../core/organize/organizer.js";
import { CategorizerService } from "../../services/categorizer.service.js";
import { validateStrictPath } from "../../services/path-validator.service.js";
import { notifyIfMovedFiles } from "../../core/notify/notify-service.js";
import type { ConflictStrategy } from "../../core/organize/organizer.js";
import type { UserConfig } from "../../config.js";
import type { HistoryLoggerService } from "../../services/history-logger.service.js";
import type { OnceSource } from "./watch.schemas.js";
import { logger } from "../../utils/logger.js";

export interface OrganizePassOptions {
  /** Directory to organize. Validated through the same path gate the tools use. */
  directory: string;
  /**
   * Plan only, move nothing. Defaults to true so a bare `--once` writes
   * nothing at all, not even a history entry. Set false to move.
   */
  dryRun?: boolean;
  /** Recurse into subdirectories. Defaults to false, matching the tools. */
  includeSubdirs?: boolean;
  /** Overrides config.conflictStrategy for this pass. */
  conflictStrategy?: ConflictStrategy;
  /**
   * What started this pass, recorded on the history row. Defaults to "manual",
   * which is true for every caller that is not an OS timer. A process cannot
   * detect that cron launched it, so the timer has to say so via the
   * `--source` flag; see OnceSourceSchema for the accepted values.
   */
  source?: OnceSource;
  /**
   * Skip files younger than this many minutes. No default: a caller that omits
   * it gets every file, which is what a person running `--once` by hand wants.
   * The watch daemon supplies its own default, because a folder swept on a
   * timer should not touch a file that is still being written to.
   */
  minFileAgeMinutes?: number;
  /**
   * Move at most this many files, leaving the rest for the next pass. No
   * default, same reason as minFileAgeMinutes: a cap is per-directory tuning
   * that belongs to whoever configured the directory, not to the pass.
   */
  maxFiles?: number;
}

export interface OrganizePassContext {
  config: UserConfig;
  history: HistoryLoggerService;
}

export interface OrganizePassResult {
  directory: string;
  dryRun: boolean;
  /** Files found by the scanner before any filter. */
  scanned: number;
  /** Files the organizer turned into moves in the plan. */
  planned: number;
  /**
   * Planned moves per category. Plan-level counts, not a per-file tally, so a
   * recursive pass reports its top-level plan. Present because the daemon used
   * to log this breakdown and a user debugging "why did that file land there"
   * needs it; without it the only way to get it is a dry run by hand.
   */
  statistics: Record<string, number>;
  /** Files actually moved. Always 0 on a dry run. */
  moved: number;
  skipped: number;
  /** Per-file failures. Non-empty means the pass did not finish clean. */
  errors: string[];
  /** True when the organizer bailed out early after consecutive errors. */
  aborted: boolean;
  /** True when a history entry was appended. False on a dry run, and false
   * when the append failed after the files already moved. */
  historyLogged: boolean;
  /**
   * True when notify.command ran for this pass. Undefined on a dry run, which
   * never notifies, and false when notify is unset, invalid, throttled, or
   * failed. Present so a user can tell "nothing was notified" apart from
   * "nothing moved" without reading a log.
   */
  notified?: boolean;
}

/**
 * Run one pass over one directory. Throws when the path fails validation, so
 * the caller can map a throw to a non-zero exit. Per-file failures come back
 * in `errors` rather than throwing, because a partial pass still moved files.
 */
export async function runOrganizePass(
  options: OrganizePassOptions,
  ctx: OrganizePassContext,
): Promise<OrganizePassResult> {
  const {
    directory,
    dryRun = true,
    includeSubdirs = false,
    conflictStrategy,
    source = "manual",
    minFileAgeMinutes,
    maxFiles,
  } = options;

  const startedAt = Date.now();
  const validatedPath = await validateStrictPath(directory);
  const scanner = new FileScannerService();
  const organizer = new OrganizerService(
    new CategorizerService(ctx.config.customRules ?? []),
  );

  const scannedFiles = await scanner.getAllFiles(
    validatedPath,
    includeSubdirs,
  );

  // Age before size, so a directory full of fresh files spends the cap on
  // nothing rather than on files that are about to be skipped anyway.
  let files = scannedFiles;
  if (minFileAgeMinutes !== undefined && minFileAgeMinutes > 0) {
    files = filterByAge(files, minFileAgeMinutes);
  }

  if (maxFiles !== undefined && maxFiles > 0 && files.length > maxFiles) {
    files = files.slice(0, maxFiles);
  }

  const organizeResult = await organizer.organize(validatedPath, files, {
    dryRun,
    conflictStrategy:
      conflictStrategy ?? ctx.config.conflictStrategy ?? "rename",
  });

  const result: OrganizePassResult = {
    directory: validatedPath,
    dryRun,
    // What the scanner found, before any filter. Reporting the filtered count
    // here would make a daemon pass that skipped everything look like a pass
    // over an empty directory, which is a different problem with the same number.
    scanned: scannedFiles.length,
    planned: organizeResult.actions.length,
    statistics: organizeResult.statistics,
    // successCount counts executed moves on the apply path and planned moves
    // on the dry-run path. statistics cannot be summed for "moved": the
    // organizer keeps plan-level category counts there, so a recursive pass
    // reports the top-level plan while moving the whole tree.
    moved: dryRun ? 0 : organizeResult.successCount,
    skipped: organizeResult.skippedCount ?? 0,
    errors: organizeResult.errors,
    aborted: organizeResult.aborted,
    historyLogged: false,
  };

  if (dryRun) {
    return result;
  }

  try {
    await ctx.history.log({
      operation: "file_organizer_organize_files",
      source,
      // The organizer wrote a rollback manifest for the moves it executed, so
      // the row can carry the handle undo needs. Absent on a pass that moved
      // nothing and on one whose manifest write failed, both of which are
      // honest: the organizer reports the failure in errors and leaves the id
      // undefined rather than inventing a handle nobody can act on.
      manifestId: organizeResult.manifestId,
      status: result.errors.length > 0 ? "partial" : "success",
      durationMs: Date.now() - startedAt,
      filesProcessed: result.moved,
      filesSkipped: result.skipped,
      details: `Single pass over ${files.length} file(s): ${result.moved} moved, ${result.skipped} skipped`,
      paths: [validatedPath],
    });
    result.historyLogged = true;
  } catch (error) {
    // The files have already moved, so this cannot be undone through history.
    // Report it as a pass failure rather than a clean run with
    // historyLogged = true: passExitCode() then fails the pass and a timer
    // driver sees a non-zero exit instead of a silent permanent loss.
    result.historyLogged = false;
    result.errors.push(
      `History entry was not written, so this pass cannot be undone: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // After the moves and outside the history try, which is the point: a failed
  // history write is a pass failure, a failed notification is not. The files
  // have already moved by the time this runs, so notifyIfMovedFiles() swallows
  // everything and a notification can never change this pass's exit code.
  result.notified = await notifyIfMovedFiles({
    directory: validatedPath,
    moved: result.moved,
    config: ctx.config,
  });

  return result;
}

/**
 * Keep only files whose mtime is at least `minAgeMinutes` old.
 *
 * Uses the timestamp the scanner already collected, so this costs no extra
 * stat per file. A file the scanner could not date is kept: the alternative is
 * to drop it, which means a permission blip protects it from every future pass,
 * because it never becomes old enough to be examined again. Keeping it means one
 * failed stat is a single bad organize rather than a permanent exemption.
 */
function filterByAge<T extends { path: string; modified?: Date }>(
  files: readonly T[],
  minFileAgeMinutes: number,
): T[] {
  const cutoff = Date.now() - minFileAgeMinutes * 60_000;
  const kept: T[] = [];
  let undated = 0;

  for (const file of files) {
    if (!file.modified || file.modified.getTime() <= cutoff) {
      if (!file.modified) undated++;
      kept.push(file);
    }
  }

  if (undated > 0) {
    logger.warn(
      `${undated} file(s) had no readable mtime and were kept rather than skipped`,
    );
  }

  return kept;
}
