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
