/**
 * Regression test for BUG-63: setup wizard must persist allowExternalVolumes
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyConfiguration } from '../../../src/tui/setup-wizard.js';
import { getUserConfigPath } from '../../../src/config.js';

describe('BUG-63: setup wizard persists allowExternalVolumes', () => {
  let testHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-wizard-test-'));
    process.env.HOME = testHome;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    try {
      fs.rmSync(testHome, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('persists allowExternalVolumes true to config.json', async () => {
    const answers = {
      folders: [],
      customFolders: [],
      allowExternalVolumes: true,
      conflictStrategy: 'rename' as const,
      selectedClients: [],
    };

    await applyConfiguration(answers);

    const configPath = getUserConfigPath();
    expect(fs.existsSync(configPath)).toBe(true);
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(configData.allowExternalVolumes).toBe(true);
  });
});
