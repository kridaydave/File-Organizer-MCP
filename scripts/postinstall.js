#!/usr/bin/env node

/**
 * Post-install script for file-organizer-mcp
 * Shows a welcome message and setup instructions after npm install
 */

import chalk from 'chalk';

// Skip message in CI/non-interactive environments
if (process.env.CI || process.env.NODE_ENV === 'test') {
  process.exit(0);
}

console.log('');
console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║                                                            ║'));
console.log(chalk.cyan.bold('║   🗂️  File Organizer MCP Server                           ║'));
console.log(chalk.cyan.bold('║                                                            ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝'));
console.log('');
console.log(chalk.white('Thanks for installing file-organizer-mcp!'));
console.log('');
console.log(chalk.yellow('📋 Next Steps:'));
console.log('');
console.log(chalk.white('  1. Run the setup wizard to configure:'));
console.log(chalk.cyan('     npx file-organizer-mcp --setup'));
console.log('');
console.log(chalk.white('  2. Or manually configure by editing:'));
console.log(chalk.gray('     Windows: %APPDATA%\\file-organizer-mcp\\config.json'));
console.log(chalk.gray('     macOS:   ~/Library/Application Support/file-organizer-mcp/config.json'));
console.log(chalk.gray('     Linux:   ~/.config/file-organizer-mcp/config.json'));
console.log('');
console.log(chalk.white('  3. Add to Claude Desktop config:'));
console.log(chalk.gray('     https://github.com/kridaydave/File-Organizer-MCP#claude-desktop-configuration'));
console.log('');
console.log(chalk.green('✨ Happy organizing!'));
console.log('');
