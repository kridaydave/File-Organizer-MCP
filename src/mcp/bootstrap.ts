/**
 * File Organizer MCP Server v5.0.0
 * Bootstrap — server startup, transport, shutdown
 *
 * Scheduled organization is a separate process (bin/file-organizer-watch.mjs);
 * the stdio server stays stateless and watcher-free.
 */

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../server.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * Start the MCP server over stdio.
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

  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle transport-level errors
  transport.onerror = (error: Error) => {
    logger.error("Transport error:", error.message);
  };

  transport.onclose = () => {
    logger.info("Transport connection closed");
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
