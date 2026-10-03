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
import type { ConflictStrategy } from "../../core/organize/organizer.js";
import type { UserConfig } from "../../config.js";
import type { HistoryLoggerService } from "../../services/history-logger.service.js";

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
  } = options;

  const startedAt = Date.now();
  const validatedPath = await validateStrictPath(directory);
  const scanner = new FileScannerService();
  const organizer = new OrganizerService(
    new CategorizerService(ctx.config.customRules ?? []),
  );

  const files = await scanner.getAllFiles(validatedPath, includeSubdirs);

  const organizeResult = await organizer.organize(validatedPath, files, {
    dryRun,
    conflictStrategy:
      conflictStrategy ?? ctx.config.conflictStrategy ?? "rename",
  });

  const result: OrganizePassResult = {
    directory: validatedPath,
    dryRun,
    scanned: files.length,
    planned: organizeResult.actions.length,
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
      source: "manual",
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

  return result;
}
