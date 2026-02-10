#!/usr/bin/env node

/**
 * File Organizer MCP - Setup Wizard Wrapper
 * 
 * Ensures setup wizard can run even if dist/ is missing
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, '..');
const distTuiPath = path.join(packageRoot, 'dist', 'src', 'tui', 'index.js');
const srcTuiPath = path.join(packageRoot, 'src', 'tui', 'index.ts');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// Check Node.js version
const MIN_NODE_VERSION = 18;
const majorVersion = parseInt(process.versions.node.split('.')[0], 10);

if (majorVersion < MIN_NODE_VERSION) {
  console.error(`${RED}${BOLD}ERROR:${RESET} Node.js ${process.versions.node} is not supported`);
  console.error(`File Organizer MCP requires Node.js ${MIN_NODE_VERSION} or higher`);
  process.exit(1);
}

// Check if dist exists, try to build if not
if (!fs.existsSync(distTuiPath)) {
  console.log(`${YELLOW}⚠️  Setup files not found. Attempting to build...${RESET}\n`);

  if (!fs.existsSync(srcTuiPath)) {
    console.error(`${RED}ERROR:${RESET} Source files not found.`);
    console.error(`Please reinstall: npm install -g file-organizer-mcp`);
    process.exit(1);
  }

  const hasTypeScript = fs.existsSync(path.join(packageRoot, 'node_modules', 'typescript'));

  if (hasTypeScript) {
    try {
      console.log(`${CYAN}Building from source...${RESET}`);
      execSync('npm run build', { cwd: packageRoot, stdio: 'inherit' });
      console.log(`${GREEN}✓ Build successful${RESET}\n`);
    } catch (e) {
      console.error(`${RED}Build failed${RESET}`);
      console.error(`Run manually: cd "${packageRoot}" && npm install && npm run build`);
      process.exit(1);
    }
  } else {
    console.error(`${RED}${BOLD}INSTALLATION INCOMPLETE${RESET}\n`);
    console.error(`Setup files are missing. Please reinstall:`);
    console.error(`  ${CYAN}npm uninstall -g file-organizer-mcp${RESET}`);
    console.error(`  ${CYAN}npm install -g file-organizer-mcp${RESET}`);
    process.exit(1);
  }
}

// Run the setup wizard
// Use relative path for more reliable module resolution
const setupRelativePath = '../dist/src/tui/index.js';

import(setupRelativePath).catch(err => {
  console.error(`${RED}Failed to start setup:${RESET}`, err.message);
  process.exit(1);
});
