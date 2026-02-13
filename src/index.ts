#!/usr/bin/env node

/**
 * File Organizer MCP Server v3.2.5
 *
 * A powerful, security-hardened Model Context Protocol server for intelligent file organization.
 * Features 7-layer path validation, file categorization, duplicate detection, and more.
 *
 * Usage:
 *   npx file-organizer-mcp              - Start the MCP server
 *   npx file-organizer-mcp --setup      - Run the setup wizard
 *   npx file-organizer-mcp --version    - Show version
 *   npx file-organizer-mcp --help       - Show help
 *
 * @version 3.2.5
 * @license MIT
 */

import { logger } from "./utils/logger.js";

// ==================== PRE-FLIGHT CHECKS ====================
// These run before any imports to catch installation issues early

// Node.js version check
const MIN_NODE_VERSION = 18;
const currentNodeVersion = process.versions.node;
const majorVersion = parseInt(currentNodeVersion.split(".")[0] || "0", 10);

if (majorVersion < MIN_NODE_VERSION) {
  logger.error(
    `
╔══════════════════════════════════════════════════════════════════╗
║  ERROR: Node.js version ${currentNodeVersion.padEnd(8)} is not supported                ║
╠══════════════════════════════════════════════════════════════════╣
║  File Organizer MCP requires Node.js ${MIN_NODE_VERSION} or higher                          ║
║                                                                  ║
║  To upgrade:                                                     ║
║    • Visit: https://nodejs.org/                                  ║
║    • Or use a version manager:                                   ║
║      - nvm (Linux/Mac): nvm install ${MIN_NODE_VERSION} && nvm use ${MIN_NODE_VERSION}                   ║
║      - nvm-windows: nvm install ${MIN_NODE_VERSION}.0.0 && nvm use ${MIN_NODE_VERSION}.0.0            ║
╚══════════════════════════════════════════════════════════════════╝
  `.trim(),
  );
  process.exit(1);
}

// Installation integrity check
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if dist files exist
const distPath = path.resolve(__dirname, "..");
const distIndexPath = path.join(__dirname, "index.js");
const distServerPath = path.join(__dirname, "server.js");

if (!fs.existsSync(distIndexPath) || !fs.existsSync(distServerPath)) {
  const packageRoot = path.resolve(__dirname, "..");
  logger.error(
    `
╔══════════════════════════════════════════════════════════════════╗
║  INSTALLATION INCOMPLETE                                         ║
╠══════════════════════════════════════════════════════════════════╣
║  The server files (dist/) are missing or incomplete.             ║
║                                                                  ║
║  Common causes:                                                  ║
║    • npm install --ignore-scripts (skipped prepare script)       ║
║    • Global install without proper build step                    ║
║    • Installing from GitHub without devDependencies              ║
║    • Package corruption during download                          ║
║                                                                  ║
║  How to fix:                                                     ║
║                                                                  ║
║  For regular users:                                              ║
║    npm uninstall -g file-organizer-mcp                           ║
║    npm install -g file-organizer-mcp                             ║
║                                                                  ║
║  For GitHub/source installs:                                     ║
║    cd "${packageRoot}"                                           ║
║    npm install && npm run build                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `.trim(),
  );
  process.exit(1);
}

// Verify critical dependencies
const nodeModulesPath = path.resolve(__dirname, "..", "..", "node_modules");
const criticalDeps = ["@modelcontextprotocol/sdk", "chalk", "node-cron", "zod"];
const missingDeps: string[] = [];

for (const dep of criticalDeps) {
  const depPath = path.join(nodeModulesPath, dep);
  if (!fs.existsSync(depPath)) {
    missingDeps.push(dep);
  }
}

if (missingDeps.length > 0) {
  logger.error(
    `
╔══════════════════════════════════════════════════════════════════╗
║  INCOMPLETE DEPENDENCIES                                         ║
╠══════════════════════════════════════════════════════════════════╣
║  Required packages failed to install:                            ║
║                                                                  ║
${missingDeps.map((d) => `║    • ${d.padEnd(59)}║`).join("\n")}
║                                                                  ║
║  Common causes:                                                  ║
║    • npm install --production (skipped dependencies)             ║
║    • Network interruption during install                         ║
║    • npm cache corruption                                        ║
║                                                                  ║
║  How to fix:                                                     ║
║                                                                  ║
║    rm -rf node_modules package-lock.json                         ║
║    npm cache clean --force                                       ║
║    npm install                                                   ║
║                                                                  ║
║  For global installs:                                            ║
║    npm uninstall -g file-organizer-mcp                           ║
║    npm cache clean --force                                       ║
║    npm install -g file-organizer-mcp                             ║
╚══════════════════════════════════════════════════════════════════╝
  `.trim(),
  );
  process.exit(1);
}

// ==================== MAIN IMPORTS ====================

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { CONFIG } from "./config.js";
import {
  startAutoOrganizeScheduler,
  stopAutoOrganizeScheduler,
  getAutoOrganizeScheduler,
} from "./services/auto-organize.service.js";

// ==================== MAIN FUNCTION ====================

async function main(): Promise<void> {
  // Handle CLI arguments
  const args = process.argv.slice(2);

  // --help flag
  if (args.includes("--help") || args.includes("-h")) {
    logger.info(`
File Organizer MCP Server v${CONFIG.VERSION}

Usage:
  npx file-organizer-mcp [options]

Options:
  --setup, -s      Run the interactive setup wizard
  --version, -v    Show version number
  --help, -h       Show this help message

For more information, visit: https://github.com/kridaydave/File-Organizer-MCP
`);
    process.exit(0);
  }

  // --version flag
  if (args.includes("--version") || args.includes("-v")) {
    logger.info(`File Organizer MCP Server v${CONFIG.VERSION}`);
    process.exit(0);
  }

  // --setup flag - Run the setup wizard
  if (args.includes("--setup") || args.includes("-s")) {
    const { startSetupWizard } = await import("./tui/setup-wizard.js");
    await startSetupWizard();
    process.exit(0);
    return;
  }

  // Default: Start the MCP server
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

  // Run missed schedule catch-up in background without blocking server readiness
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

    // Provide helpful error messages for common issues
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

  // Handle graceful shutdown
  setupGracefulShutdown();
}

/**
 * Setup handlers for graceful shutdown
 */
function setupGracefulShutdown(): void {
  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Stop the auto-organize scheduler
    stopAutoOrganizeScheduler();

    logger.info("Cleanup complete, exiting...");
    process.exit(0);
  };

  // Handle common termination signals
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Handle Windows specific signals
  if (process.platform === "win32") {
    process.on("SIGBREAK", () => shutdown("SIGBREAK"));
  }

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
    shutdown("uncaughtException");
  });

  // Handle unhandled rejections
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection:", reason);
    shutdown("unhandledRejection");
  });
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
