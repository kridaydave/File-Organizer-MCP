
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
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
});
