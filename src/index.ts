#!/usr/bin/env node

/**
 * File Organizer MCP Server v3.0.0
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
 * @version 3.0.0
 * @license MIT
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { CONFIG } from './config.js';
import { logger } from './utils/logger.js';
import { 
  startAutoOrganizeScheduler, 
  stopAutoOrganizeScheduler,
  getAutoOrganizeScheduler 
} from './services/auto-organize.service.js';

async function main(): Promise<void> {
  // Handle CLI arguments
  const args = process.argv.slice(2);

  // --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
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
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`File Organizer MCP Server v${CONFIG.VERSION}`);
    process.exit(0);
  }

  // --setup flag - Run the setup wizard
  if (args.includes('--setup') || args.includes('-s')) {
    const { startSetupWizard } = await import('./tui/setup-wizard.js');
    await startSetupWizard();
    process.exit(0);
    return;
  }

  // Default: Start the MCP server
  logger.info(`File Organizer MCP Server v${CONFIG.VERSION} starting...`);
  logger.info(`Security Mode: Whitelist + Blacklist (Platform-aware)`);
  logger.info(`Working Directory: ${process.cwd()}`);

  // Log allowed directories
  const allowedDirs = [...CONFIG.paths.defaultAllowed, ...CONFIG.paths.customAllowed];
  logger.info(`Allowed directories (${allowedDirs.length}):`);
  allowedDirs.forEach(dir => logger.info(`  - ${dir}`));

  if (CONFIG.paths.customAllowed.length > 0) {
    logger.info(`Custom allowed directories: ${CONFIG.paths.customAllowed.length}`);
  }

  // Start auto-organize scheduler if enabled
  startAutoOrganizeScheduler();
  
  // Log scheduler status
  const scheduler = getAutoOrganizeScheduler();
  if (scheduler?.isActive()) {
    const status = scheduler.getStatus();
    logger.info(`Auto-organize monitoring ${status.taskCount} task(s)`);
    if (status.watchedDirectories.length > 0) {
      logger.info(`Watched directories: ${status.watchedDirectories.join(', ')}`);
    }
  } else {
    logger.info('Auto-organize scheduler inactive');
  }

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info('File Organizer MCP Server running on stdio');

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
    
    logger.info('Cleanup complete, exiting...');
    process.exit(0);
  };

  // Handle common termination signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle Windows specific signals
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    shutdown('unhandledRejection');
  });
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
