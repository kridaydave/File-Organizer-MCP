/**
 * Regression test for BUG-04: symlink escape via scoped isPathAllowed fallback
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PathValidatorService } from '../../../src/services/path-validator.service.js';

describe('BUG-04 symlink escape', () => {
  let testDir: string;
  let allowedDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bug04-'));
    allowedDir = path.join(testDir, 'allowed');
    outsideDir = path.join(testDir, 'outside');
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
  });

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('rejects path through symlink escaping allowed root via isPathAllowed', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const linkPath = path.join(allowedDir, 'exit');
    const secretPath = path.join(outsideDir, 'secret.txt');
    await fs.writeFile(secretPath, 'secret');
    await fs.symlink(outsideDir, linkPath, 'dir');

    const validator = new PathValidatorService(testDir, [allowedDir]);
    const result = validator.isPathAllowed(path.join(linkPath, 'secret.txt'));
    expect(result).toBe(false);
  });
});
