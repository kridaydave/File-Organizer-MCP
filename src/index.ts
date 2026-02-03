#!/usr/bin/env node

/**
 * File Organizer MCP Server v3.0.0
 *
 * A powerful, security-hardened Model Context Protocol server for intelligent file organization.
 * Features 7-layer path validation, file categorization, duplicate detection, and more.
 *
 * @version 3.0.0
 * @license MIT
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { CONFIG } from './config.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
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

    const server = createServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);
    logger.info('File Organizer MCP Server running on stdio');
}

main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
});
