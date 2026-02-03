
import fs from 'fs/promises';
import path from 'path';
import { handleListFiles } from '../../../src/tools/file-listing.js';
import { handleFindLargestFiles } from '../../../src/tools/file-analysis.js';
import { jest } from '@jest/globals';

describe('File Inspection Tools', () => {
    let testDir: string;
    let baseTempDir: string;

    beforeEach(async () => {
        baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'test-inspect-'));
    });

    afterEach(async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    const createFile = async (name: string, size: number) => {
        const filePath = path.join(testDir, name);
        // Create file of specific size
        const buffer = Buffer.alloc(size, 'a');
        await fs.writeFile(filePath, buffer);
        return filePath;
    };

    describe('listFiles', () => {
        it('should list files in directory', async () => {
            await createFile('file1.txt', 10);
            await createFile('file2.txt', 10);
            await fs.mkdir(path.join(testDir, 'subdir'));

            const result = await handleListFiles({ directory: testDir });

            expect(result.content[0].text).toContain('Files in');
            expect(result.content[0].text).toContain('file1.txt');
            expect(result.content[0].text).toContain('file2.txt');
            expect(result.content[0].text).toContain('Total Files:** 2');
        });

        it('should support pagination', async () => {
            await createFile('file1.txt', 10);
            await createFile('file2.txt', 10);

            const result = await handleListFiles({ directory: testDir, limit: 1 });

            expect(result.content[0].text).toContain('Showing:** 1 - 1');
            expect(result.content[0].text).toContain('more files');
        });
    });

    describe('findLargestFiles', () => {
        it('should find largest files', async () => {
            await createFile('medium.txt', 100);
            await createFile('small.txt', 10);
            await createFile('large.txt', 1000);

            const result = await handleFindLargestFiles({ directory: testDir, top_n: 2 });

            const text = result.content[0].text;
            // Should be sorted
            const largeIndex = text.indexOf('large.txt');
            const mediumIndex = text.indexOf('medium.txt');
            const smallIndex = text.indexOf('small.txt');

            expect(largeIndex).not.toBe(-1);
            expect(mediumIndex).not.toBe(-1);
            expect(smallIndex).toBe(-1); // Top 2 only
            expect(largeIndex).toBeLessThan(mediumIndex);
        });

        it('should include subdirectories if requested', async () => {
            const subDir = path.join(testDir, 'sub');
            await fs.mkdir(subDir);
            const subFile = path.join(subDir, 'huge.txt');
            await fs.writeFile(subFile, Buffer.alloc(2000));

            await createFile('root.txt', 10);

            const result = await handleFindLargestFiles({ directory: testDir, include_subdirs: true });
            expect(result.content[0].text).toContain('huge.txt');
        });
    });
});
