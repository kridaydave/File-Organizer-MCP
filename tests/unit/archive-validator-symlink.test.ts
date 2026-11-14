import { describe, it, expect } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { validateEntryPath } from '../../src/security/archive-validator.js';

describe('Archive validator symlink protection', () => {
  it('should reject entries that escape via symlinked directories', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-test-'));
    const extractDir = path.join(baseDir, 'extract');
    const outsideDir = path.join(baseDir, 'outside');
    await fs.mkdir(extractDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, 'passwd'), 'secret');

    const symlinkPath = path.join(extractDir, 'link');
    await fs.symlink(outsideDir, symlinkPath);

    const result = validateEntryPath('link/passwd', extractDir);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/zip-slip|escapes/i);

    await fs.rm(baseDir, { recursive: true, force: true });
  });
});
