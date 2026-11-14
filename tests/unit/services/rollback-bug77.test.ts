import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { RollbackService } from '../../../src/core/organize/rollback.js';
import { CONFIG } from '../../../src/config.js';

describe('Rollback Service BUG-77', () => {
    let rollbackService: RollbackService;
    let testDir: string;
    let originalCustomAllowed: string[];

    beforeEach(async () => {
        testDir = path.join(fsSync.realpathSync(os.tmpdir()), `test-rollback-bug77-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await fs.mkdir(testDir, { recursive: true });
        originalCustomAllowed = CONFIG.paths.customAllowed;
        CONFIG.paths.customAllowed = [testDir];
        rollbackService = new RollbackService(testDir);
    });

    afterEach(async () => {
        CONFIG.paths.customAllowed = originalCustomAllowed;
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
    });

    it('should decrement success count on recovery when partial rollback reverts completed actions', async () => {
        const dirA = path.join(testDir, 'a');
        const dirB = path.join(testDir, 'b');
        await fs.mkdir(dirA, { recursive: true });
        await fs.mkdir(dirB, { recursive: true });

        const origA = path.join(dirA, 'fileA.txt');
        const origB = path.join(dirB, 'fileB.txt');
        const movedA = path.join(dirA, 'movedA.txt');
        const movedB = path.join(dirB, 'movedB.txt');

        await fs.writeFile(origA, 'contentA');
        await fs.writeFile(origB, 'contentB');

        await fs.rename(origA, movedA);
        await fs.rename(origB, movedB);

        const manifestId = await rollbackService.createManifest('BUG-77 test', [
            { type: 'move', originalPath: origA, currentPath: movedA, timestamp: Date.now() },
            { type: 'move', originalPath: origB, currentPath: movedB, timestamp: Date.now() }
        ]);

        await fs.unlink(movedA);

        const result = await rollbackService.rollback(manifestId);

        // A failed (its moved file was deleted); no fake file is created for it.
        expect(await fs.access(origA).then(() => true).catch(() => false)).toBe(false);
        // B rolled back, then recovery reverted it back to the moved location.
        expect(await fs.access(origB).then(() => true).catch(() => false)).toBe(false);
        expect(await fs.access(movedB).then(() => true).catch(() => false)).toBe(true);
        expect(await fs.access(movedA).then(() => true).catch(() => false)).toBe(false);

        expect(result.success).toBe(0);
        expect(result.failed).toBeGreaterThan(0);
    });
});
