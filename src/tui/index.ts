#!/usr/bin/env node

/**
 * File Organizer MCP - TUI Entry Point
 *
 * Streamlined setup wizard for non-technical users.
 * Run via: npm run setup or npx file-organizer-mcp --setup
 */

import { startSetupWizard } from './setup-wizard.js';

async function main(): Promise<void> {
  // Handle interruption gracefully
  process.on('SIGINT', () => {
    console.log('\n\nSetup cancelled. You can re-run anytime with: npx file-organizer-mcp --setup');
    process.exit(0);
  });

  await startSetupWizard();
  process.exit(0);
}

main().catch((error) => {
  // Don't show scary error for user cancellation
  if (error?.message?.includes('User force closed') || error?.message?.includes('Cancelled')) {
    console.log('\n\nSetup cancelled. You can re-run anytime with: npx file-organizer-mcp --setup');
    process.exit(0);
  }

  console.error('\nAn error occurred:', error.message);
  console.log('\nFor help, visit: https://github.com/kridaydave/File-Organizer-MCP#readme');
  process.exit(1);
});
