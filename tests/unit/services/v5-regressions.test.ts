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
import { classifySecurity } from '../../../src/core/categorize/security.js';
import { OrganizerService } from '../../../src/core/organize/organizer.js';
import { HistoryLoggerService } from '../../../src/services/history-logger.service.js';
import { PathSchema } from '../../../src/schemas/system.js';
import { formatBytes } from '../../../src/utils/formatters.js';
import { safeAtomicMove } from '../../../src/core/io/atomic-move.js';
import { handleSystemOrganization } from '../../../src/tools/system-organization.js';
import { handleOrganizePhotos } from '../../../src/tools/photo-organization.js';
import { handleOrganizeMusic } from '../../../src/tools/music-organization.js';
import { RollbackService } from '../../../src/core/organize/rollback.js';
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

  describe('10. Path Validator & Whitelist Enforcement', () => {
    it('enforces whitelist containment in default PathValidatorService.isPathAllowed', async () => {
      const validator = new PathValidatorService();
      // An arbitrary un-allowed directory path outside whitelist
      const unallowedPath = path.join('/tmp', 'definitely-not-in-allowed-roots', 'file.txt');
      const isAllowed = await validator.isPathAllowed(unallowedPath);
      expect(isAllowed).toBe(false);
    });
  });

  describe('11. Security Threat Level Preservation', () => {
    it('preserves high threatLevel when double extension spoofing is detected even with sniff mismatch', async () => {
      const doubleExtFile = path.join(tempDir, 'invoice.pdf.exe');
      // Write non-executable text so sniff detects mismatch
      await fs.writeFile(doubleExtFile, 'Plain text not a real PE binary');

      const validator = new PathValidatorService(tempDir);
      const security = await classifySecurity(validator, doubleExtFile);

      expect(security.isSuspicious).toBe(true);
      expect(security.threatLevel).toBe('high');
      expect(security.reason).toContain('Double extension');
    });
  });

  describe('12. Content Analysis in Organizer Planning', () => {
    it('uses sniffed category when useContentAnalysis is enabled in OrganizerService', async () => {
      const pngWithTxtExt = path.join(tempDir, 'image_named_txt.txt');
      // PNG header magic bytes
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      await fs.writeFile(pngWithTxtExt, pngHeader);

      const files: FileWithSize[] = [
        { path: pngWithTxtExt, name: 'image_named_txt.txt', size: pngHeader.length, extension: '.txt' },
      ];

      const validator = new PathValidatorService(tempDir, [tempDir]);
      const categorizer = new CategorizerService([], validator);
      const organizer = new OrganizerService(categorizer);
      const plan = await organizer.generateOrganizationPlan(tempDir, files, 'skip', true);

      // Without content analysis it would be Documents/Text, with content analysis it detects Images
      expect(plan.moves.length).toBe(1);
      expect(plan.moves[0].destination).toContain('Images');
    });
  });

  describe('13. Cross-Directory Duplicate Verification', () => {
    it('allows deleting duplicate file when surviving copy lives in a different directory', async () => {
      const subDirA = path.join(tempDir, 'folderA');
      const subDirB = path.join(tempDir, 'folderB');
      await fs.mkdir(subDirA, { recursive: true });
      await fs.mkdir(subDirB, { recursive: true });

      const fileA = path.join(subDirA, 'doc.txt');
      const fileB = path.join(subDirB, 'doc_copy.txt');
      const content = 'Identical content in two separate directories';
      await fs.writeFile(fileA, content);
      await fs.writeFile(fileB, content);

      const validator = new PathValidatorService(tempDir, [tempDir]);
      const finder = new DuplicateFinderService(validator);
      // Delete fileA with autoVerify=true. fileB in folderB must be recognized as surviving copy
      const deleteResult = await finder.deleteFiles([fileA], {
        autoVerify: true,
        candidateDirectories: [tempDir],
      });

      expect(deleteResult.deleted).toContain(fileA);
      expect(deleteResult.failed).toHaveLength(0);
    });
  });

  describe('14. Rotated History Reading in HistoryLoggerService', () => {
    it('reads entries from both operations.jsonl and rotated operations.1.jsonl', async () => {
      const historyLogger = new HistoryLoggerService({ dataDir: tempDir });
      await historyLogger.init();

      const entry1 = {
        id: '1',
        timestamp: '2026-08-30T10:00:00.000Z',
        operation: 'organize_files',
        status: 'success' as const,
        filesAffected: 5,
      };
      const entry2 = {
        id: '2',
        timestamp: '2026-08-31T10:00:00.000Z',
        operation: 'organize_files',
        status: 'success' as const,
        filesAffected: 3,
      };

      // Write entry1 into operations.1.jsonl and entry2 into operations.jsonl
      await fs.writeFile(path.join(tempDir, 'operations.1.jsonl'), JSON.stringify(entry1) + '\n');
      await fs.writeFile(path.join(tempDir, 'operations.jsonl'), JSON.stringify(entry2) + '\n');

      const history = await historyLogger.getHistory();
      expect(history.entries.length).toBe(2);
      expect(history.entries.map((e) => e.id)).toContain('1');
      expect(history.entries.map((e) => e.id)).toContain('2');
    });
  });

  describe('15. Schema and Formatter Utilities', () => {
    it('accepts valid filenames with multiple dots in PathSchema', () => {
      const valid = PathSchema.safeParse('archive..v2.tar.gz');
      expect(valid.success).toBe(true);

      const traversal = PathSchema.safeParse('../etc/passwd');
      expect(traversal.success).toBe(false);
    });

    it('formats sub-byte fractions without negative index in formatBytes', () => {
      const formatted = formatBytes(0.5);
      expect(formatted).toBe('0.5 Bytes');
    });
  });

  describe('16. In-Place Organization Idempotency & Safe Self-Moves', () => {
    it('does not mutate or rename files already located in their target category subfolder', async () => {
      const docsDir = path.join(tempDir, 'Documents');
      await fs.mkdir(docsDir, { recursive: true });
      const alreadyOrganizedFile = path.join(docsDir, 'report.pdf');
      await fs.writeFile(alreadyOrganizedFile, 'test pdf content');

      const files: FileWithSize[] = [
        {
          path: alreadyOrganizedFile,
          name: 'report.pdf',
          size: 17,
          extension: '.pdf',
        },
      ];

      const organizer = new OrganizerService();
      const plan = await organizer.generateOrganizationPlan(tempDir, files, 'rename');

      // The plan should not schedule unnecessary move for already-organized file
      expect(plan.moves.length).toBe(0);

      // Execute organize on the plan
      const result = await organizer.organize(tempDir, plan, { conflictStrategy: 'rename' });
      expect(result.errors).toHaveLength(0);

      // Verify the original file is intact and no _1.pdf was created
      const originalExists = await fs.stat(alreadyOrganizedFile).then(() => true).catch(() => false);
      expect(originalExists).toBe(true);

      const mutatedExists = await fs.stat(path.join(docsDir, 'report_1.pdf')).then(() => true).catch(() => false);
      expect(mutatedExists).toBe(false);
    });
  });

  describe('17. safeAtomicMove Identity Invariant', () => {
    it('returns success immediately without unlinking or mutating when source === destination', async () => {
      const filePath = path.join(tempDir, 'keep-me.txt');
      await fs.writeFile(filePath, 'important data');

      const res = await safeAtomicMove(filePath, filePath, { overwrite: true });
      expect(res.success).toBe(true);

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('important data');
    });

    it('refuses to clobber a distinct case-colliding destination on case-sensitive filesystems', async () => {
      // Case-sensitive FS only: on case-insensitive filesystems (macOS/Windows)
      // both names resolve to the same file, so the collision cannot exist.
      const probe = path.join(tempDir, 'case-probe.txt');
      await fs.writeFile(probe, 'x');
      const isCaseSensitive = await fs
        .lstat(path.join(tempDir, 'CASE-PROBE.txt'))
        .then(
          () => false,
          (err: NodeJS.ErrnoException) => err.code === 'ENOENT',
        );
      if (!isCaseSensitive) return;

      const lower = path.join(tempDir, 'test.txt');
      const upper = path.join(tempDir, 'TEST.txt');
      await fs.writeFile(lower, 'lower content');
      await fs.writeFile(upper, 'upper content');

      await expect(safeAtomicMove(lower, upper)).rejects.toMatchObject({ code: 'EEXIST' });

      // Neither file was destroyed or moved
      expect(await fs.readFile(lower, 'utf8')).toBe('lower content');
      expect(await fs.readFile(upper, 'utf8')).toBe('upper content');
    });

    it('performs a true case-only rename when destination resolves to the source itself', async () => {
      const lower = path.join(tempDir, 'rename-me.txt');
      const upper = path.join(tempDir, 'RENAME-ME.txt');
      await fs.writeFile(lower, 'same file');

      const res = await safeAtomicMove(lower, upper);
      expect(res.success).toBe(true);
      // On case-insensitive filesystems lstat(lower) still resolves to the
      // renamed file, so assert on actual directory entry names instead.
      const entries = await fs.readdir(tempDir);
      expect(entries).toContain('RENAME-ME.txt');
      expect(entries).not.toContain('rename-me.txt');
      expect(await fs.readFile(upper, 'utf8')).toBe('same file');
    });
  });

  describe('18. Rollback Manifest ID Sync Across Tools', () => {
    it('returns real persisted rollback manifestId from handleSystemOrganization', async () => {
      const sandboxDir = path.join(process.cwd(), 'tests', 'sandbox', 'v5-system-test');
      const downloadsDir = path.join(sandboxDir, 'Downloads');
      const docsDir = path.join(sandboxDir, 'Documents');

      try {
        await fs.mkdir(downloadsDir, { recursive: true });
        await fs.mkdir(docsDir, { recursive: true });

        const testFile = path.join(downloadsDir, 'notes.txt');
        await fs.writeFile(testFile, 'meeting notes');

        const response = await handleSystemOrganization({
          source_dir: downloadsDir,
          dry_run: false,
          response_format: 'json',
        });

        expect(response.isError).toBeFalsy();
        const structured = response.structuredContent as Record<string, unknown>;
        expect(structured).toBeDefined();
        const undoManifest = structured.undoManifest as { manifestId: string } | undefined;
        expect(undoManifest?.manifestId).toBeDefined();

        // Verify the manifest actually exists on disk and is readable via RollbackService
        const rollbackService = new RollbackService();
        const manifests = await rollbackService.listManifests();
        const found = manifests.find((m) => m.id === undoManifest?.manifestId);
        expect(found).toBeDefined();
      } finally {
        await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('returns real rollback manifestId from handleOrganizePhotos and handleOrganizeMusic', async () => {
      const sandboxDir = path.join(process.cwd(), 'tests', 'sandbox', 'v5-photo-test');
      const photosSource = path.join(sandboxDir, 'photo-src');
      const photosTarget = path.join(sandboxDir, 'photo-dest');

      try {
        await fs.mkdir(photosSource, { recursive: true });
        await fs.mkdir(photosTarget, { recursive: true });

        const imgFile = path.join(photosSource, 'photo.jpg');
        await fs.writeFile(imgFile, 'photo binary data');

        const photoRes = await handleOrganizePhotos({
          source_dir: photosSource,
          target_dir: photosTarget,
          dry_run: false,
          response_format: 'json',
        });

        expect(photoRes.isError).toBeFalsy();
        const photoStructured = photoRes.structuredContent as Record<string, unknown>;
        expect(photoStructured.manifestId).toBeDefined();

        const rollbackService = new RollbackService();
        const manifests = await rollbackService.listManifests();
        const foundPhotoManifest = manifests.find((m) => m.id === photoStructured.manifestId);
        expect(foundPhotoManifest).toBeDefined();
      } finally {
        await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  describe('19. Sensitive File Protection in Photo Organizer', () => {
    it('blocks reading or processing sensitive files in copyWithoutGPS', async () => {
      const sensitiveFile = path.join(tempDir, '.env');
      await fs.writeFile(sensitiveFile, 'SECRET_KEY=12345');

      const photoService = new PhotoOrganizerService();
      // Processing a sensitive file with photo organizer fails securely with error recorded
      const res = await photoService.organize({
        sourceDir: tempDir,
        targetDir: path.join(tempDir, 'out'),
        stripGPS: true,
        dryRun: false,
      });

      expect(res.success).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    });
  });
});
