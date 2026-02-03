
import fs from 'fs/promises';
import path from 'path';
import { StreamingScanner } from '../../../src/services/streaming-scanner.service.js';
import { jest } from '@jest/globals';

describe('StreamingScanner', () => {
    let streamingScanner: StreamingScanner;
    let testDir: string;
    let baseTempDir: string;

    beforeEach(async () => {
        baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'test-stream-'));
        streamingScanner = new StreamingScanner();
    });

    afterEach(async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    const createFile = async (name: string, content: string = 'content') => {
        const filePath = path.join(testDir, name);
        await fs.writeFile(filePath, content);
        return filePath;
    };

    describe('scanLarge', () => {
        it('should yield files in batches', async () => {
            // Create 5 files
            for (let i = 0; i < 5; i++) {
                await createFile(`file${i}.txt`);
            }

            // Set batch size to 2
            const generator = streamingScanner.scanLarge(testDir, { batchSize: 2 });

            const batches = [];
            for await (const batch of generator) {
                batches.push(batch);
            }

            // Should have 3 batches: [2, 2, 1]
            expect(batches.length).toBe(3);
            expect(batches[0].length).toBe(2);
            expect(batches[1].length).toBe(2);
            expect(batches[2].length).toBe(1);

            // Collect all names
            const allFiles = batches.flat().map(f => f.name);
            expect(allFiles.length).toBe(5);
            expect(allFiles.sort()).toEqual(['file0.txt', 'file1.txt', 'file2.txt', 'file3.txt', 'file4.txt']);
        });

        it('should yield nothing for empty directory', async () => {
            const generator = streamingScanner.scanLarge(testDir);
            const batches = [];
            for await (const batch of generator) {
                batches.push(batch);
            }
            expect(batches.length).toBe(0);
        });
    });

    describe('scanWithProgress', () => {
        it('should report progress', async () => {
            await createFile('file1.txt');
            await createFile('file2.txt');

            const onProgress = jest.fn();
            const results = await streamingScanner.scanWithProgress(testDir, onProgress);

            expect(results.length).toBe(2);
            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(onProgress).toHaveBeenCalledWith(1, 2);
            expect(onProgress).toHaveBeenCalledWith(2, 2);
        });
    });
});
