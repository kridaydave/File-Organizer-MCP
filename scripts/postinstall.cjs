#!/usr/bin/env node

/**
 * Post-install script for file-organizer-mcp
 * Shows a friendly welcome message after npm install
 */

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const WHITE = '\x1b[37m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';

// Skip in CI/non-interactive environments
if (process.env.CI || process.env.NODE_ENV === 'test') {
  process.exit(0);
}

console.error('');
console.error(`${CYAN}${BOLD}╔════════════════════════════════════════════════════════════╗${RESET}`);
console.error(`${CYAN}${BOLD}║                                                            ║${RESET}`);
console.error(`${CYAN}${BOLD}║   🗂️  File Organizer MCP Server                           ║${RESET}`);
console.error(`${CYAN}${BOLD}║                                                            ║${RESET}`);
console.error(`${CYAN}${BOLD}║   Let AI organize your files automatically!               ║${RESET}`);
console.error(`${CYAN}${BOLD}║                                                            ║${RESET}`);
console.error(`${CYAN}${BOLD}╚════════════════════════════════════════════════════════════╝${RESET}`);
console.error('');
console.error(`${WHITE}✨ Installation complete!${RESET}`);
console.error('');

console.error(`${YELLOW}🚀 Quick Start (just one command):${RESET}`);
console.error('');
console.error(`${MAGENTA}${BOLD}   npx file-organizer-mcp --setup${RESET}`);
console.error('');
console.error(`${GRAY}   This interactive wizard will:${RESET}`);
console.error(`${GRAY}   • Detect your installed AI clients (Claude, Cursor, etc.)${RESET}`);
console.error(`${GRAY}   • Configure everything automatically${RESET}`);
console.error(`${GRAY}   • Set up folders you want to organize${RESET}`);
console.error('');

console.error(`${YELLOW}🎯 What you can do after setup:${RESET}`);
console.error(`${GRAY}   • "Organize my Downloads folder"${RESET}`);
console.error(`${GRAY}   • "Find and remove duplicate files"${RESET}`);
console.error(`${GRAY}   • "Show my largest files"${RESET}`);
console.error('');

console.error(`${YELLOW}📚 Need help?${RESET}`);
console.error(`${GRAY}   GitHub: https://github.com/kridaydave/File-Organizer-MCP${RESET}`);
console.error('');

console.error(`${GREEN}Happy organizing! 🎉${RESET}`);
console.error('');
