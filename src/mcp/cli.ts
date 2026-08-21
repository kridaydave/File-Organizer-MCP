/**
 * File Organizer MCP Server v3.5.0
 * CLI helpers — preflight checks + arg parsing
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";
import { CONFIG } from "../config.js";

// ─── Preflight: Node version ───────────────────────────────────────

const MIN_NODE_VERSION = 18;

export function checkNodeVersion(): void {
  const currentNodeVersion = process.versions.node;
  const majorVersion = parseInt(currentNodeVersion.split(".")[0] || "0", 10);

  if (majorVersion < MIN_NODE_VERSION) {
    logger.error(
      `
╔══════════════════════════════════════════════════════════════════╗
║  ERROR: Node.js version ${currentNodeVersion.padEnd(8)} is not supported                ║
╠══════════════════════════════════════════════════════════════════╣
║  File Organizer MCP requires Node.js ${MIN_NODE_VERSION} or higher                          ║
║                                                                  ║
║  To upgrade:                                                     ║
║    • Visit: https://nodejs.org/                                  ║
║    • Or use a version manager:                                   ║
║      - nvm (Linux/Mac): nvm install ${MIN_NODE_VERSION} && nvm use ${MIN_NODE_VERSION}                   ║
║      - nvm-windows: nvm install ${MIN_NODE_VERSION}.0.0 && nvm use ${MIN_NODE_VERSION}.0.0            ║
╚══════════════════════════════════════════════════════════════════╝
  `.trim(),
    );
    process.exit(1);
  }
}

// ─── Preflight: dist integrity ─────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function checkDistIntegrity(): void {
  const distIndexPath = path.join(__dirname, "..", "index.js");
  const distServerPath = path.join(__dirname, "..", "server.js");

  if (!fs.existsSync(distIndexPath) || !fs.existsSync(distServerPath)) {
    const packageRoot = path.resolve(__dirname, "..", "..");
    logger.error(
      `
╔══════════════════════════════════════════════════════════════════╗
║  INSTALLATION INCOMPLETE                                         ║
╠══════════════════════════════════════════════════════════════════╣
║  The server files (dist/) are missing or incomplete.             ║
║                                                                  ║
║  Common causes:                                                  ║
║    • npm install --ignore-scripts (skipped prepare script)       ║
║    • Global install without proper build step                    ║
║    • Installing from GitHub without devDependencies              ║
║    • Package corruption during download                          ║
║                                                                  ║
║  How to fix:                                                     ║
║                                                                  ║
║  For regular users:                                              ║
║    npm uninstall -g file-organizer-mcp                           ║
║    npm install -g file-organizer-mcp                             ║
║                                                                  ║
║  For GitHub/source installs:                                     ║
║    cd "${packageRoot}"                                           ║
║    npm install && npm run build                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `.trim(),
    );
    process.exit(1);
  }
}

// ─── Preflight: critical deps ──────────────────────────────────────

export function checkCriticalDependencies(): void {
  const nodeModulesPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "node_modules",
  );
  const criticalDeps = [
    "@modelcontextprotocol/sdk",
    "chalk",
    "node-cron",
    "zod",
  ];
  const missingDeps: string[] = [];

  for (const dep of criticalDeps) {
    const depPath = path.join(nodeModulesPath, dep);
    if (!fs.existsSync(depPath)) {
      missingDeps.push(dep);
    }
  }

  if (missingDeps.length > 0) {
    logger.error(
      `
╔══════════════════════════════════════════════════════════════════╗
║  INCOMPLETE DEPENDENCIES                                         ║
╠══════════════════════════════════════════════════════════════════╣
║  Required packages failed to install:                            ║
║                                                                  ║
${missingDeps.map((d) => `║    • ${d.padEnd(59)}║`).join("\n")}
║                                                                  ║
║  Common causes:                                                  ║
║    • npm install --production (skipped dependencies)             ║
║    • Network interruption during install                         ║
║    • npm cache corruption                                        ║
║                                                                  ║
║  How to fix:                                                     ║
║                                                                  ║
║    rm -rf node_modules package-lock.json                         ║
║    npm cache clean --force                                       ║
║    npm install                                                   ║
║                                                                  ║
║  For global installs:                                            ║
║    npm uninstall -g file-organizer-mcp                           ║
║    npm cache clean --force                                       ║
║    npm install -g file-organizer-mcp                             ║
╚══════════════════════════════════════════════════════════════════╝
  `.trim(),
    );
    process.exit(1);
  }
}

/**
 * Run all pre-flight checks sequentially.
 * Exits the process on failure (same as original top-level checks).
 */
export function runPreflightChecks(): void {
  checkNodeVersion();
  checkDistIntegrity();
  checkCriticalDependencies();
}

// ─── CLI arg parsing ───────────────────────────────────────────────

export function parseArgs(): string[] {
  return process.argv.slice(2);
}

/**
 * Handle --help / --version / --setup flags.
 * Mirrors original main() flag handling — exits on match.
 */
export async function handleCliFlags(): Promise<void> {
  const args = parseArgs();

  if (args.includes("--help") || args.includes("-h")) {
    logger.info(`
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

  if (args.includes("--version") || args.includes("-v")) {
    logger.info(`File Organizer MCP Server v${CONFIG.VERSION}`);
    process.exit(0);
  }

  if (args.includes("--setup") || args.includes("-s")) {
    const { startSetupWizard } = await import("../tui/setup-wizard.js");
    await startSetupWizard();
    process.exit(0);
    return;
  }
}
