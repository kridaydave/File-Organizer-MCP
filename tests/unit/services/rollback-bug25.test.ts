import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { RollbackService } from '../../../src/core/organize/rollback.js';

describe('Rollback BUG-25', () => {
    let rollbackService: RollbackService;
    let testDir: string;

    beforeEach(async () => {
        // Rollback gates undo on isPathAllowed, which never allows os.tmpdir();
        // keep the fixture inside the project like rollback.test.ts does
        testDir = path.join(process.cwd(), `test-rollback-bug25-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });
        rollbackService = new RollbackService(testDir);
    });

    afterEach(async () => {
        await new Promise(r => setTimeout(r, 100));
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
    });

    it('continues undoing other moves when one move current file is missing', async () => {
        const dirA = path.join(testDir, 'a');
        const dirB = path.join(testDir, 'b');
        const dirC = path.join(testDir, 'c');
        await fs.mkdir(dirA, { recursive: true });
        await fs.mkdir(dirB, { recursive: true });
        await fs.mkdir(dirC, { recursive: true });

        const origA = path.join(dirA, 'a.txt');
        const currA = path.join(dirA, 'a-moved.txt');
        const origB = path.join(dirB, 'b.txt');
        const currB = path.join(dirB, 'b-moved.txt');
        const origC = path.join(dirC, 'c.txt');
        const currC = path.join(dirC, 'c-moved.txt');

        await fs.writeFile(origA, 'a');
        await fs.writeFile(origB, 'b');
        await fs.writeFile(origC, 'c');

        await fs.rename(origA, currA);
        await fs.rename(origB, currB);
        await fs.rename(origC, currC);

        await fs.unlink(currC);

        const manifestId = await rollbackService.createManifest('BUG-25 test', [
            { type: 'move', originalPath: origA, currentPath: currA, timestamp: Date.now() },
            { type: 'move', originalPath: origB, currentPath: currB, timestamp: Date.now() },
            { type: 'move', originalPath: origC, currentPath: currC, timestamp: Date.now() },
        ]);

        const result = await rollbackService.rollback(manifestId);

        expect(await fs.access(origA).then(() => true).catch(() => false)).toBe(true);
        expect(await fs.access(currA).then(() => true).catch(() => false)).toBe(false);
        expect(await fs.access(origB).then(() => true).catch(() => false)).toBe(true);
        expect(await fs.access(currB).then(() => true).catch(() => false)).toBe(false);
        expect(result.failed).toBe(1);
        expect(result.success).toBe(2);
    });
});
