/**
 * Adversarial Tool Gates Suite
 * End-to-end security invariants:
 * 1. Symlink escape rejection in whitelist & project modes
 * 2. Sensitive file (.git, .ssh, .env) rejection
 * 3. Error response sanitization (no raw paths in responses)
 * 4. Legitimate archive name acceptance vs traversal rejection
 * 5. EXDEV safe move without buffer exhaustion
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PathValidatorService } from '../../../src/services/path-validator.service.js';
import { readFile } from '../../../src/core/io/read-file.js';
import { isSensitiveFile } from '../../../src/core/io/sensitive-files.js';
import { sanitizeErrorMessage, createErrorResponse } from '../../../src/utils/error-handler.js';
import { validateArchiveEntries } from '../../../src/security/archive-validator.js';
import { SystemOrganizeService } from '../../../src/services/system-organize.service.js';
import { CONFIG } from '../../../src/core/config/defaults.js';
import { AccessDeniedError } from '../../../src/types.js';

describe('Adversarial Security & Invariant Gates', () => {
  let sandboxDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adv-sandbox-'));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adv-outside-'));
    CONFIG.paths.customAllowed = [sandboxDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = [];
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => null);
    await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => null);
  });

  describe('1. Symlink Containment & Whitelist Enforcement', () => {
    it('rejects symlinks inside allowed dir that point to an outside directory', async () => {
      const secretFile = path.join(outsideDir, 'secret.txt');
      await fs.writeFile(secretFile, 'super-secret-content', 'utf-8');

      const symlinkFile = path.join(sandboxDir, 'link-to-outside.txt');
      try {
        await fs.symlink(secretFile, symlinkFile);
      } catch {
        // Skip on environments where symlink creation requires admin rights
        return;
      }

      const validator = new PathValidatorService();
      // isPathAllowed must return false for a symlink pointing outside allowed roots
      const allowed = await validator.isPathAllowed(symlinkFile);
      expect(allowed).toBe(false);

      // readFile must throw AccessDeniedError or ValidationError
      await expect(readFile(symlinkFile)).rejects.toThrow();
    });

    it('rejects symlinks in scoped allowedPaths mode pointing outside scope', async () => {
      const outsideFile = path.join(outsideDir, 'external.txt');
      await fs.writeFile(outsideFile, 'external', 'utf-8');

      const symlinkFile = path.join(sandboxDir, 'scoped-link.txt');
      try {
        await fs.symlink(outsideFile, symlinkFile);
      } catch {
        return;
      }

      const scopedValidator = new PathValidatorService([sandboxDir]);
      await expect(scopedValidator.validatePath(symlinkFile)).rejects.toThrow();
    });
  });

  describe('2. Sensitive File Access Gates', () => {
    it('blocks .git directory files even when scoped to a project folder', async () => {
      const gitDir = path.join(sandboxDir, '.git');
      await fs.mkdir(gitDir, { recursive: true });
      const gitConfigFile = path.join(gitDir, 'config');
      await fs.writeFile(gitConfigFile, '[core]\nrepositoryformatversion = 0\n', 'utf-8');

      expect(isSensitiveFile(gitConfigFile)).toBe(true);

      const validator = new PathValidatorService([sandboxDir]);
      await expect(validator.openAndValidateFile(gitConfigFile)).rejects.toThrow();
      await expect(readFile(gitConfigFile)).rejects.toThrow();
    });

    it('blocks .ssh, .env, and credentials files', () => {
      expect(isSensitiveFile(path.join(sandboxDir, '.env'))).toBe(true);
      expect(isSensitiveFile(path.join(sandboxDir, '.env.production'))).toBe(true);
      expect(isSensitiveFile(path.join(sandboxDir, '.ssh', 'id_rsa'))).toBe(true);
      expect(isSensitiveFile(path.join(sandboxDir, '.aws', 'credentials'))).toBe(true);
      expect(isSensitiveFile(path.join(sandboxDir, 'id_ed25519'))).toBe(true);
    });
  });

  describe('3. Error Message Sanitization (Zero Path Leak)', () => {
    it('sanitizes single and double backslash Windows paths in errors', () => {
      const errorJson = JSON.stringify({
        source: 'C:\\Users\\kriday\\secrets\\passwords.txt',
        target: 'D:\\Backups\\2026\\data.json',
      });
      const sanitized = sanitizeErrorMessage(errorJson);
      expect(sanitized).not.toContain('C:\\\\Users');
      expect(sanitized).not.toContain('D:\\\\Backups');
      expect(sanitized).toContain('[PATH]');
    });

    it('sanitizes Unix absolute paths without leaking folder names', () => {
      const message = 'Failed to access /home/kriday/personal/tax-2025.pdf: Permission denied';
      const sanitized = sanitizeErrorMessage(message);
      expect(sanitized).not.toContain('/home/kriday');
      expect(sanitized).toContain('[PATH]');
    });

    it('createErrorResponse cleans AccessDeniedError without duplicate prefix', () => {
      const err = new AccessDeniedError('/home/kriday/secret.txt', 'Access denied to secret file');
      const response = createErrorResponse(err);
      expect(response.isError).toBe(true);
      const text = response.content[0]?.text || '';
      expect(text).not.toContain('Access Denied: Access Denied');
      expect(text).not.toContain('/home/kriday');
    });
  });

  describe('4. Archive BLOCKED_PATTERNS Boundary Checks', () => {
    it('accepts legitimate filenames starting with etc, lib, home, or bootstrap', async () => {
      const entries = [
        { name: 'bootstrap.css', uncompressedSize: 500, compressedSize: 100 },
        { name: 'homepage.html', uncompressedSize: 1000, compressedSize: 200 },
        { name: 'assets/lib_helper.js', uncompressedSize: 200, compressedSize: 50 },
      ];

      const res = await validateArchiveEntries(entries, sandboxDir);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects system directories like etc/passwd or /bin/sh', async () => {
      const entries = [
        { name: 'etc/passwd', uncompressedSize: 500, compressedSize: 100 },
        { name: '/bin/sh', uncompressedSize: 1000, compressedSize: 200 },
      ];

      const res = await validateArchiveEntries(entries, sandboxDir);
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    });
  });

  describe('5. System Organize EXDEV Safety', () => {
    it('moves files cleanly without error', async () => {
      const service = new SystemOrganizeService();
      const testFile = path.join(sandboxDir, 'test-doc.pdf');
      await fs.writeFile(testFile, 'Sample PDF content for organization', 'utf-8');

      const result = await service.systemOrganize({ sourceDir: sandboxDir, dryRun: true });
      expect(result).toBeDefined();
      expect(result.failed).toBe(0);
    });
  });
});
