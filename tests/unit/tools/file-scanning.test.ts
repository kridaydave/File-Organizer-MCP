import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { jest } from '@jest/globals';
import { handleScanDirectory } from '../../../src/tools/file-scanning.js';

describe('File Scanning Tool', () => {
    let testDir: string;
    let baseTempDir: string;

    beforeEach(async () => {
        // Use tests/temp directory for consistency with other tests
        baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'test-scan-'));
    });

    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    const createFile = async (relativePath: string, content: string = 'test') => {
        const filePath = path.join(testDir, relativePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
        return filePath;
    };

    describe('handleScanDirectory', () => {
        it('should scan directory and return markdown format by default', async () => {
            await createFile('file1.txt');
            await createFile('file2.js');

            const result = await handleScanDirectory({ directory: testDir });

            expect(result.content).toBeDefined();
            expect(result.content[0].type).toBe('text');
            expect(result.content[0].text).toContain('Scan Results');
            expect(result.content[0].text).toContain('Total Files');
        });

        it('should return JSON format when requested', async () => {
            await createFile('test.txt', 'content');

            const result = await handleScanDirectory({
                directory: testDir,
                response_format: 'json'
            });

            expect(result.content[0].type).toBe('text');
            const jsonData = JSON.parse(result.content[0].text);
            expect(jsonData.directory).toBe(testDir);
            expect(jsonData.total_count).toBe(1);
            expect(jsonData.items).toHaveLength(1);
        });

        it('should include subdirectories when requested', async () => {
            await createFile('root.txt');
            await createFile('sub/nested.txt');

            const resultWithoutSubs = await handleScanDirectory({
                directory: testDir,
                include_subdirs: false,
                response_format: 'json'
            });

            const resultWithSubs = await handleScanDirectory({
                directory: testDir,
                include_subdirs: true,
                response_format: 'json'
            });

            const dataWithoutSubs = JSON.parse(resultWithoutSubs.content[0].text);
            const dataWithSubs = JSON.parse(resultWithSubs.content[0].text);

            expect(dataWithoutSubs.total_count).toBe(1);
            expect(dataWithSubs.total_count).toBe(2);
        });

        it('should respect max_depth parameter', async () => {
            await createFile('level0.txt');
            await createFile('level1/file1.txt');
            await createFile('level1/level2/file2.txt');

            const result = await handleScanDirectory({
                directory: testDir,
                include_subdirs: true,
                max_depth: 1,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);

            // Should include level0.txt and level1/file1.txt, but not level2
            expect(data.total_count).toBeLessThanOrEqual(2);
        });

        it('should support pagination with limit and offset', async () => {
            // Create multiple files
            for (let i = 0; i < 10; i++) {
                await createFile(`file${i}.txt`);
            }

            const result = await handleScanDirectory({
                directory: testDir,
                limit: 5,
                offset: 0,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.total_count).toBe(10);
            expect(data.returned_count).toBe(5);
            expect(data.has_more).toBe(true);
            expect(data.next_offset).toBe(5);
        });

        it('should handle second page of pagination', async () => {
            for (let i = 0; i < 15; i++) {
                await createFile(`file${i}.txt`);
            }

            const result = await handleScanDirectory({
                directory: testDir,
                limit: 10,
                offset: 10,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.total_count).toBe(15);
            expect(data.returned_count).toBe(5);
            expect(data.has_more).toBe(false);
        });

        it('should calculate total size correctly', async () => {
            await createFile('small.txt', 'a'); // 1 byte
            await createFile('medium.txt', 'a'.repeat(100)); // 100 bytes

            const result = await handleScanDirectory({
                directory: testDir,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.total_size).toBe(101);
            expect(data.total_size_readable).toBeDefined();
        });

        it('should handle empty directory', async () => {
            const result = await handleScanDirectory({
                directory: testDir,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.total_count).toBe(0);
            expect(data.items).toEqual([]);
            expect(data.has_more).toBe(false);
        });

        it('should return error for missing directory parameter', async () => {
            const result = await handleScanDirectory({});

            expect(result.content[0].text).toContain('Error');
        });

        it('should return error for empty directory path', async () => {
            const result = await handleScanDirectory({ directory: '' });

            expect(result.content[0].text).toContain('Error');
        });

        it('should return error for non-existent directory', async () => {
            const result = await handleScanDirectory({
                directory: path.join(testDir, 'nonexistent')
            });

            expect(result.content[0].text).toContain('Error');
        });

        it('should include file metadata', async () => {
            await createFile('test.txt', 'content');

            const result = await handleScanDirectory({
                directory: testDir,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            const file = data.items[0];

            expect(file).toHaveProperty('name');
            expect(file).toHaveProperty('path');
            expect(file).toHaveProperty('size');
            expect(file).toHaveProperty('extension');
            expect(file).toHaveProperty('created');
            expect(file).toHaveProperty('modified');
        });

        it('should format file extensions correctly', async () => {
            await createFile('test.txt');
            await createFile('script.js');
            await createFile('data.json');

            const result = await handleScanDirectory({
                directory: testDir,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            const extensions = data.items.map((f: any) => f.extension).sort();

            expect(extensions).toEqual(['.js', '.json', '.txt']);
        });
    });
});
