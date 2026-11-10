/**
 * Regression test for BUG-61: getUserConfigPath must honor XDG_CONFIG_HOME on Linux
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import os from 'os';
import { getUserConfigPath, getHistoryDirectory } from '../../../src/core/config/paths.js';

describe('Config paths XDG (BUG-61)', () => {
  const originalEnv = process.env;
  const originalPlatform = process.platform;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('uses XDG_CONFIG_HOME for both config and history on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const xdgDir = path.join(os.tmpdir(), `xdg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.XDG_CONFIG_HOME = xdgDir;

    const configPath = getUserConfigPath();
    const historyDir = getHistoryDirectory();

    expect(configPath).toBe(path.join(xdgDir, 'file-organizer-mcp', 'config.json'));
    expect(historyDir).toBe(path.join(xdgDir, 'file-organizer-mcp'));
  });
});
