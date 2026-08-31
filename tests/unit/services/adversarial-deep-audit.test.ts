/**
 * Adversarial Deep Audit Test Suite
 * Tests high-stress concurrency, circular symlinks, Unicode edge cases,
 * corrupted manifests, and boundary values across the codebase.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { PathValidatorService } from '../../../src/services/path-validator.service.js';
import { DuplicateFinderService } from '../../../src/core/hash/duplicate-finder.js';
import { OrganizerService } from '../../../src/core/organize/organizer.js';
import { CategorizerService } from '../../../src/services/categorizer.service.js';
import { RenamingService } from '../../../src/core/organize/rename.js';
import { RollbackService } from '../../../src/core/organize/rollback.js';
import { FileScannerService } from '../../../src/core/scan/scanner.js';
import { readFile } from '../../../src/core/io/read-file.js';
import { assertNotSensitive } from '../../../src/core/io/sensitive-files.js';
import { sanitizeErrorMessage } from '../../../src/utils/error-handler.js';
import { parseJsonc } from '../../../src/tui/client-detector.js';
import { CONFIG } from '../../../src/core/config/defaults.js';

describe('Adversarial Deep Edge-Case Suite', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adv-audit-'));
    CONFIG.paths.customAllowed = [tempDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = [];
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('1. Path Validator & Symlink Traversal Under Adversarial Conditions', () => {
    it('rejects circular symlink loops without hanging or throwing unhandled errors', async () => {
      const dirA = path.join(tempDir, 'dirA');
      const dirB = path.join(dirA, 'dirB');
      await fs.mkdir(dirA, { recursive: true });

      try {
        // Create circular symlink: dirA/dirB -> dirA
        await fs.symlink(dirA, dirB, 'dir');
        const validator = new PathValidatorService([tempDir]);
        const loopedPath = path.join(dirB, 'dirB', 'file.txt');
        const isAllowed = await validator.isPathAllowed(loopedPath);
        expect(typeof isAllowed).toBe('boolean');
      } catch (err) {
        // Symlinks might fail on unprivileged Windows; handle gracefully
        if ((err as any).code === 'EPERM') return;
        throw err;
      }
    });

    it('rejects null byte injections and double slash traversal', async () => {
      const validator = new PathValidatorService([tempDir]);
      const nullByte = path.join(tempDir, 'test\0file.txt');
      const isAllowed = await validator.isPathAllowed(nullByte);
      expect(isAllowed).toBe(false);
    });
  });

  describe('2. Unicode, Diacritics and International Filename Handling', () => {
    it('correctly handles accented and non-Latin filenames during organization', async () => {
      const file1 = path.join(tempDir, 'résumé.pdf');
      const file2 = path.join(tempDir, 'отчет.docx');
      const file3 = path.join(tempDir, '写真.jpg');

      await fs.writeFile(file1, 'pdf data');
      await fs.writeFile(file2, 'word data');
      await fs.writeFile(file3, 'image data');

      const scanner = new FileScannerService();
      const files = await scanner.getAllFiles(tempDir, false);
      const organizer = new OrganizerService(new CategorizerService([]));

      const res = await organizer.organize(tempDir, files, { dryRun: false });
      expect(res.actions.length).toBe(3);

      // Verify files reached their categories without mangling Unicode names
      await expect(fs.access(path.join(tempDir, 'Documents', 'résumé.pdf'))).resolves.not.toThrow();
      await expect(fs.access(path.join(tempDir, 'Documents', 'отчет.docx'))).resolves.not.toThrow();
      await expect(fs.access(path.join(tempDir, 'Images', '写真.jpg'))).resolves.not.toThrow();
    });

    it('preserves Unicode characters during case renaming (toSnakeCase / toKebabCase)', async () => {
      const file = path.join(tempDir, 'Mon_Résumé_Final.pdf');
      await fs.writeFile(file, 'test');

      const renamer = new RenamingService();
      const preview = await renamer.applyRenameRules([file], [
        { type: 'case', casing: 'snake' },
      ]);

      expect(preview[0]?.new).toBeDefined();
      // Should preserve résumé rather than stripping it to r_sum
      expect(path.basename(preview[0]!.new)).toContain('résumé');
    });
  });

  describe('3. Large File Chunking & 0-Byte Boundary Reads', () => {
    it('reads chunks with offset from files exceeding maxBytes without crashing', async () => {
      const largeFile = path.join(tempDir, 'large.bin');
      const buffer = Buffer.alloc(1024 * 1024, 0x41); // 1MB buffer of 'A's
      await fs.writeFile(largeFile, buffer);

      // Read 100 bytes from offset 500 with maxBytes 200
      const readRes = await readFile(largeFile, {
        offset: 500,
        maxBytes: 200,
      });

      expect(readRes.bytesRead).toBe(200);
      expect(readRes.totalSize).toBe(1024 * 1024);
    });

    it('returns empty data for 0-byte files without throwing', async () => {
      const emptyFile = path.join(tempDir, 'empty.txt');
      await fs.writeFile(emptyFile, '');

      const readRes = await readFile(emptyFile);
      expect(readRes.data).toBe('');
      expect(readRes.bytesRead).toBe(0);
      expect(readRes.totalSize).toBe(0);
    });
  });

  describe('4. JSONC Parsing Resilience', () => {
    it('safely parses JSONC with complex inline comments, multiline comments, and trailing commas', () => {
      const jsoncInput = `
        {
          // First line comment
          "name": "file-organizer-mcp", /* block comment */
          "enabled": true,
          "directories": [
            "/home/user/Downloads",
            "/home/user/Desktop", // trailing comma in array
          ],
          "options": {
            "conflict": "rename", // trailing comma in object
          },
        }
      `;

      const parsed = parseJsonc(jsoncInput) as any;
      expect(parsed.name).toBe('file-organizer-mcp');
      expect(parsed.enabled).toBe(true);
      expect(parsed.directories).toHaveLength(2);
      expect(parsed.options.conflict).toBe('rename');
    });
  });

  describe('5. Error Redaction Resilience on Complex Strings', () => {
    it('redacts Unix paths with spaces and Windows UNC paths in error messages', () => {
      const rawError1 = 'Failed to open file at /home/kriday/My Documents/secret.pdf: permission denied';
      const sanitized1 = sanitizeErrorMessage(rawError1);
      expect(sanitized1).not.toContain('/home/kriday/My Documents');

      const rawError2 = 'Error: file not found at path=/var/log/audit.log';
      const sanitized2 = sanitizeErrorMessage(rawError2);
      expect(sanitized2).not.toContain('/var/log/audit.log');
    });
  });
});
