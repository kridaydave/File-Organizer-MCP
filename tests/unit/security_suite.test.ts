
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import os from 'os';
import { PathValidatorService } from '../../src/services/path-validator.service.js';
import { normalizePath } from '../../src/utils/file-utils.js';
import { CONFIG } from '../../src/config.js';

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

        it('should reject sibling directories that share the same base path prefix', async () => {
            const baseDir = path.join(TEST_DIR, 'prefix-base');
            const siblingDir = `${baseDir}-outside`;
            const siblingFile = path.join(siblingDir, 'secret.txt');
            // Explicit allowedPaths tests prefix-boundary containment directly;
            // in whitelist mode (allowedPaths = null) containment is delegated
            // to the configured whitelist instead.
            const prefixValidator = new PathValidatorService(baseDir, [baseDir]);

            await fs.mkdir(baseDir, { recursive: true });
            await fs.mkdir(siblingDir, { recursive: true });
            await fs.writeFile(siblingFile, 'secret data');

            try {
                await expect(prefixValidator.openAndValidateFile(siblingFile)).rejects.toThrow(
                    /outside allowed directory/,
                );
            } finally {
                await fs.rm(siblingDir, { recursive: true, force: true });
            }
        });
    });

    describe('3. Symlink Attacks (O_NOFOLLOW)', () => {
        it('should reject opening a symlink directly via openAndValidateFile', async () => {
            if (process.platform === 'win32') {
                // UV_FS_O_NOFOLLOW is not supported on Windows (libuv ignores
                // the flag), so a symlink open resolves instead of failing.
                // Symlink escapes are still blocked there by the post-open
                // realpath containment check.
                console.log('Skipping O_NOFOLLOW symlink test on Windows');
                return;
            }

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

    describe('openAndValidateFile in whitelist mode (allowedPaths = null)', () => {
        let base: string;
        let serverCwd: string;
        let whitelistDir: string;
        let blockedDir: string;
        const originalCustomAllowed = CONFIG.paths.customAllowed;

        beforeEach(async () => {
            // Use os.tmpdir() so the directories sit outside process.cwd().
            // Test mode auto-adds process.cwd() to the whitelist, which would
            // otherwise make every path under it allowed.
            base = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-wl-'));
            serverCwd = path.join(base, 'server-cwd');
            whitelistDir = path.join(base, 'whitelist');
            blockedDir = path.join(base, 'blocked');
            await fs.mkdir(serverCwd, { recursive: true });
            await fs.mkdir(whitelistDir, { recursive: true });
            await fs.mkdir(blockedDir, { recursive: true });

            // Grant whitelist access to whitelistDir only.
            CONFIG.paths.customAllowed = [...originalCustomAllowed, whitelistDir];
        });

        afterEach(async () => {
            CONFIG.paths.customAllowed = originalCustomAllowed;
            if (process.platform === 'win32') {
                await new Promise((r) => setTimeout(r, 100));
            }
            await fs.rm(base, { recursive: true, force: true });
        });

        it('should allow a file inside a whitelist dir outside the working directory', async () => {
            const file = path.join(whitelistDir, 'doc.txt');
            await fs.writeFile(file, 'content');

            const whitelistValidator = new PathValidatorService(serverCwd);

            const handle = await whitelistValidator.openAndValidateFile(file);
            const content = await handle.readFile({ encoding: 'utf8' });
            expect(content).toBe('content');
            await handle.close();
        });

        it('should reject a file outside the whitelist', async () => {
            const file = path.join(blockedDir, 'secret.txt');
            await fs.writeFile(file, 'secret');

            const whitelistValidator = new PathValidatorService(serverCwd);

            await expect(whitelistValidator.openAndValidateFile(file)).rejects.toThrow(
                /outside allowed directory/,
            );
        });

        it('should allow a file reached through a symlinked whitelist prefix', async () => {
            // Simulates platforms where a whitelisted dir sits behind a symlinked
            // prefix (e.g. /var -> /private/var on macOS). Canonicalization must
            // not cause a false "outside allowed directory" denial.
            const realDir = await fs.mkdtemp(
                path.join(os.tmpdir(), 'mcp-wl-real-'),
            );
            const linkBase = path.join(
                os.tmpdir(),
                `mcp-wl-link-${Date.now()}`,
            );
            const symlinkDir = path.join(linkBase, 'whitelist');
            try {
                await fs.mkdir(linkBase, { recursive: true });
                try {
                    await fs.symlink(realDir, symlinkDir, 'dir');
                } catch (e) {
                    // Symlinks might require admin on Windows. Skip if EPERM.
                    if ((e as any).code === 'EPERM') {
                        console.log(
                            'Skipping symlink test due to lack of permissions',
                        );
                        return;
                    }
                    throw e;
                }

                await fs.writeFile(
                    path.join(realDir, 'doc.txt'),
                    'content',
                );

                CONFIG.paths.customAllowed = [...originalCustomAllowed, symlinkDir];
                const whitelistValidator = new PathValidatorService(serverCwd);

                const file = path.join(symlinkDir, 'doc.txt');
                const handle = await whitelistValidator.openAndValidateFile(file);
                const content = await handle.readFile({ encoding: 'utf8' });
                expect(content).toBe('content');
                await handle.close();
            } finally {
                CONFIG.paths.customAllowed = originalCustomAllowed;
                if (process.platform === 'win32') {
                    await new Promise((r) => setTimeout(r, 100));
                }
                await fs.rm(realDir, { recursive: true, force: true });
                await fs.rm(linkBase, { recursive: true, force: true });
            }
        });
    });
});
