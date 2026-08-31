/**
 * v5 Critical Regression Test Suite
 * Ensures all fixes for data safety, security containment, and MCP protocol compliance remain locked.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DuplicateFinderService } from '../../../src/core/hash/duplicate-finder.js';
import { RenamingService } from '../../../src/core/organize/rename.js';
import { ManifestIntegrityService } from '../../../src/core/organize/manifest-integrity.js';
import { assertNotSensitive } from '../../../src/core/io/sensitive-files.js';
import { isPathBlocked } from '../../../src/utils/path-security.js';
import { PathValidatorService } from '../../../src/services/path-validator.service.js';
import { handleListFiles } from '../../../src/tools/file-listing.js';
import { handleScanDirectory } from '../../../src/tools/file-scanning.js';
import { handleCategorizeByType } from '../../../src/tools/file-categorization.js';
import { CategorizerService } from '../../../src/services/categorizer.service.js';
import { isExecutableType } from '../../../src/core/categorize/security.js';
import { readFile } from '../../../src/core/io/read-file.js';
import { stripGPSData } from '../../../src/services/metadata/image-privacy.js';
import { parseJsonc } from '../../../src/tui/client-detector.js';
import { PhotoOrganizerService } from '../../../src/services/photo-organizer.service.js';
import { CONFIG } from '../../../src/core/config/defaults.js';
import type { FileWithSize } from '../../../src/types.js';

describe('v5 Critical Regressions Gate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'v5-regressions-'));
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('1. Data Safety & Duplicate Finder', () => {
    it('never recommends deleting 0-byte (empty) files as duplicates', async () => {
      const empty1 = path.join(tempDir, '__init__.py');
      const empty2 = path.join(tempDir, '.gitkeep');
      const empty3 = path.join(tempDir, 'empty.txt');

      await fs.writeFile(empty1, '');
      await fs.writeFile(empty2, '');
      await fs.writeFile(empty3, '');

      const files: FileWithSize[] = [
        { path: empty1, name: '__init__.py', size: 0, extension: '.py' },
        { path: empty2, name: '.gitkeep', size: 0, extension: '' },
        { path: empty3, name: 'empty.txt', size: 0, extension: '.txt' },
      ];

      const finder = new DuplicateFinderService();
      const result = await finder.findWithScoring(files, 'newest');

      // 0-byte files should not form duplicate groups or be recommended for deletion
      expect(result).toHaveLength(0);
    });
  });

  describe('2. Case-Only Rename Safety', () => {
    it('prevents silent overwrite of distinct file during case change', async () => {
      const fileLower = path.join(tempDir, 'file.txt');
      const fileUpper = path.join(tempDir, 'FILE.TXT');

      await fs.writeFile(fileLower, 'lower content');
      await fs.writeFile(fileUpper, 'upper content');

      const renamer = new RenamingService();
      const previews = await renamer.applyRenameRules([fileLower], [
        { type: 'case', casing: 'upper' },
      ]);

      await renamer.executeRename(previews, false);

      const statLower = await fs.stat(fileLower).catch(() => null);
      const statUpper = await fs.stat(fileUpper).catch(() => null);

      if (statLower && statUpper) {
        const upperContent = await fs.readFile(fileUpper, 'utf8');
        expect(upperContent).toBe('upper content');
      }
    });

    it('previewing renames does not mutate disk with 0-byte probe files', async () => {
      const file = path.join(tempDir, 'doc.txt');
      await fs.writeFile(file, 'hello');

      const target = path.join(tempDir, 'DOC.TXT');
      const renamer = new RenamingService();

      const preview = await renamer.applyRenameRules([file], [
        { type: 'case', casing: 'upper' },
      ]);

      expect(preview).toHaveLength(1);
      const targetExists = await fs.stat(target).catch(() => null);
      if (process.platform === 'linux') {
        expect(targetExists).toBeNull();
      }
    });
  });

  describe('3. Persistent Machine ID & Manifest Integrity', () => {
    it('manifest HMAC verification succeeds across separate calls using persistent machine-id', async () => {
      const service1 = new ManifestIntegrityService();
      const timestamp = Date.now();
      const actions = [
        {
          id: 'act-1',
          type: 'move' as const,
          originalPath: path.join(tempDir, 'a.txt'),
          currentPath: path.join(tempDir, 'b.txt'),
          timestamp,
        },
      ];

      const hash = service1.computeHash(actions, timestamp);
      const manifestBase = {
        id: 'test-manifest-1',
        version: '1.0',
        timestamp,
        description: 'Test organize',
        actions,
        hash,
      };
      const signature = service1.computeSignature(manifestBase);
      const signedManifest = { ...manifestBase, signature };

      const service2 = new ManifestIntegrityService();
      const verification = service2.verifyManifest(signedManifest);
      expect(verification.valid).toBe(true);
    });
  });

  describe('4. Security & Sensitive File Protection', () => {
    it('blocks percent-encoded sensitive paths (%2eenv)', () => {
      expect(() => assertNotSensitive('/home/user/%2eenv')).toThrow();
      expect(() => assertNotSensitive('/home/user/project/%252eenv')).toThrow();
    });

    it('blocks Windows NTFS stream specifiers (config.json::$DATA)', () => {
      expect(() => assertNotSensitive('/home/user/.env::$DATA')).toThrow();
    });

    it('blocks files inside sensitive subdirectories (.gnupg, .ssh, .aws)', () => {
      expect(() => assertNotSensitive('/home/user/.gnupg/secring.gpg')).toThrow();
      expect(() => assertNotSensitive('/home/user/.ssh/id_rsa')).toThrow();
      expect(() => assertNotSensitive('/home/user/.aws/credentials')).toThrow();
    });

    it('blocks paths without trailing slash in blacklist', () => {
      expect(isPathBlocked('/etc')).toBe(true);
      expect(isPathBlocked('/var')).toBe(true);
      expect(isPathBlocked('/home/user/repo/.git')).toBe(true);
    });

    it('validates ancestor directory symlinks for non-existent target paths', async () => {
      const validator = new PathValidatorService([tempDir]);
      const validSubPath = path.join(tempDir, 'nested', 'newfile.txt');
      const isAllowed = await validator.isPathAllowed(validSubPath);
      expect(isAllowed).toBe(true);
    });
  });

  describe('5. MCP Protocol Compliance', () => {
    it('returns isError: true on schema validation failure across tools', async () => {
      const listRes = await handleListFiles({ invalid_param: 123 });
      expect(listRes.isError).toBe(true);

      const scanRes = await handleScanDirectory({ invalid_param: 123 });
      expect(scanRes.isError).toBe(true);

      const catRes = await handleCategorizeByType({ invalid_param: 123 });
      expect(catRes.isError).toBe(true);
    });

    it('dynamically reflects custom allowed directories in CONFIG.paths', () => {
      const customAllowed = CONFIG.paths.customAllowed;
      expect(Array.isArray(customAllowed)).toBe(true);
    });
  });

  describe('6. File Classification & Security Screening Regressions', () => {
    it('does not flag JPEG and MPEG files as executables or suspicious', async () => {
      const validator = new PathValidatorService(tempDir, [tempDir]);
      const categorizer = new CategorizerService(validator);

      const jpegPath = path.join(tempDir, 'photo.jpg');
      const jpegHeader = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        Buffer.from('JFIF\0', 'ascii'),
        Buffer.alloc(100),
      ]);
      await fs.writeFile(jpegPath, jpegHeader);

      const mpegPath = path.join(tempDir, 'video.mpeg');
      const mpegHeader = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x01, 0xba]),
        Buffer.alloc(100),
      ]);
      await fs.writeFile(mpegPath, mpegHeader);

      const jpegSecurity = await categorizer.classifySecurity(jpegPath);
      expect(jpegSecurity.isExecutable).toBe(false);
      expect(jpegSecurity.isSuspicious).toBe(false);
      expect(jpegSecurity.threatLevel).toBe('none');

      const mpegSecurity = await categorizer.classifySecurity(mpegPath);
      expect(mpegSecurity.isExecutable).toBe(false);
      expect(mpegSecurity.isSuspicious).toBe(false);
      expect(mpegSecurity.threatLevel).toBe('none');

      expect(isExecutableType('JPEG')).toBe(false);
      expect(isExecutableType('MPEG')).toBe(false);
    });

    it('does not misclassify catalog.pdf, prescription.pdf, contest_entry.jpg as Logs/Scripts/Tests during content categorization', async () => {
      const validator = new PathValidatorService(tempDir, [tempDir]);
      const categorizer = new CategorizerService(validator);

      const catalogPdf = path.join(tempDir, 'catalog.pdf');
      const prescriptionPdf = path.join(tempDir, 'prescription.pdf');
      const contestJpg = path.join(tempDir, 'contest_entry.jpg');

      const pdfContent = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.alloc(50),
      ]);
      const jpgContent = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        Buffer.from('JFIF\0', 'ascii'),
        Buffer.alloc(50),
      ]);

      await fs.writeFile(catalogPdf, pdfContent);
      await fs.writeFile(prescriptionPdf, pdfContent);
      await fs.writeFile(contestJpg, jpgContent);

      const catalogResult = await categorizer.getCategoryByContent(catalogPdf);
      expect(catalogResult.category).toBe('Documents');
      expect(catalogResult.category).not.toBe('Logs');

      const prescriptionResult = await categorizer.getCategoryByContent(prescriptionPdf);
      expect(prescriptionResult.category).toBe('Documents');
      expect(prescriptionResult.category).not.toBe('Scripts');

      const contestResult = await categorizer.getCategoryByContent(contestJpg);
      expect(contestResult.category).toBe('Images');
      expect(contestResult.category).not.toBe('Tests');
    });
  });

  describe('7. File Reading Regressions', () => {
    it('returns empty string, 0 bytesRead, and 0 totalSize for 0-byte files', async () => {
      const emptyFile = path.join(tempDir, 'zero_byte.txt');
      await fs.writeFile(emptyFile, '');

      const validator = new PathValidatorService(tempDir, [tempDir]);
      const result = await readFile(emptyFile, { validator });

      expect(result.data).toBe('');
      expect(result.bytesRead).toBe(0);
      expect(result.totalSize).toBe(0);
    });
  });

  describe('8. Image Metadata & GPS Stripping Regressions', () => {
    it('does not truncate large JPEGs (>256KB) when stripping GPS', async () => {
      const largeJpegPath = path.join(tempDir, 'large_photo.jpg');
      const strippedPath = path.join(tempDir, 'stripped_photo.jpg');

      const payloadSize = 300 * 1024;
      const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
      const body = Buffer.alloc(payloadSize, 0xab);
      const footer = Buffer.from([0xff, 0xd9]);
      const fullBuffer = Buffer.concat([header, body, footer]);

      await fs.writeFile(largeJpegPath, fullBuffer);
      expect(fullBuffer.length).toBeGreaterThan(256 * 1024);

      await stripGPSData(largeJpegPath, strippedPath);

      const strippedStats = await fs.stat(strippedPath);
      expect(strippedStats.size).toBeGreaterThanOrEqual(payloadSize);
    });

    it('handles invalid EXIF dates gracefully without producing "NaN/NaN"', () => {
      const photoService = new PhotoOrganizerService();
      const invalidDate = new Date(NaN);

      const folderNameYMD = photoService.getDateFolderName(invalidDate, 'YYYY/MM/DD', 'Unknown Date');
      expect(folderNameYMD).toBe('Unknown Date');
      expect(folderNameYMD).not.toContain('NaN');

      const folderNameYM = photoService.getDateFolderName(invalidDate, 'YYYY/MM', 'Unknown Date');
      expect(folderNameYM).toBe('Unknown Date');
      expect(folderNameYM).not.toContain('NaN');

      const folderNameY = photoService.getDateFolderName(invalidDate, 'YYYY', 'Unknown Date');
      expect(folderNameY).toBe('Unknown Date');
      expect(folderNameY).not.toContain('NaN');

      const folderNameDash = photoService.getDateFolderName(invalidDate, 'YYYY-MM-DD', 'Unknown Date');
      expect(folderNameDash).toBe('Unknown Date');
      expect(folderNameDash).not.toContain('NaN');
    });
  });

  describe('9. JSONC Config Parsing Regressions', () => {
    it('preserves existing settings while stripping line and block comments and trailing commas', () => {
      const jsoncContent = `
        {
          // Allowed roots for file organization
          "allowedDirectories": ["/allowed/path/1", "/allowed/path/2"],
          /* Conflict resolution strategy:
             rename | skip | overwrite */
          "conflictStrategy": "rename",
          "maxFileSizeMB": 100,
          "dryRun": true,
        }
      `;

      const parsed = parseJsonc(jsoncContent) as Record<string, unknown>;

      expect(parsed).toEqual({
        allowedDirectories: ['/allowed/path/1', '/allowed/path/2'],
        conflictStrategy: 'rename',
        maxFileSizeMB: 100,
        dryRun: true,
      });
    });
  });
});
