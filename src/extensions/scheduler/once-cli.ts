/**
 * `file-organizer-watch once` — one pass, then exit.
 *
 * Split out of watch-cli.ts so the argument parsing and the exit-code rule can
 * be unit tested without importing a module whose top-level call starts the
 * watch daemon.
 */

import { sanitizeErrorMessage } from "../../utils/error-handler.js";
import { loadUserConfig } from "../../config.js";
import { historyLogger } from "../../services/history-logger.service.js";
import { runOrganizePass, type OrganizePassResult } from "./organize-pass.js";

export interface OnceFlags {
  directory: string | undefined;
  apply: boolean;
  recursive: boolean;
  help: boolean;
}

/**
 * Parse the flags after `once`. Unknown flags are a usage error rather than a
 * silent no-op, so a typo in a cron line fails loudly.
 */
export function parseOnceFlags(args: string[]): OnceFlags | { error: string } {
  const flags: OnceFlags = {
    directory: undefined,
    apply: false,
    recursive: false,
    help: false,
  };

  for (const arg of args) {
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
  --help, -h      Show this message.

Examples:
  file-organizer-watch once ~/Downloads              # preview, writes nothing
  file-organizer-watch once ~/Downloads --apply      # organize, then exit
  file-organizer-watch once . --apply --recursive

Exit code 0 on a clean pass, 1 when the pass failed.`;

/**
 * Exit code for a finished pass. A pass with per-file errors, or an organizer
 * that bailed out early, is a failure even though files did move, so it must
 * never report 0.
 */
export function passExitCode(result: {
  errors: string[];
  aborted: boolean;
}): number {
  return result.errors.length > 0 || result.aborted ? 1 : 0;
}

function reportPass(result: OrganizePassResult): void {
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

/**
 * Run one pass and exit. Never returns: it exits 0 on a clean pass, 1 on a
 * partial, aborted, or thrown failure — including a pass whose files moved but
 * whose history entry could not be written.
 */
export async function once(args: string[]): Promise<void> {
  const flags = parseOnceFlags(args);

  if ("error" in flags) {
    console.error(`${flags.error}\n`);
    console.error(ONCE_USAGE);
    process.exit(1);
  }

  if (flags.help) {
    console.log(ONCE_USAGE);
    process.exit(0);
  }

  if (!flags.directory) {
    console.error("once needs a directory.\n");
    console.error(ONCE_USAGE);
    process.exit(1);
  }

  try {
    const result = await runOrganizePass(
      {
        directory: flags.directory,
        dryRun: !flags.apply,
        includeSubdirs: flags.recursive,
      },
      { config: loadUserConfig(), history: historyLogger },
    );
    reportPass(result);
    process.exit(passExitCode(result));
  } catch (error) {
    console.error(
      `Pass failed: ${sanitizeErrorMessage(error instanceof Error ? error.message : String(error))}`,
    );
    process.exit(1);
  }
}
