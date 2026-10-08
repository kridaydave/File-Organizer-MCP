/**
 * `file-organizer-watch once` — one pass, then exit.
 *
 * Split out of watch-cli.ts so the argument parsing and the exit-code rule can
 * be unit tested without importing a module whose top-level call starts the
 * watch daemon.
 *
 * The exit code and the `--json` report are the scripting contract for this
 * command: an OS timer, a CI job, or another program needs to know whether the
 * pass moved anything, had nothing to do, or failed, without scraping prose.
 */

import { sanitizeErrorMessage } from "../../utils/error-handler.js";
import { loadUserConfig } from "../../config.js";
import { historyLogger } from "../../services/history-logger.service.js";
import { runOrganizePass, type OrganizePassResult } from "./organize-pass.js";
import { OnceSourceSchema, type OnceSource } from "./watch.schemas.js";

export interface OnceFlags {
  directory: string | undefined;
  apply: boolean;
  recursive: boolean;
  json: boolean;
  help: boolean;
  /** What the pass records on its history row. Defaults to "manual". */
  source: OnceSource;
}

/**
 * Parse the flags after `once`. Unknown flags are a usage error rather than a
 * silent no-op, so a typo in a cron line fails loudly.
 *
 * Indexed rather than iterated because `--source` consumes the argument after
 * it. A plain `for...of` would treat that value as a second directory and
 * reject a perfectly good command line.
 */
export function parseOnceFlags(args: string[]): OnceFlags | { error: string } {
  const flags: OnceFlags = {
    directory: undefined,
    apply: false,
    recursive: false,
    json: false,
    help: false,
    source: "manual",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    switch (arg) {
      case "--apply":
        flags.apply = true;
        break;
      case "--recursive":
        flags.recursive = true;
        break;
      case "--dry-run":
        flags.apply = false;
        break;
      case "--json":
        flags.json = true;
        break;
      case "--source": {
        const value = args[++i];
        const parsed = OnceSourceSchema.safeParse(value);
        if (!parsed.success) {
          return {
            error: value
              ? `--source must be manual or scheduled, got: ${value}`
              : "--source needs a value",
          };
        }
        flags.source = parsed.data;
        break;
      }
      case "--help":
      case "-h":
        flags.help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          return { error: `Unknown flag for once: ${arg}` };
        }
        if (flags.directory !== undefined) {
          return { error: "once takes exactly one directory" };
        }
        flags.directory = arg;
    }
  }

  return flags;
}

export const ONCE_USAGE = `Usage: file-organizer-watch once <directory> [options]

Run one organization pass, then exit. No watcher, no timer, no daemon, and no
handle held open, so this is safe to call from cron, launchd, a systemd timer,
or Task Scheduler.

Options:
  --apply         Move the files. Without it the pass is a dry run that writes
                  nothing at all, not even a history entry.
  --dry-run       Plan only. This is the default. The flag is accepted so the
                  mode can be spelled out in a scheduler config.
  --recursive     Include subdirectories. Default is the top directory only.
  --source VALUE  Label the pass record manual or scheduled. Default manual.
                  A process cannot tell that cron started it, so a crontab
                  line has to say so itself: --source scheduled is what makes
                  file_organizer_search_history source=scheduled match.
  --json          Print one machine-readable JSON object on stdout and nothing
                  else. Human output (logs, usage, this message) goes to
                  stderr, so stdout stays parseable.
  --help, -h      Show this message.

Every branch sets the exit code and returns rather than exiting outright, so
the report always reaches a piped stdout in full.

Examples:
  file-organizer-watch once ~/Downloads              # preview, writes nothing
  file-organizer-watch once ~/Downloads --apply      # organize, then exit
  file-organizer-watch once . --apply --recursive
  file-organizer-watch once ~/Downloads --apply --json
  # from a crontab line, so the history row is labelled scheduled
  file-organizer-watch once ~/Downloads --apply --source scheduled

Exit codes:
  0  the pass finished and moved nothing (empty directory, nothing to
     organize, or a dry run). Success with no work done.
  1  the pass failed: bad usage, a path the gate refused, per-file errors, or
     an organizer that aborted. Takes precedence over 2 even when some files
     did move.
  2  the pass finished clean and moved at least one file.

With --json the object always carries these keys: ok, exitCode, directory,
dryRun, scanned, planned, moved, skipped, historyLogged, aborted, errors.
"ok" is true for exit codes 0 and 2. A failure that happened before or during
the pass reports the same shape with ok false and a message in errors.`;

/**
 * Exit codes for a single pass. Three distinct values so a caller can tell
 * "did work", "nothing to do", and "failed" without reading the output.
 * Anything a script can act on must distinguish them, so this contract is
 * frozen: do not renumber these without a major version bump.
 */
export const ONCE_EXIT = {
  /** Nothing to do: empty directory, nothing to organize, or a dry run. */
  nothing: 0,
  /** Failed: bad usage, refused path, per-file errors, or an aborted pass. */
  error: 1,
  /** Clean pass that moved at least one file. */
  moved: 2,
} as const;

/**
 * Exit code for a finished pass. A pass with per-file errors, or an organizer
 * that bailed out early, is a failure even though files did move, so it must
 * never report the "moved" code.
 */
