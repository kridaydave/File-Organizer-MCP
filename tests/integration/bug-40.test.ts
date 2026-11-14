import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { handleFindLargestFiles } from '../../src/tools/file-analysis.js';
import { handleCategorizeByType } from '../../src/tools/file-categorization.js';

describe('BUG-40: bad directory handling', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bug40-'));
  });

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 100));
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  it('find_largest_files returns error for non-existent directory', async () => {
    const nonExistent = path.join(testDir, 'does-not-exist');
    const result = await handleFindLargestFiles({ directory: nonExistent });
    expect(result.isError).toBe(true);
  });

  it('find_largest_files returns error when path is a file', async () => {
    const filePath = path.join(testDir, 'file.txt');
    await fs.writeFile(filePath, 'hello');
    const result = await handleFindLargestFiles({ directory: filePath });
    expect(result.isError).toBe(true);
  });

  it('categorize_by_type returns error for non-existent directory', async () => {
    const nonExistent = path.join(testDir, 'does-not-exist');
    const result = await handleCategorizeByType({ directory: nonExistent });
    expect(result.isError).toBe(true);
  });

  it('categorize_by_type returns error when path is a file', async () => {
    const filePath = path.join(testDir, 'file.txt');
    await fs.writeFile(filePath, 'hello');
    const result = await handleCategorizeByType({ directory: filePath });
    expect(result.isError).toBe(true);
  });
});
