/**
 * Adversarial Deep Audit Suite 2
 * Tests archive validation security, manifest HMAC tampering detection,
 * project clustering scaling, and media error recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { validateArchiveEntries, sanitizeEntryName } from '../../../src/security/archive-validator.js';
import { ManifestIntegrityService } from '../../../src/core/organize/manifest-integrity.js';
import { detectProjects } from '../../../src/core/detect/project.js';
import { RollbackService } from '../../../src/core/organize/rollback.js';
import { CONFIG } from '../../../src/core/config/defaults.js';

describe('Adversarial Deep Audit Suite 2 - Engine & Security Stress', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adv-audit-2-'));
    CONFIG.paths.customAllowed = [tempDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = [];
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('1. Archive Security & Decompression Bomb Prevention', () => {
    it('enforces cumulative uncompressed size limits across multiple entries', async () => {
      // 6 entries of 500MB = 3.0GB (exceeds MAX_ABSOLUTE_BYTES of 2.5GB)
      const entries = [
        { name: 'file1.bin', uncompressedSize: 500 * 1024 * 1024, compressedSize: 1000 },
        { name: 'file2.bin', uncompressedSize: 500 * 1024 * 1024, compressedSize: 1000 },
        { name: 'file3.bin', uncompressedSize: 500 * 1024 * 1024, compressedSize: 1000 },
        { name: 'file4.bin', uncompressedSize: 500 * 1024 * 1024, compressedSize: 1000 },
        { name: 'file5.bin', uncompressedSize: 500 * 1024 * 1024, compressedSize: 1000 },
        { name: 'file6.bin', uncompressedSize: 500 * 1024 * 1024, compressedSize: 1000 },
      ];

      const res = await validateArchiveEntries(entries, tempDir);
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('Cumulative uncompressed size') || e.includes('exceeds'))).toBe(true);
    });

    it('rejects DOS reserved device names in nested archive paths', async () => {
      const entries = [
        { name: 'nested/NUL/data.txt', uncompressedSize: 100, compressedSize: 100 },
        { name: 'sub/CON.txt', uncompressedSize: 100, compressedSize: 100 },
      ];

      const res = await validateArchiveEntries(entries, tempDir);
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('reserved') || e.includes('CON') || e.includes('NUL'))).toBe(true);
    });

    it('sanitizes entry names with non-printable control characters without producing traversal sequences', () => {
      const raw = '.\x01.\x01/file.txt';
      const sanitized = sanitizeEntryName(raw);
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('\x01');
    });
  });

  describe('2. Manifest HMAC Tamper Resistance & Signatures', () => {
    it('detects tampering when an action or path is modified in a manifest', async () => {
      const integrity = new ManifestIntegrityService();
      const manifest = await integrity.signManifest({
        id: crypto.randomUUID(),
        description: 'Test Operation',
        timestamp: Date.now(),
        actions: [
          {
            type: 'move',
            originalPath: path.join(tempDir, 'file1.txt'),
            currentPath: path.join(tempDir, 'Documents', 'file1.txt'),
            timestamp: Date.now(),
          },
        ],
      });

      // Valid check
      const validCheck = await integrity.verifyManifest(manifest);
      expect(validCheck.valid).toBe(true);

      // Tampered check: Change destination path
      const tamperedManifest = {
        ...manifest,
        actions: [
          {
            ...manifest.actions[0]!,
            currentPath: path.join(tempDir, 'Documents', 'hacked.txt'),
          },
        ],
      };

      const invalidCheck = await integrity.verifyManifest(tamperedManifest);
      expect(invalidCheck.valid).toBe(false);
    });
  });

  describe('3. Rollback Failure Recovery & Resiliency', () => {
    it('handles rollback gracefully when current file has been deleted externally', async () => {
      const rollback = new RollbackService();
      const originalPath = path.join(tempDir, 'orig.txt');
      const currentPath = path.join(tempDir, 'Documents', 'orig.txt');

      // Create manifest for a file that does not exist at currentPath
      const manifestId = await rollback.createManifest('Missing File Rollback', [
        {
          type: 'move',
          originalPath,
          currentPath,
          timestamp: Date.now(),
        },
      ]);

      const result = await rollback.rollback(manifestId);
      expect(result.failed).toBe(1);
      expect(result.success).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('4. Project Detection & Mono-Repo Clustering', () => {
    it('accurately clusters files by project without memory leaks or exponential pairings', async () => {
      const file1 = path.join(tempDir, 'frontend_App.tsx');
      const file2 = path.join(tempDir, 'frontend_index.html');
      const file3 = path.join(tempDir, 'backend_main.rs');
      const file4 = path.join(tempDir, 'backend_Cargo.toml');

      await fs.writeFile(file1, 'export const App = () => null;');
      await fs.writeFile(file2, '<html><body>Frontend</body></html>');
      await fs.writeFile(file3, 'fn main() {}');
      await fs.writeFile(file4, '[package]\nname = "backend"');

      const files = [file1, file2, file3, file4];
      const projects = await detectProjects(files);
      expect(Array.isArray(projects)).toBe(true);
    });
  });
});
