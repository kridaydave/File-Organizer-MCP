#!/usr/bin/env node

/**
 * File Organizer MCP Server v3.5.0
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
 * @version 3.5.0
 * @license MIT
 */

import { logger } from "./utils/logger.js";
import { runPreflightChecks, handleCliFlags } from "./mcp/cli.js";
import { bootstrapServer } from "./mcp/bootstrap.js";

// Run pre-flight checks before starting (Node version, dist, deps)
runPreflightChecks();

async function main(): Promise<void> {
  await handleCliFlags();
  await bootstrapServer();
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
