import { describe, it, expect } from '@jest/globals';
import path from 'path';
import os from 'os';
import { validateArchiveEntries } from '../../../src/security/archive-validator.js';

describe('BUG-23: archive decompression ratio check', () => {
  it('rejects high ratio when archive compressed size is omitted', () => {
    const targetDir = path.join(os.tmpdir(), 'archive-test');
    const entries = [{ name: 'a.bin', uncompressedSize: 100000000 }];
    const res = validateArchiveEntries(entries, targetDir);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('ratio') || e.includes('exceeds'))).toBe(true);
  });
});
