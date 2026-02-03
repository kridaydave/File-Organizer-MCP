
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import os from 'os';
import { PathValidatorService } from '../../src/services/path-validator.service.js';
import { normalizePath } from '../../src/utils/file-utils.js';

// Helper to create test files
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'security_test');

describe('Security Hardening Suite', () => {
    let validator: PathValidatorService;

    beforeEach(async () => {
        await fs.mkdir(TEST_DIR, { recursive: true });
        validator = new PathValidatorService(TEST_DIR, [TEST_DIR]);
    });

    afterEach(async () => {
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch (e) {
            // ignore
        }
    });

    describe('1. Path Normalization & Traversal', () => {
        it('should decode URI components', () => {
            const malformed = 'folder/%2e%2e/secret.txt';
            const normalized = normalizePath(malformed);
            // On Windows: folder\..\secret.txt -> secret.txt (if normalized)
            // path.normalize resolves '..'
            expect(normalized).not.toContain('%2e%2e');
            expect(path.normalize(normalized)).toContain('secret.txt');
        });

        it('should strip null bytes', () => {
            const malicious = 'image.png\0.exe';
            const normalized = normalizePath(malicious);
            expect(normalized).toBe('image.png.exe');
            expect(normalized).not.toContain('\0');
        });

        it('should handle mixed separators', () => {
            const mixed = 'folder/subfolder\\file.txt';
            const normalized = normalizePath(mixed);
            if (process.platform === 'win32') {
                expect(normalized).toContain('\\');
                expect(normalized).not.toContain('/');
            } else {
                expect(normalized).toContain('/');
            }
        });

        it('should normalize multiple slashes', () => {
            const multi = 'folder//subfolder////file.txt';
            const normalized = normalizePath(multi);
            expect(normalized).not.toContain('//');
        });
    });

    describe('2. PathValidatorService (TOCTOU & Traversal)', () => {
        it('should prevent access to parent directory via traversal', async () => {
            const outsideFile = path.join(path.dirname(TEST_DIR), 'secret.txt');
            await fs.writeFile(outsideFile, 'secret data');

            try {
                // Try to access ../secret.txt
                const attackPath = path.join(TEST_DIR, '..', 'secret.txt');
                await expect(validator.validatePath(attackPath)).rejects.toThrow();
            } finally {
                await fs.unlink(outsideFile).catch(() => { });
            }
        });

        it('should prevent access using encoded traversal', async () => {
            const attackPath = path.join(TEST_DIR, '%2e%2e', 'secret.txt');
            // On Windows path.join might not interpret %2e%2e
            // user input is string
            const input = path.join(TEST_DIR, 'foo', '%2e%2e', '%2e%2e', 'secret.txt');
            // normalizePath should decode %2e%2e -> ..
            await expect(validator.validatePath(input)).rejects.toThrow();
        });

        it('should openAndValidateFile returning a valid FileHandle', async () => {
            const testFile = path.join(TEST_DIR, 'valid.txt');
            await fs.writeFile(testFile, 'content');

            const handle = await validator.openAndValidateFile(testFile);
            expect(handle).toBeDefined();

            // Prove we can read from it
            const content = await handle.readFile({ encoding: 'utf8' });
            expect(content).toBe('content');

            await handle.close();
        });

        it('should fail openAndValidateFile for non-existent file', async () => {
            const testFile = path.join(TEST_DIR, 'missing.txt');
            await expect(validator.openAndValidateFile(testFile)).rejects.toThrow();
        });

        it('should fail openAndValidateFile for directory', async () => {
            const testDir = path.join(TEST_DIR, 'subdir');
            await fs.mkdir(testDir);
            await expect(validator.openAndValidateFile(testDir)).rejects.toThrow(/not a file/);
        });
    });

    describe('3. Symlink Attacks (O_NOFOLLOW)', () => {
        it('should reject opening a symlink directly via openAndValidateFile', async () => {
            const target = path.join(TEST_DIR, 'target.txt');
            await fs.writeFile(target, 'target data');

            const link = path.join(TEST_DIR, 'link.txt');
            try {
                await fs.symlink(target, link, 'file');
            } catch (e) {
                // Symlinks might require admin on Windows. Skip if EPERM.
                if ((e as any).code === 'EPERM') {
                    console.log('Skipping symlink test due to lack of permissions');
                    return;
                }
                throw e;
            }

            // Implementation uses O_NOFOLLOW
            await expect(validator.openAndValidateFile(link)).rejects.toThrow(/Symlink/);
        });
    });
});
