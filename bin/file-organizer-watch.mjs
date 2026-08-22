#!/usr/bin/env node

/**
 * File Organizer Watch — bin wrapper
 *
 * Runs the standalone scheduler daemon (or manages the watch list) from the
 * compiled output. Mirrors bin/file-organizer-mcp.mjs but without MCP
 * preflight — this process never speaks JSON-RPC.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(
  packageRoot,
  'dist',
  'src',
  'extensions',
  'scheduler',
  'watch-cli.js',
);

if (!fs.existsSync(cliPath)) {
  console.error('file-organizer-watch: build output missing.');
  console.error(`Expected: ${cliPath}`);
  console.error('Run `npm run build` and try again.');
  process.exit(1);
}

await import(`file://${cliPath}`);
