/**
 * Regression test for BUG-87: diagnostics should accept JSONC (comments) like the loader
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('diagnostics JSONC config', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-jsonc-test-'));
    // Point HOME to temp dir so getUserConfigPath resolves under tempDir
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('accepts JSONC config with comments and matches loader result', async () => {
    const { getUserConfigPath } = await import('../../../src/core/config/paths.js');
    const { loadUserConfig } = await import('../../../src/core/config/loader.js');
    const { runDiagnostics } = await import('../../../src/utils/diagnostics.js');

    const configPath = getUserConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });

    // Config with comments - JSONC
    const configWithComments = `{
      // Custom directories
      "customAllowedDirectories": [],
      /* conflict strategy */
      "conflictStrategy": "rename"
    }`;
    fs.writeFileSync(configPath, configWithComments, 'utf-8');

    const loaded = loadUserConfig();
    expect(loaded).toBeDefined();
    expect(loaded.conflictStrategy).toBe('rename');

    const summary = await runDiagnostics();
    const configResult = summary.results.find((r) => r.name === 'Configuration File');
    expect(configResult).toBeDefined();
    expect(configResult?.success).toBe(true);
  });
});
