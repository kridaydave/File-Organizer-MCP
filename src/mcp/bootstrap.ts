/**
 * File Organizer MCP Server v3.5.0
 * Bootstrap — server startup, scheduler wiring, transport, shutdown
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../server.js";
import { CONFIG } from "../config.js";
import {
  startAutoOrganizeScheduler,
  stopAutoOrganizeScheduler,
  getAutoOrganizeScheduler,
} from "../extensions/scheduler/auto-organize.service.js";
import { logger } from "../utils/logger.js";

/**
 * Start the MCP server over stdio.
 * Keeps behavior identical to original src/index.ts main() tail.
 */
export async function bootstrapServer(): Promise<void> {
  logger.info(`File Organizer MCP Server v${CONFIG.VERSION} starting...`);
  logger.info(`Security Mode: Whitelist + Blacklist (Platform-aware)`);
  logger.info(`Working Directory: ${process.cwd()}`);

  // Log allowed directories
  const allowedDirs = [
    ...CONFIG.paths.defaultAllowed,
    ...CONFIG.paths.customAllowed,
  ];
  logger.info(`Allowed directories (${allowedDirs.length}):`);
  allowedDirs.forEach((dir) => logger.info(`  - ${dir}`));

  if (CONFIG.paths.customAllowed.length > 0) {
    logger.info(
      `Custom allowed directories: ${CONFIG.paths.customAllowed.length}`,
    );
  }

  // Start auto-organize scheduler if enabled
  const schedulerResult = await startAutoOrganizeScheduler();

  // Log scheduler status and report any errors
  const scheduler = getAutoOrganizeScheduler();
  if (scheduler?.isActive()) {
    const status = scheduler.getStatus();
    logger.info(`Auto-organize monitoring ${status.taskCount} task(s)`);
    if (status.watchedDirectories.length > 0) {
      logger.info(
        `Watched directories: ${status.watchedDirectories.join(", ")}`,
      );
    }
  } else {
    logger.info("Auto-organize scheduler inactive");
  }

  // Run missed schedule catch-up in background without blocking readiness
  if (scheduler?.isActive()) {
    logger.info("Running missed schedule catch-up...");
    scheduler.runMissedSchedules().catch((error) => {
      logger.error("Missed schedule catch-up failed:", error.message);
    });
  }

  // Report scheduler errors to user
  if (schedulerResult.errors.length > 0) {
    const hasRealErrors = schedulerResult.errors.some(
      (e) =>
        !e.includes("already running") &&
        !e.includes("No directories configured"),
    );

    if (hasRealErrors) {
      logger.error("\n⚠️  Auto-Organize Scheduler Issues:");
      schedulerResult.errors.forEach((error) => {
        if (
          !error.includes("already running") &&
          !error.includes("No directories configured")
        ) {
          logger.error(`   • ${error}`);
        }
      });
      logger.error("\n   To fix configuration:");
      logger.error("   npx file-organizer-mcp --setup\n");
    }
  }

  // Warn if auto-organize is enabled but no tasks are running
  if (schedulerResult.taskCount === 0 && schedulerResult.errors.length > 0) {
    const hasConfigErrors = schedulerResult.errors.some(
      (e) => e.includes("Invalid cron") || e.includes("does not exist"),
    );

    if (hasConfigErrors) {
      logger.error("\nℹ️  Auto-organize is not monitoring any directories.");
      logger.error(
        "   Run the setup wizard to configure scheduled organization:\n",
      );
      logger.error("   npx file-organizer-mcp --setup\n");
    }
  }

  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle transport-level errors
  transport.onerror = (error: Error) => {
    logger.error("Transport error:", error.message);
  };

  transport.onclose = () => {
    logger.info("Transport connection closed");
    stopAutoOrganizeScheduler();
    process.exit(0);
  };

  try {
    await server.connect(transport);
    logger.info("File Organizer MCP Server running on stdio");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to connect to MCP transport:", errorMessage);

    if (
      errorMessage.includes("EPIPE") ||
      errorMessage.includes("broken pipe")
    ) {
      logger.error(
        `
╔══════════════════════════════════════════════════════════════════╗
║  CONNECTION ERROR                                                ║
╠══════════════════════════════════════════════════════════════════╣
║  The connection to Claude Desktop was broken.                    ║
║                                                                  ║
║  Common causes:                                                  ║
║    • Claude Desktop was closed                                   ║
║    • Another MCP server is using the same stdio transport        ║
║    • The MCP server was restarted too quickly                    ║
║                                                                  ║
║  To fix:                                                         ║
║    1. Restart Claude Desktop                                     ║
║    2. Check for duplicate MCP server entries in config           ║
║    3. Wait a few seconds before restarting                       ║
╚══════════════════════════════════════════════════════════════════╝
      `.trim(),
      );
    } else if (errorMessage.includes("ECONNREFUSED")) {
      logger.error(
        `
╔══════════════════════════════════════════════════════════════════╗
║  CONNECTION REFUSED                                              ║
╠══════════════════════════════════════════════════════════════════╣
║  Could not connect to the MCP transport.                         ║
║                                                                  ║
║  This usually means Claude Desktop is not running or             ║
║  the MCP configuration is incorrect.                             ║
╚══════════════════════════════════════════════════════════════════╝
      `.trim(),
      );
    }

    throw error;
  }

  setupGracefulShutdown();
}

/**
 * Setup handlers for graceful shutdown
 */
export function setupGracefulShutdown(): void {
  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    stopAutoOrganizeScheduler();
    logger.info("Cleanup complete, exiting...");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  if (process.platform === "win32") {
    process.on("SIGBREAK", () => shutdown("SIGBREAK"));
  }

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection:", reason);
    shutdown("unhandledRejection");
  });
}

// Alias for task spec compatibility
export const startMcpServer = bootstrapServer;
