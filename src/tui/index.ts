#!/usr/bin/env node

/**
 * File Organizer MCP - TUI Entry Point
 * 
 * This is the entry point for the interactive setup wizard.
 * Can be run via: npm run setup or npx file-organizer-mcp --setup
 */

import { startSetupWizard } from './setup-wizard.js';

async function main(): Promise<void> {
  await startSetupWizard();
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
