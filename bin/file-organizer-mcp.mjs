#!/usr/bin/env node

/**
 * File Organizer MCP - Entry Point Wrapper
 * 
 * This wrapper ensures the server can start even if:
 * - The dist/ folder is missing (tries to build or shows clear error)
 * - Running via npx with partial install
 * - Global install without proper build
 * - ESM/CJS compatibility handled
 * - Relative imports for robustness
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the package root
const packageRoot = path.resolve(__dirname, '..');
const distPath = path.join(packageRoot, 'dist');
const distIndexPath = path.join(distPath, 'src', 'index.js');
const srcIndexPath = path.join(packageRoot, 'src', 'index.ts');

// ANSI colors for terminal output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(...args) {
  console.error(...args);  // Use stderr to avoid breaking MCP protocol
}

function error(...args) {
  console.error(...args);  // stderr for errors
}

// Check Node.js version first
const MIN_NODE_VERSION = 18;
const currentVersion = process.versions.node;
const majorVersion = parseInt(currentVersion.split('.')[0], 10);

if (majorVersion < MIN_NODE_VERSION) {
  error(`${RED}${BOLD}ERROR:${RESET} Node.js ${currentVersion} is not supported`);
  error(`File Organizer MCP requires Node.js ${MIN_NODE_VERSION} or higher`);
  error(`\nTo upgrade: https://nodejs.org/`);
  process.exit(1);
}

// Check if dist exists
if (!fs.existsSync(distIndexPath)) {
  log(`${YELLOW}⚠️  Server files not found. Attempting to build...${RESET}\n`);

  // Check if TypeScript source exists
  if (!fs.existsSync(srcIndexPath)) {
    error(`${RED}${BOLD}ERROR:${RESET} Source files not found.`);
    error(`This appears to be an incomplete installation.\n`);
    error(`Please reinstall:`);
    error(`  ${CYAN}npm uninstall -g file-organizer-mcp${RESET}`);
    error(`  ${CYAN}npm install -g file-organizer-mcp${RESET}`);
    process.exit(1);
  }

  // Check if TypeScript is available
  const hasTypeScript = fs.existsSync(path.join(packageRoot, 'node_modules', 'typescript'));

  if (hasTypeScript) {
    try {
      log(`${CYAN}Building from source...${RESET}`);
      execSync('npm run build', {
        cwd: packageRoot,
        stdio: 'inherit'
      });
      log(`${GREEN}✓ Build successful${RESET}\n`);
    } catch (e) {
      error(`${RED}${BOLD}Build failed${RESET}`);
      error(`\nPlease try building manually:`);
      error(`  cd "${packageRoot}"`);
      error(`  npm install && npm run build`);
      process.exit(1);
    }
  } else {
    // In npx mode or production install without devDependencies
    error(`${RED}${BOLD}INSTALLATION INCOMPLETE${RESET}\n`);
    error(`The server files are missing and TypeScript is not available to build them.\n`);
    error(`This usually happens when:`);
    error(`  • Installing with ${BOLD}--ignore-scripts${RESET}`);
    error(`  • The package was published without dist/ folder`);
    error(`  • npm prepare script failed\n`);
    error(`To fix this:\n`);
    error(`${BOLD}Option 1 - Reinstall properly:${RESET}`);
    error(`  ${CYAN}npm uninstall -g file-organizer-mcp${RESET}`);
    error(`  ${CYAN}npm install -g file-organizer-mcp${RESET}\n`);
    error(`${BOLD}Option 2 - Install with dev dependencies:${RESET}`);
    error(`  ${CYAN}cd "${packageRoot}"${RESET}`);
    error(`  ${CYAN}npm install${RESET}`);
    error(`  ${CYAN}npm run build${RESET}\n`);
    process.exit(1);
  }
}

// Verify critical dependencies
const nodeModulesPath = path.join(packageRoot, 'node_modules');
const criticalDeps = ['@modelcontextprotocol/sdk', 'chalk', 'node-cron'];
const missingDeps = [];

for (const dep of criticalDeps) {
  if (!fs.existsSync(path.join(nodeModulesPath, dep))) {
    missingDeps.push(dep);
  }
}

if (missingDeps.length > 0) {
  error(`${RED}${BOLD}MISSING DEPENDENCIES${RESET}\n`);
  error(`The following required packages are not installed:`);
  missingDeps.forEach(d => error(`  ${RED}•${RESET} ${d}`));
  error(`\nTo fix:`);
  error(`  ${CYAN}cd "${packageRoot}"${RESET}`);
  error(`  ${CYAN}npm install${RESET}`);
  process.exit(1);
}

// All checks passed, run the actual server
// Use relative path for more reliable module resolution
const serverRelativePath = '../dist/src/index.js';

import(serverRelativePath).catch(err => {
  error(`${RED}Failed to start server:${RESET}`, err.message);
  if (err.message.includes('Cannot find module')) {
    error(`\n${YELLOW}Try reinstalling:${RESET}`);
    error(`  ${CYAN}npm uninstall -g file-organizer-mcp${RESET}`);
    error(`  ${CYAN}npm install -g file-organizer-mcp${RESET}`);
  }
  process.exit(1);
});
