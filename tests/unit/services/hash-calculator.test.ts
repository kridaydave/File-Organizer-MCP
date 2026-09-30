import { jest } from '@jest/globals';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { HashCalculatorService } from '../../../src/core/hash/hasher.js';

describe('HashCalculatorService', () => {
    let hashService: HashCalculatorService;
    let testDir: string;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-hash-'));
        hashService = new HashCalculatorService();
    });

    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should calculate correct SHA-256 hash', async () => {
        const filePath = path.join(testDir, 'test.txt');
        const content = 'Hello World';
        await fs.writeFile(filePath, content);

        const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
        const hash = await hashService.calculateHash(filePath);

        expect(hash).toBe(expectedHash);
    });

    it('should throw error for large files', async () => {
        const smallLimitService = new HashCalculatorService(100); // 100 bytes limit
        const filePath = path.join(testDir, 'large.txt');
        await fs.writeFile(filePath, 'a'.repeat(200));

        await expect(smallLimitService.calculateHash(filePath))
            .rejects.toThrow(/exceeds maximum size/);
    });

    it('should identify duplicate files', async () => {
        const file1 = path.join(testDir, 'file1.txt');
        const file2 = path.join(testDir, 'file2.txt');
        const file3 = path.join(testDir, 'file3.txt');

        await fs.writeFile(file1, 'content');
        await fs.writeFile(file2, 'content'); // duplicate
        await fs.writeFile(file3, 'different');

        const files = [
            { name: 'file1.txt', path: file1, size: 7, modified: new Date() },
            { name: 'file2.txt', path: file2, size: 7, modified: new Date() },
            { name: 'file3.txt', path: file3, size: 9, modified: new Date() }
        ];

        const { groups: duplicates } = await hashService.findDuplicates(files);

        expect(duplicates.length).toBe(1);
        expect(duplicates[0].count).toBe(2);
        expect(duplicates[0].files.map(f => f.name)).toContain('file1.txt');
        expect(duplicates[0].files.map(f => f.name)).toContain('file2.txt');
    });

    describe('skipped-file reporting (issue #22)', () => {
        it('reports oversized files as skipped instead of dropping them silently', async () => {
            // A tiny cap stands in for the real 100MB limit without writing 100MB to disk.
            const tinyCap = new HashCalculatorService(10);
            const filePath = path.join(testDir, 'big.bin');
            await fs.writeFile(filePath, Buffer.alloc(64, 1));

            const scan = await tinyCap.findDuplicates([
                { name: 'big.bin', path: filePath, size: 64 },
            ]);

            expect(scan.groups).toHaveLength(0);
            expect(scan.skipped).toHaveLength(1);
            expect(scan.skipped[0].reason).toBe('exceeds_size_cap');
            expect(scan.skipped[0].path).toBe(filePath);
            expect(scan.skipped[0].size_bytes).toBe(64);
            expect(scan.skipped[0].detail).toMatch(/not compared/i);
            expect(scan.skipped_bytes).toBe(64);
        });

        it('still finds duplicates among small files while reporting the large ones', async () => {
            const tinyCap = new HashCalculatorService(10);
            const a = path.join(testDir, 'a.txt');
            const b = path.join(testDir, 'b.txt');
            const big = path.join(testDir, 'big.bin');
            await fs.writeFile(a, 'same');
            await fs.writeFile(b, 'same');
            await fs.writeFile(big, Buffer.alloc(64, 2));

            const scan = await tinyCap.findDuplicates([
                { name: 'a.txt', path: a, size: 4 },
                { name: 'b.txt', path: b, size: 4 },
                { name: 'big.bin', path: big, size: 64 },
            ]);

            expect(scan.groups).toHaveLength(1);
            expect(scan.groups[0].count).toBe(2);
            expect(scan.skipped.map(s => s.name)).toEqual(['big.bin']);
        });

        it('reports empty files as skipped', async () => {
            const filePath = path.join(testDir, 'empty.txt');
            await fs.writeFile(filePath, '');

            const scan = await hashService.findDuplicates([
                { name: 'empty.txt', path: filePath, size: 0 },
            ]);

            expect(scan.groups).toHaveLength(0);
            expect(scan.skipped).toHaveLength(1);
            expect(scan.skipped[0].reason).toBe('empty_file');
            expect(scan.skipped_bytes).toBe(0);
        });

        it('reports unreadable files as skipped rather than logging only', async () => {
            const scan = await hashService.findDuplicates([
                { name: 'ghost.txt', path: path.join(testDir, 'ghost.txt'), size: 42 },
                { name: 'ghost2.txt', path: path.join(testDir, 'ghost2.txt'), size: 42 },
            ]);

            // Both claim the same size, so both enter the hash loop and fail there.
            expect(scan.groups).toHaveLength(0);
            expect(scan.skipped).toHaveLength(2);
            expect(scan.skipped.every(s => s.reason === 'hash_failed')).toBe(true);
        });

        it('does not report unique-size files as timed_out (issue: timeout sweep)', async () => {
            // A 0ms budget trips the timeout immediately. Unique-size files are
            // excluded on purpose (a unique size cannot be a duplicate), so
            // they must not be reported as starved of budget.
            const solo = path.join(testDir, 'solo.txt');
            const pairA = path.join(testDir, 'pairA.txt');
            const pairB = path.join(testDir, 'pairB.txt');
            await fs.writeFile(solo, 'x'.repeat(50));
            await fs.writeFile(pairA, 'y'.repeat(40));
            await fs.writeFile(pairB, 'y'.repeat(40));

            const scan = await hashService.findDuplicates(
                [
                    { name: 'solo.txt', path: solo, size: 50 },
                    { name: 'pairA.txt', path: pairA, size: 40 },
                    { name: 'pairB.txt', path: pairB, size: 40 },
                ],
                { timeoutMs: 0 },
            );

            const soloSkips = scan.skipped.filter((s) => s.path === solo);
            expect(soloSkips).toEqual([]);

            // Only the pair members that were never hashed are reported, and
            // each exactly once. The singleton is never swept.
            const pairSkips = scan.skipped.filter(
                (s) => s.path === pairA || s.path === pairB,
            );
            expect(pairSkips.length).toBeGreaterThan(0);
            for (const skip of pairSkips) {
                expect(skip.reason).toBe('timed_out');
            }
            expect(scan.skipped.map((s) => s.path)).not.toContain(solo);
        });

        it('never double-counts a file under two skip reasons', async () => {
            // Interleave files that fail to hash instantly (nonexistent) with
            // real files big enough that hashing them burns the remaining
            // budget. That produces a hash_failed entry and then a timeout in
            // the same pass, which is the only way to reach the sweep with an
            // already-decided file in it.
            const group: { name: string; path: string; size: number }[] = [];
            const big = Buffer.alloc(4 * 1024 * 1024, 3);
            for (let i = 0; i < 8; i++) {
                if (i % 2 === 0) {
                    group.push({
                        name: `ghost${i}.bin`,
                        path: path.join(testDir, `ghost${i}.bin`),
                        size: big.length,
                    });
                } else {
                    const p = path.join(testDir, `real${i}.bin`);
                    await fs.writeFile(p, big);
                    group.push({ name: `real${i}.bin`, path: p, size: big.length });
                }
            }

            const scan = await hashService.findDuplicates(group, { timeoutMs: 1 });

            const paths = scan.skipped.map((s) => s.path);
            expect(new Set(paths).size).toBe(paths.length);
            // Whatever the budget allowed, no path may carry two entries.
            for (const p of new Set(paths)) {
                expect(scan.skipped.filter((s) => s.path === p)).toHaveLength(1);
            }
        });

        it('closes the file descriptor it opens on the string-input path', async () => {
            // The sampled path opens its own handle when given a string. If it
            // leaks one per call, a bulk delete exhausts the descriptor limit.
            const service = new HashCalculatorService(8);
            const filePath = path.join(testDir, 'leaky.bin');
            await fs.writeFile(filePath, Buffer.alloc(256, 1));

            const before = (fs as unknown as { open: unknown }).open;
            let opened = 0;
            let closed = 0;
            const realOpen = (fs as unknown as { open: () => Promise<unknown> }).open
                .bind(fs);

            (fs as unknown as { open: () => Promise<unknown> }).open = async (
                ...args: unknown[]
            ) => {
                opened++;
                const handle = (await (realOpen as never as (...a: unknown[]) => Promise<{
                    close: () => Promise<void>;
                }>)(...(args as []))) as { close: () => Promise<void> };
                const realClose = handle.close.bind(handle);
                handle.close = async () => {
                    closed++;
                    return realClose();
                };
                return handle;
            };

            try {
                for (let i = 0; i < 5; i++) {
                    await service.calculateContentIdentity(filePath);
                }
            } finally {
                (fs as unknown as { open: unknown }).open = before;
            }

            expect(opened).toBe(5);
            expect(closed).toBe(5);
        });

        it('honours timeoutMs on the sampled path instead of ignoring it', async () => {
            // The sampled reads take no AbortSignal, so the budget has to be
            // enforced by racing. A read that never settles must be abandoned
            // once the budget is gone, not awaited forever.
            const service = new HashCalculatorService(8);
            const filePath = path.join(testDir, 'slow.bin');
            await fs.writeFile(filePath, Buffer.alloc(4096, 2));

            const realOpen = fs.open.bind(fs);
            jest.spyOn(fs, 'open').mockImplementation((async (
                ...args: never[]
            ) => {
                const handle = (await (realOpen as never as (
                    ...a: never[]
                ) => Promise<{ read: () => Promise<unknown> }>)(...args)) as {
                    read: () => Promise<unknown>;
                };
                handle.read = () => new Promise<never>(() => undefined);
                return handle;
            }) as never);

            try {
                await expect(
                    service.calculateContentIdentity(filePath, { timeoutMs: 25 }),
                ).rejects.toThrow(/timed out after 25ms/);
            } finally {
                jest.restoreAllMocks();
            }
        });

        it('returns an empty skipped list for a clean scan', async () => {
            const filePath = path.join(testDir, 'solo.txt');
            await fs.writeFile(filePath, 'unique content here');

            const scan = await hashService.findDuplicates([
                { name: 'solo.txt', path: filePath, size: 19 },
            ]);

            expect(scan.skipped).toEqual([]);
            expect(scan.skipped_bytes).toBe(0);
        });
    });
});
