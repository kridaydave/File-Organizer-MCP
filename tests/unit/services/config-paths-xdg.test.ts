/**
 * Regression test for BUG-61: getUserConfigPath and getHistoryDirectory must honor XDG_CONFIG_HOME on Linux
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'path';
import os from 'os';
import { getUserConfigPath, getHistoryDirectory } from '../../../src/core/config/paths.js';

describe('Config paths XDG (BUG-61)', () => {
  const originalEnv = process.env;
  let platformSpy: jest.SpiedFunction<typeof os.platform> | null = null;

  beforeEach(() => {
    process.env = { ...originalEnv };
    platformSpy = jest.spyOn(os, 'platform').mockReturnValue('linux');
  });

  afterEach(() => {
    process.env = originalEnv;
    platformSpy?.mockRestore();
  });

  it('uses XDG_CONFIG_HOME for both config and history on Linux', () => {
    const xdgDir = path.join(
      os.tmpdir(),
      `xdg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    process.env.XDG_CONFIG_HOME = xdgDir;

    const configPath = getUserConfigPath();
    const historyDir = getHistoryDirectory();

    expect(configPath).toBe(path.join(xdgDir, 'file-organizer-mcp', 'config.json'));
    expect(historyDir).toBe(path.join(xdgDir, 'file-organizer-mcp'));
  });
});
