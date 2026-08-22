/**
 * File Organizer Watch — standalone scheduler process
 *
 * Scheduled organization runs OUTSIDE the stdio MCP server. This entry:
 *   file-organizer-watch                          start the watcher daemon
 *   file-organizer-watch add <dir> <cron>         add/update a watch
 *   file-organizer-watch remove <dir>             remove a watch
 *   file-organizer-watch list                     show configured watches
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

function text(response: { content: Array<{ text?: string }> }): string {
  return response.content.map((c) => c.text ?? "").join("\n");
}

async function add(directory: string | undefined, schedule: string | undefined): Promise<void> {
  if (!directory || !schedule) {
    console.error("Usage: file-organizer-watch add <directory> <cron-expression>");
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
    process.exit(0);
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
    case "run":
    case undefined:
      return run();
    default:
      console.error(
        `Unknown command "${command}". Use add | remove | list | run.`,
      );
      process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
