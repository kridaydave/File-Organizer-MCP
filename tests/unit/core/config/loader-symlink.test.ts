/**
 * Regression test for BUG-17: loadCustomAllowedDirs must block symlinked parents escaping home
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

jest.unstable_mockModule('../../../src/core/config/paths.js', () => {
  const actual = jest.requireActual('../../../src/core/config/paths.js') as any;
  return {
    ...actual,
    getUserConfigPath: jest.fn(),
  };
});

const { getUserConfigPath } = await import('../../../src/core/config/paths.js');
const { loadCustomAllowedDirs } = await import('../../../src/core/config/loader.js');

describe('loadCustomAllowedDirs - symlink containment (BUG-17)', () => {
  let testDir: string;
  let outsideDir: string;
  let configDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
    outsideDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cfg-outside-'));
    configDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cfg-dir-'));
    configPath = path.join(configDir, 'config.json');
    (getUserConfigPath as jest.Mock).mockReturnValue(configPath);
  });

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 100));
    await fs.promises.rm(testDir, { recursive: true, force: true });
    await fs.promises.rm(outsideDir, { recursive: true, force: true });
    await fs.promises.rm(configDir, { recursive: true, force: true });
  });

  it('blocks symlinked parent pointing outside home', () => {
    // Create outside target with data dir
    const outsideData = path.join(outsideDir, 'data');
    fs.mkdirSync(outsideData);

    // Create symlink inside testDir pointing outside
    const link = path.join(testDir, 'link');
    fs.symlinkSync(outsideDir, link);

    // Write config
    fs.writeFileSync(configPath, JSON.stringify({
      customAllowedDirectories: [path.join(link, 'data')],
    }));

    const result = loadCustomAllowedDirs();
    expect(result).toEqual([]);
  });
});