export function passExitCode(result: {
  moved: number;
  errors: string[];
  aborted: boolean;
}): number {
  if (result.errors.length > 0 || result.aborted) return ONCE_EXIT.error;
  return result.moved > 0 ? ONCE_EXIT.moved : ONCE_EXIT.nothing;
}

/**
 * The one JSON shape `--json` prints. Fields are always present, including on
 * a failure, so a consumer can read the same keys without a presence check.
 * Failures that happen before the scan (bad flags, a path the gate refuses)
 * report zeros with the reason in `errors`.
 */
export interface OnceReport {
  ok: boolean;
  exitCode: number;
  directory: string;
  dryRun: boolean;
  scanned: number;
  planned: number;
  moved: number;
  skipped: number;
  historyLogged: boolean;
  aborted: boolean;
  errors: string[];
}

/**
 * Build the JSON report for a pass. `result` is optional so a failure that
 * never produced one can still be reported in the same shape.
 */
export function onceReport(
  exitCode: number,
  result?: Partial<OrganizePassResult> & { errors?: string[] },
): OnceReport {
  return {
    ok: exitCode !== ONCE_EXIT.error,
    exitCode,
    directory: result?.directory ?? "",
    dryRun: result?.dryRun ?? false,
    scanned: result?.scanned ?? 0,
    planned: result?.planned ?? 0,
    moved: result?.moved ?? 0,
    skipped: result?.skipped ?? 0,
    historyLogged: result?.historyLogged ?? false,
    aborted: result?.aborted ?? false,
    errors: result?.errors ?? [],
  };
}

/** Report for a failure with no pass to describe, e.g. a usage error. */
export function failureReport(
  error: string,
  directory = "",
  dryRun = true,
): OnceReport {
  return onceReport(ONCE_EXIT.error, { directory, dryRun, errors: [error] });
}

function reportPass(result: OrganizePassResult, json: boolean): void {
  // --json: exactly one line on stdout and nothing else. The logger already
  // writes to stderr, so stdout carries only the report.
  if (json) {
    console.log(JSON.stringify(onceReport(passExitCode(result), result)));
    return;
  }
  console.log(
    `### ${result.dryRun ? "Dry run" : "Applied"} for \`${result.directory}\``,
  );
  console.log(
    `Scanned ${result.scanned} file(s), planned ${result.planned} move(s).`,
  );
  console.log(
    result.dryRun
      ? "Moved 0 file(s). Nothing was written. Re-run with --apply to move them."
      : `Moved ${result.moved} file(s), skipped ${result.skipped}.`,
  );
  if (result.errors.length > 0) {
    console.log(`Errors (${result.errors.length}):`);
    result.errors.forEach((e) => console.log(`- ${e}`));
  }
  if (result.aborted) {
    console.log("Organizer aborted after repeated errors.");
  }
  if (!result.dryRun && !result.historyLogged) {
    console.log(
      "History entry was NOT written. These moves have no undo record.",
    );
  }
}

/** Usage is human text: stderr under --json, where stdout must stay parseable. */
function reportUsage(json: boolean): void {
  if (json) {
    console.error(ONCE_USAGE);
    return;
  }
  console.log(ONCE_USAGE);
}

/**
 * Run one pass and exit. The exit code follows ONCE_EXIT: 2 when a clean pass
 * moved files, 0 when it had nothing to do, and 1 for a usage error, a refused
 * path, a partial or aborted pass, or a thrown failure — including a pass whose
 * files moved but whose history entry could not be written.
 *
 * Every branch sets `process.exitCode` and returns instead of calling
 * `process.exit()`. On a pipe, stdout writes are asynchronous, so exiting
 * inside the handler can drop the tail of the report and hand a consuming
 * script truncated JSON — the exact thing --json promises not to do. Returning
 * lets Node flush stdout before it exits on its own. This command holds no
 * watcher, no timer, and no open handle, so the loop drains immediately once
 * the pass returns.
 */
export async function once(args: string[]): Promise<void> {
  const flags = parseOnceFlags(args);

  // A bad flag aborts parsing before --json is seen, so ask the raw argv.
  // The failure still has to honor the output mode that was requested.
  const wantsJson = args.includes("--json");

  if ("error" in flags) {
    if (wantsJson) console.log(JSON.stringify(failureReport(flags.error)));
    console.error(`${flags.error}\n`);
    console.error(ONCE_USAGE);
    process.exitCode = ONCE_EXIT.error;
    return;
  }

  if (flags.help) {
    reportUsage(flags.json);
    process.exitCode = ONCE_EXIT.nothing;
    return;
  }

  if (!flags.directory) {
    if (flags.json) {
      console.log(
        JSON.stringify(failureReport("once needs a directory", "", true)),
      );
    }
    console.error("once needs a directory.\n");
    console.error(ONCE_USAGE);
    process.exitCode = ONCE_EXIT.error;
    return;
  }

  try {
    const result = await runOrganizePass(
      {
        directory: flags.directory,
        dryRun: !flags.apply,
        includeSubdirs: flags.recursive,
        source: flags.source,
      },
      { config: loadUserConfig(), history: historyLogger },
    );
    reportPass(result, flags.json);
    process.exitCode = passExitCode(result);
  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
    );
    if (flags.json) {
      console.log(
        JSON.stringify(failureReport(message, flags.directory, !flags.apply)),
      );
    }
    console.error(`Pass failed: ${message}`);
    process.exitCode = ONCE_EXIT.error;
  }
}
