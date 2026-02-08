/**
 * Path Validator Service Tests
 */

import { jest, describe, it, expect, afterEach } from '@jest/globals';

// ESM mocking requires unstable_mockModule BEFORE imports
// Mock fs/promises with default wrapper (matching how source imports it)
jest.unstable_mockModule('fs/promises', () => ({
  default: {
    access: jest.fn<() => Promise<void>>().mockImplementation(() => Promise.resolve()),
    constants: { W_OK: 2, R_OK: 4 },
  },
}));

// Import after mocking - fs will be the mocked default export
const { checkAccess } = await import('../../../src/services/path-validator.service.js');
const fs = (await import('fs/promises')).default;

describe('path-validator.service', () => {
  let mockAccess: jest.Mock<() => Promise<void>>;

  beforeEach(() => {
    mockAccess = fs.access as unknown as jest.Mock<() => Promise<void>>;
    mockAccess.mockReset();
  });

  describe('checkAccess', () => {
    it('should return true when path exists and is readable', async () => {
      mockAccess.mockResolvedValue(undefined);

      const result = await checkAccess('/test/file.txt', { requireExists: true });

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 4);
    });

    it('should return false when path does not exist', async () => {
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      mockAccess.mockRejectedValue(error);

      const result = await checkAccess('/nonexistent/file.txt', { requireExists: true });

      expect(result).toBe(false);
    });

    it('should check parent directory if path does not exist and requireExists is false', async () => {
      const enoentError = new Error('ENOENT');
      (enoentError as any).code = 'ENOENT';

      mockAccess.mockRejectedValueOnce(enoentError).mockResolvedValueOnce(undefined);

      const result = await checkAccess('/new/directory/file.txt', {
        requireExists: false,
        checkWrite: true,
      });

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledTimes(2);
    });

    it('should return false when no writable parent directory is found', async () => {
      const eaccesError = new Error('EACCES');
      (eaccesError as any).code = 'EACCES';

      mockAccess.mockRejectedValue(eaccesError);

      const result = await checkAccess('/nonexistent/file.txt', {
        requireExists: false,
        checkWrite: true,
      });

      expect(result).toBe(false);
    });
  });
});
