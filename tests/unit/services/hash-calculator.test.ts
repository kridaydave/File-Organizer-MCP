import { jest } from '@jest/globals';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { HashCalculatorService } from '../../../src/services/hash-calculator.service.js';

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

        const duplicates = await hashService.findDuplicates(files);

        expect(duplicates.length).toBe(1);
        expect(duplicates[0].count).toBe(2);
        expect(duplicates[0].files.map(f => f.name)).toContain('file1.txt');
        expect(duplicates[0].files.map(f => f.name)).toContain('file2.txt');
    });
});
