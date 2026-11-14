
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
// Assuming RollbackService exists. If not, I'll find it.
import { RollbackService } from '../../../src/core/organize/rollback.js';
import { CONFIG } from '../../../src/config.js';

describe('Rollback Service', () => {
    let rollbackService: RollbackService;
    let testDir: string;

    beforeEach(async () => {
        testDir = path.join(process.cwd(), `test-rollback-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });
        // RollbackService might need dependencies or path?
        rollbackService = new RollbackService(testDir);
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
        const originalCustomAllowed = CONFIG.paths.customAllowed;
        CONFIG.paths.customAllowed = [externalDir];

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
            CONFIG.paths.customAllowed = originalCustomAllowed;
            await fs.rm(externalDir, { recursive: true, force: true }).catch(() => { });
        }
    });

    it('should restore an undone copy when a later action fails, so the retry can finish', async () => {
        const copySrc = path.join(testDir, 'copy-src.txt');
        const copyDest = path.join(testDir, 'copy-dest.txt');
        await fs.writeFile(copySrc, 'copy-content');
        await fs.copyFile(copySrc, copyDest);

        const moveSrc = path.join(testDir, 'move-src.txt');
        const moveDest = path.join(testDir, 'move-dest.txt');
        await fs.writeFile(moveSrc, 'move-content');
        await fs.rename(moveSrc, moveDest);

        // Undo runs in reverse, so the copy is un-copied first and the move fails
        // afterwards. That order is the whole point: without a backup of the copy,
        // the failure leaves the user with neither the copy nor its original.
        const manifestId = await rollbackService.createManifest('Move then copy test', [
            { type: 'move', originalPath: moveSrc, currentPath: moveDest, timestamp: Date.now() },
            { type: 'copy', originalPath: copySrc, currentPath: copyDest, timestamp: Date.now() },
        ]);

        // A real obstruction, not a missing file: main treats a missing target as
        // a skip, so only a genuine clash makes the move undo fail.
        await fs.writeFile(moveSrc, 'blocker');

        const firstResult = await rollbackService.rollback(manifestId);
        expect(firstResult.failed).toBeGreaterThan(0);

        // The copy the failed batch had already undone must be back on disk.
        expect(
            await fs.readFile(copyDest, 'utf-8').catch(() => null),
        ).toBe('copy-content');
        expect(
            await fs.access(path.join(testDir, `${manifestId}.json`)).then(() => true).catch(() => false),
        ).toBe(true);

        await fs.unlink(moveSrc);
        const secondResult = await rollbackService.rollback(manifestId);

        expect(secondResult.failed).toBe(0);
        expect(
            await fs.access(copyDest).then(() => true).catch(() => false),
        ).toBe(false);
        const leftovers = (await fs.readdir(testDir)).filter((f) => f.includes('.copy-backup-'));
        expect(leftovers).toEqual([]);
    });

    it('should remove the copy and its manifest after a clean undo', async () => {
        const copySrc = path.join(testDir, 'copy2-src.txt');
        const copyDest = path.join(testDir, 'copy2-dest.txt');
        await fs.writeFile(copySrc, 'copy-content-2');
        await fs.copyFile(copySrc, copyDest);

        const manifestId = await rollbackService.createManifest('Copy test', [
            { type: 'copy', originalPath: copySrc, currentPath: copyDest, timestamp: Date.now() },
        ]);

        const result = await rollbackService.rollback(manifestId);

        expect(result.failed).toBe(0);
        expect(result.success).toBe(1);
        expect(
            await fs.access(path.join(testDir, `${manifestId}.json`)).then(() => true).catch(() => false),
        ).toBe(false);
        const leftovers = (await fs.readdir(testDir)).filter((f) => f.includes('.copy-backup-'));
        expect(leftovers).toEqual([]);
    });

    it('should keep the manifest when a later action fails after a copy undo', async () => {
        const copySrc = path.join(testDir, 'copy3-src.txt');
        const copyDest = path.join(testDir, 'copy3-dest.txt');
        await fs.writeFile(copySrc, 'copy-content-3');
        await fs.copyFile(copySrc, copyDest);

        const moveSrc = path.join(testDir, 'move3-src.txt');
        const moveDest = path.join(testDir, 'move3-dest.txt');
        await fs.writeFile(moveSrc, 'move-content-3');
        await fs.rename(moveSrc, moveDest);

        const manifestId = await rollbackService.createManifest('Copy then move test', [
            { type: 'copy', originalPath: copySrc, currentPath: copyDest, timestamp: Date.now() },
            { type: 'move', originalPath: moveSrc, currentPath: moveDest, timestamp: Date.now() },
        ]);

        await fs.writeFile(moveSrc, 'blocker');

        const firstResult = await rollbackService.rollback(manifestId);
        expect(firstResult.failed).toBeGreaterThan(0);
        expect(
            await fs.access(path.join(testDir, `${manifestId}.json`)).then(() => true).catch(() => false),
        ).toBe(true);

        await fs.unlink(moveSrc);
        const secondResult = await rollbackService.rollback(manifestId);
        expect(secondResult.failed).toBe(0);
        expect(Array.isArray(secondResult.errors)).toBe(true);
        expect(secondResult.errors).toEqual([]);
    });

    it('writes manifest atomically leaving no truncated JSON on write failure', async () => {
        const src = path.join(testDir, 'source2.txt');
        const dest = path.join(testDir, 'dest2.txt');
        await fs.writeFile(src, 'content');
        await fs.rename(src, dest);

        const writeFileSpy = jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('ENOSPC'));

        await expect(
            rollbackService.createManifest('Atomic test', [
                {
                    type: 'move',
                    originalPath: src,
                    currentPath: dest,
                    timestamp: Date.now(),
                },
            ]),
        ).rejects.toThrow();

        writeFileSpy.mockRestore();

        const files = await fs.readdir(testDir);
        const manifestFiles = files.filter((f) => f.endsWith('.json'));
        expect(manifestFiles).toHaveLength(0);

        const tempFiles = files.filter((f) => f.includes('.tmp'));
        expect(tempFiles).toHaveLength(0);
    });

    it('should skip a manifest file whose JSON is not a manifest object', async () => {
        const src = path.join(testDir, 'kept.txt');
        const dest = path.join(testDir, 'kept-moved.txt');
        await fs.writeFile(src, 'content');

        const manifestId = await rollbackService.createManifest('valid manifest', [
            { type: 'move', originalPath: src, currentPath: dest, timestamp: Date.now() }
        ]);

        await fs.writeFile(path.join(testDir, 'not-a-manifest.json'), 'null');

        const manifests = await rollbackService.listManifests();

        expect(manifests.map((m) => m.id)).toEqual([manifestId]);
    });

    it('should skip a manifest file whose JSON is an array', async () => {
        const src = path.join(testDir, 'kept.txt');
        const dest = path.join(testDir, 'kept-moved.txt');
        await fs.writeFile(src, 'content');

        const manifestId = await rollbackService.createManifest('valid manifest', [
            { type: 'move', originalPath: src, currentPath: dest, timestamp: Date.now() }
        ]);

        await fs.writeFile(path.join(testDir, 'not-a-manifest.json'), '[{"id":"nope"}]');

        const manifests = await rollbackService.listManifests();

        expect(manifests.length).toBe(1);
        expect(manifests.map((m) => m.id)).toStrictEqual([manifestId]);
    });

    it('should report failure and keep manifest for unknown action types', async () => {
        const src = path.join(testDir, 'source-unknown.txt');
        const dest = path.join(testDir, 'dest-unknown.txt');
        await fs.writeFile(src, 'content');
        await fs.rename(src, dest);

        // The manifest is written first and the bad type is rejected when the
        // undo runs, which is where an unknown action would otherwise be counted
        // as a success without touching anything.
        const manifestId = await rollbackService.createManifest('Test unknown action', [
            {
                type: 'bogus' as never,
                originalPath: src,
                currentPath: dest,
                timestamp: Date.now(),
            },
        ]);

        const result = await rollbackService.rollback(manifestId);

        expect(result.failed).toBeGreaterThan(0);
        expect(result.success).toBe(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(
            await fs.access(path.join(testDir, `${manifestId}.json`)).then(() => true).catch(() => false),
        ).toBe(true);
    });
});
