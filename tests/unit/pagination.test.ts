
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleScanDirectory } from '../../src/tools/file-scanning.js';

describe('Pagination Tests', () => {
    let testDir: string;
    const TOTAL_FILES = 25;

    beforeEach(async () => {
        testDir = path.join(process.cwd(), `test-pagination-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });

        // Create 25 files
        for (let i = 0; i < TOTAL_FILES; i++) {
            // zero pad to ensure order? file-01, file-02... 
            // FileScanner doesn't guarantee order unless sorted. 
            // Usually OS order or arbitrary.
            const name = `file-${String(i).padStart(2, '0')}.txt`;
            await fs.writeFile(path.join(testDir, name), 'content');
        }
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
    });

    it('should respect limit', async () => {
        const limit = 10;
        const result = await handleScanDirectory({
            directory: testDir,
            limit: limit,
            response_format: 'json'
        });

        const output = (result as any).structuredContent;
        expect(output.returned_count).toBe(10);
        expect(output.items).toHaveLength(10);
        expect(output.has_more).toBe(true);
    });

    it('should respect offset', async () => {
        const limit = 10;
        const offset = 10;
        const result = await handleScanDirectory({
            directory: testDir,
            limit: limit,
            offset: offset,
            response_format: 'json'
        });

        const output = (result as any).structuredContent;
        expect(output.returned_count).toBe(10); // 10 to 20
        expect(output.offset).toBe(10);
        expect(output.next_offset).toBe(20);
    });

    it('should handle end of list', async () => {
        const limit = 10;
        const offset = 20; // 5 remaining
        const result = await handleScanDirectory({
            directory: testDir,
            limit: limit,
            offset: offset,
            response_format: 'json'
        });

        const output = (result as any).structuredContent;
        expect(output.returned_count).toBe(5);
        expect(output.has_more).toBe(false);
    });
});
