import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PathValidatorService } from '../../../src/services/path-validator.service.js';
import { ValidationError, AccessDeniedError } from '../../../src/types.js';

describe('PathValidatorService', () => {
    let validator: PathValidatorService;
    let testDir: string;

    beforeEach(async () => {
        const tempBase = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(tempBase, { recursive: true });
        testDir = await fs.mkdtemp(path.join(tempBase, 'test-path-validator-'));
        // Initialize with testDir as base and allowed path
        validator = new PathValidatorService(testDir, [testDir]);
    });

    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    describe('path traversal protection', () => {
        it('should reject paths with ../ sequences', async () => {
            // We expect it to throw AccessDeniedError or ValidationError depending on implementation
            // The service checks containment (Layer 6) which throws AccessDeniedError
            // But before that, normalizeAndResolve (Layer 2) resolves it. 
            // If it resolves outside, it fails containment.

            // Note: validatePathBase checks regex for suspicious chars first.
            // But ../ is allowed in regex check.

            const outsidePath = path.resolve(testDir, '../etc/passwd');
            // We pass the relative path with ../ to see if it catches it
            // implementation: checkContainment checks if resolved path is in allowedPaths

            await expect(validator.validatePath(`${testDir}/../etc/passwd`))
                .rejects.toThrow();
        });

        it('should reject symlinks pointing outside allowed roots', async () => {
            const linkPath = path.join(testDir, 'evil-link');
            // specific to OS, but on windows requires admin usually. 
            // In CI might fail if no privs. 
            // We'll try. If it fails to create symlink, we might need to skip.
            try {
                // Pointing to a safe file outside? or just fake.
                // Create a file outside
                const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
                const targetFile = path.join(outsideDir, 'target.txt');
                await fs.writeFile(targetFile, 'secret');

                await fs.symlink(targetFile, linkPath, 'file');

                await expect(validator.validatePath(linkPath))
                    .rejects.toThrow(); // Should throw AccessDeniedError

                await fs.rm(outsideDir, { recursive: true, force: true });
            } catch (err: any) {
                if (err.code === 'EPERM') {
                    console.warn('Skipping symlink test due to permissions');
                } else {
                    throw err;
                }
            }
        });

        it('should allow valid paths within allowed roots', async () => {
            const subdir = path.join(testDir, 'subdir');
            await fs.mkdir(subdir);
            const validPath = path.join(subdir, 'file.txt');
            // We need the file to exist for resolveSymlinks? 
            // resolveSymlinks: if not exists, tries parent. parent exists (subdir).
            // So it should work.

            const result = await validator.validatePath(validPath);
            expect(result).toBe(await fs.realpath(validPath).catch(() => validPath));
        });
    });

    describe('resource limits', () => {
        it('should reject paths exceeding length limit', async () => {
            const longPath = testDir + '/' + 'a'.repeat(5000);
            await expect(validator.validatePath(longPath))
                .rejects.toThrow(/exceeds maximum length/);
        });

        it('should reject paths with suspicious characters', async () => {
            const suspiciousPath = path.join(testDir, 'file<script>.txt');
            await expect(validator.validatePath(suspiciousPath))
                .rejects.toThrow(/contains invalid characters/);
        });
    });
});
