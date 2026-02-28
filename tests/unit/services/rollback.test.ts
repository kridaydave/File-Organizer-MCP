
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
// Assuming RollbackService exists. If not, I'll find it.
// The task says "tests/unit/services/rollback.test.ts".
import { RollbackService } from '../../../src/services/rollback.service.js';

describe('Rollback Service', () => {
    let rollbackService: RollbackService;
    let testDir: string;

    beforeEach(async () => {
        testDir = path.join(process.cwd(), `test-rollback-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });
        // RollbackService might need dependencies or path?
        rollbackService = new RollbackService();
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
    });

    it('should track and undo file moves', async () => {
        const src = path.join(testDir, 'source.txt');
        const dest = path.join(testDir, 'dest.txt');
        await fs.writeFile(src, 'content');

        // Simulate move operation tracking via Manifest
        // const dest = path.join(testDir, 'dest.txt'); // Already declared
        await fs.writeFile(src, 'content');

        // Perform the move manually
        await fs.rename(src, dest);

        // Created manifest manually
        const manifestId = await rollbackService.createManifest('Test Scrollback', [
            {
                type: 'move',
                originalPath: src,
                currentPath: dest,
                timestamp: Date.now()
            }
        ]);

        // Verify state before undo
        expect(await fs.access(src).then(() => true).catch(() => false)).toBe(false);
        expect(await fs.access(dest).then(() => true).catch(() => false)).toBe(true);

        // Undo
        await rollbackService.rollback(manifestId);

        // Verify state after undo
        expect(await fs.access(src).then(() => true).catch(() => false)).toBe(true);
        expect(await fs.access(dest).then(() => true).catch(() => false)).toBe(false);
    });

    it('should undo a move where originalPath is outside CWD (e.g. Downloads)', async () => {
        // Use OS temp dir as a stand-in for an external directory like Downloads
        const externalDir = path.join(os.tmpdir(), `test-undo-external-${Date.now()}`);
        await fs.mkdir(externalDir, { recursive: true });

        try {
            const src = path.join(externalDir, 'zen.installer.exe');
            const dest = path.join(externalDir, 'Executables', 'zen.installer.exe');
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.writeFile(src, 'fake-exe-content');
            await fs.rename(src, dest);

            const manifestId = await rollbackService.createManifest('Downloads undo test', [
                { type: 'move', originalPath: src, currentPath: dest, timestamp: Date.now() }
            ]);

            // Verify file is at dest before undo
            expect(await fs.access(dest).then(() => true).catch(() => false)).toBe(true);
            expect(await fs.access(src).then(() => true).catch(() => false)).toBe(false);

            const result = await rollbackService.rollback(manifestId);

            // Undo should succeed
            expect(result.failed).toBe(0);
            expect(result.success).toBe(1);

            // File should be back at original location
            expect(await fs.access(src).then(() => true).catch(() => false)).toBe(true);
            expect(await fs.access(dest).then(() => true).catch(() => false)).toBe(false);
        } finally {
            await fs.rm(externalDir, { recursive: true, force: true }).catch(() => { });
        }
    });
});
