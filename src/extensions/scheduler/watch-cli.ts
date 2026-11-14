/**
 * File Organizer Watch — standalone scheduler process
 *
 * Scheduled organization runs OUTSIDE the stdio MCP server. This entry:
 *   file-organizer-watch                          start the watcher daemon
 *   file-organizer-watch add <dir> <cron>         add/update a watch
 *   file-organizer-watch remove <dir>             remove a watch
 *   file-organizer-watch list                     show configured watches
 *   file-organizer-watch once <dir> [--apply] [--json]   one pass, then exit
 *
 * `once` is the mode an OS timer drives. It starts no watcher and holds no
 * handle, so the process ends on its own: it sets `process.exitCode` and
 * returns rather than calling `process.exit()`, which lets a piped stdout
 * report flush. Its exit code and `--json` output are the scripting contract
 * (ONCE_EXIT in once-cli.ts). See once-cli.ts and organize-pass.ts.
 *
 * Cron, systemd, or launchd driving `once` is the primary scheduling path
 * (issue #52). The default no-argument `run` below is the convenience loop:
 * it runs that same pass on a built-in timer for machines that are always on
 * and run no scheduler of their own.
 *
 * Task state lives in the shared user config (watchList), so the daemon and
 * the CLI subcommands stay in sync without any in-memory coupling.
 */

import { logger } from "../../utils/logger.js";
import {
  startAutoOrganizeScheduler,
  stopAutoOrganizeScheduler,
} from "./auto-organize.service.js";
import {
  handleWatchDirectory,
  handleUnwatchDirectory,
  handleListWatches,
} from "./watch-manager.js";
import { once } from "./once-cli.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getUserConfigPath } from "../../core/config/paths.js";

/**
 * Reload the daemon's cron tasks from the current config.
 * This is the trigger the SIGHUP handler and the config watcher call,
 * so removing a watch (via `file-organizer-watch remove`, which edits
 * the shared config) stops its task in the running daemon.
 *
 * The scheduler service only exports start/stop at module level, so a
 * reload is stop + start: start re-reads the watch list and recreates
 * tasks for whatever is configured now.
 */
export async function reloadWatches(): Promise<void> {
  stopAutoOrganizeScheduler();
  await startAutoOrganizeScheduler();
}

function text(response: { content: Array<{ text?: string }> }): string {
  return response.content.map((c) => c.text ?? "").join("\n");
}

async function add(
  directory: string | undefined,
  schedule: string | undefined,
): Promise<void> {
  if (!directory || !schedule) {
    console.error(
      "Usage: file-organizer-watch add <directory> <cron-expression>",
    );
    console.error('Example: file-organizer-watch add ~/Downloads "0 10 * * *"');
    process.exit(1);
  }
  const response = await handleWatchDirectory({
    directory,
    schedule,
    response_format: "markdown",
  });
  const failed = "isError" in response && response.isError === true;
  console.log(text(response));
  process.exit(failed ? 1 : 0);
}

async function remove(directory: string | undefined): Promise<void> {
  if (!directory) {
    console.error("Usage: file-organizer-watch remove <directory>");
    process.exit(1);
  }
  const response = await handleUnwatchDirectory({ directory });
  const failed = "isError" in response && response.isError === true;
  console.log(text(response));
  process.exit(failed ? 1 : 0);
}

async function list(): Promise<void> {
  const response = await handleListWatches({ response_format: "markdown" });
  console.log(text(response));
  process.exit(0);
}

async function run(): Promise<void> {
  logger.info("File Organizer Watch starting...");

  const result = await startAutoOrganizeScheduler();

  if (!result.success) {
    logger.error("Watcher failed to start:");
    result.errors.forEach((e) => logger.error(`  • ${e}`));
    process.exit(1);
  }

  logger.info(`Watching ${result.taskCount} task(s)`);
  result.errors.forEach((e) => logger.warn(`  • ${e}`));

  if (result.taskCount === 0) {
    logger.info("No watches configured. Add one with:");
    logger.info('  file-organizer-watch add <directory> "<cron>"');
  }

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, stopping watcher...`);
    stopAutoOrganizeScheduler();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  if (process.platform === "win32") {
    process.on("SIGBREAK", () => shutdown("SIGBREAK"));
  }
  process.on("SIGHUP", () => {
    logger.info("Received SIGHUP, reloading watches...");
    reloadWatches().catch((error) => {
      logger.error("Failed to reload watches:", error);
    });
  });

  // Watch config file for changes to reload tasks automatically
  try {
    const configPath = getUserConfigPath();
    let reloadTimeout: NodeJS.Timeout | null = null;
    fs.watch(configPath, () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      reloadTimeout = setTimeout(() => {
        logger.info("Config changed, reloading watches...");
        reloadWatches().catch((error) => {
          logger.error("Failed to reload watches:", error);
        });
      }, 200);
    });
  } catch (error) {
    logger.debug("Failed to watch config file for changes:", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // node-cron holds the event loop; this is just a safety net.
  setInterval(() => {}, 1 << 30);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "add":
      return add(rest[0], rest[1]);
    case "remove":
      return remove(rest[0]);
    case "list":
      return list();
    case "once":
      return once(rest);
    case "run":
    case undefined:
      return run();
    default:
      console.error(
        `Unknown command "${command}". Use add | remove | list | once | run.`,
      );
      process.exit(1);
  }
}

// Only run as a CLI when this file is the entrypoint (directly or via
// bin/file-organizer-watch.mjs). Tests import reloadWatches from here
// and must not launch the daemon as a side effect.
const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isEntrypoint =
  entrypoint === fileURLToPath(import.meta.url) ||
  path.basename(entrypoint) === "file-organizer-watch.mjs";
if (isEntrypoint) {
  main().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
  });
}
