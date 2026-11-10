/**
 * Regression test for BUG-59
 * Unwatch via original symlink path fails to remove the watch
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  handleWatchDirectory,
  handleUnwatchDirectory,
  handleListWatches,
} from '../../../../src/extensions/scheduler/watch-manager.js';
import { loadUserConfig, updateUserConfig, getUserConfigPath } from '../../../../src/config.js';

describe('BUG-59: unwatch via original symlink path', () => {
  let realDir: string;
  let symlinkDir: string;
  let originalConfig: string | null = null;
  const configPath = getUserConfigPath();

  beforeAll(async () => {
    if (fs.existsSync(configPath)) {
      originalConfig = fs.readFileSync(configPath, 'utf-8');
    }

    const base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bug59-'));
    realDir = path.join(base, 'real');
    symlinkDir = path.join(base, 'link');
    await fs.promises.mkdir(realDir, { recursive: true });
    try {
      fs.symlinkSync(realDir, symlinkDir);
    } catch {
      // If symlink creation fails, skip test environment issues
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(symlinkDir)) {
        try {
          fs.unlinkSync(symlinkDir);
        } catch {}
      }
      const base = path.dirname(realDir);
      if (base && fs.existsSync(base)) {
        fs.rmSync(base, { recursive: true, force: true });
      }
    } catch {}

    if (originalConfig !== null) {
      fs.writeFileSync(configPath, originalConfig);
    } else if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  beforeEach(() => {
    updateUserConfig({ watchList: [] });
  });

  it('should remove watch when unwatching via original symlink path', async () => {
    const watchResult = await handleWatchDirectory({
      directory: symlinkDir,
      schedule: '0 10 * * *',
      auto_organize: true,
      response_format: 'json',
    });

    expect(watchResult.isError).toBeFalsy();

    const unwatchResult = await handleUnwatchDirectory({
      directory: symlinkDir,
      response_format: 'json',
    });

    expect(unwatchResult.isError).toBeFalsy();

    const listResult = await handleListWatches({ response_format: 'json' });
    const listData = JSON.parse(listResult.content[0].text);
    expect(listData.count).toBe(0);
  });
});
