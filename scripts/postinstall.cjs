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

console.log('');
console.log(`${CYAN}${BOLD}╔════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${CYAN}${BOLD}║                                                            ║${RESET}`);
console.log(`${CYAN}${BOLD}║   🗂️  File Organizer MCP Server                           ║${RESET}`);
console.log(`${CYAN}${BOLD}║                                                            ║${RESET}`);
console.log(`${CYAN}${BOLD}║   Let AI organize your files automatically!               ║${RESET}`);
console.log(`${CYAN}${BOLD}║                                                            ║${RESET}`);
console.log(`${CYAN}${BOLD}╚════════════════════════════════════════════════════════════╝${RESET}`);
console.log('');
console.log(`${WHITE}✨ Installation complete!${RESET}`);
console.log('');

console.log(`${YELLOW}🚀 Quick Start (just one command):${RESET}`);
console.log('');
console.log(`${MAGENTA}${BOLD}   npx file-organizer-mcp --setup${RESET}`);
console.log('');
console.log(`${GRAY}   This interactive wizard will:${RESET}`);
console.log(`${GRAY}   • Detect your installed AI clients (Claude, Cursor, etc.)${RESET}`);
console.log(`${GRAY}   • Configure everything automatically${RESET}`);
console.log(`${GRAY}   • Set up folders you want to organize${RESET}`);
console.log('');

console.log(`${YELLOW}🎯 What you can do after setup:${RESET}`);
console.log(`${GRAY}   • "Organize my Downloads folder"${RESET}`);
console.log(`${GRAY}   • "Find and remove duplicate files"${RESET}`);
console.log(`${GRAY}   • "Show my largest files"${RESET}`);
console.log('');

console.log(`${YELLOW}📚 Need help?${RESET}`);
console.log(`${GRAY}   GitHub: https://github.com/kridaydave/File-Organizer-MCP${RESET}`);
console.log('');

console.log(`${GREEN}Happy organizing! 🎉${RESET}`);
console.log('');
