import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleOrganizeFiles } from '../../../src/tools/file-organization.js';

describe('BUG-38 organize silently drops skipped files', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = path.join(process.cwd(), `test-bug38-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should surface skipped files in both json and markdown when using skip conflict strategy', async () => {
        // First organize to create destination
        await fs.writeFile(path.join(testDir, 'photo.jpg'), 'first');
        await handleOrganizeFiles({
            directory: testDir,
            dry_run: false,
            response_format: 'json'
        });

        // Put another file with same name in root to create conflict
        await fs.writeFile(path.join(testDir, 'photo.jpg'), 'second');

        // Organize with skip strategy
        const jsonResult = await handleOrganizeFiles({
            directory: testDir,
            dry_run: false,
            response_format: 'json',
            conflict_strategy: 'skip'
        });

        expect(jsonResult.isError).toBeFalsy();
        const output = jsonResult.structuredContent as any;
        expect(output).toBeDefined();
        expect(output.skippedFiles).toBeDefined();
        expect(Array.isArray(output.skippedFiles)).toBe(true);
        expect(output.skippedFiles.length).toBeGreaterThan(0);
        expect(output.skippedCount).toBeGreaterThan(0);

        const mdResult = await handleOrganizeFiles({
            directory: testDir,
            dry_run: false,
            response_format: 'markdown',
            conflict_strategy: 'skip'
        });

        expect(mdResult.isError).toBeFalsy();
        const mdText = mdResult.content?.[0]?.text || '';
        expect(mdText).toMatch(/Skipped Files/i);
    });
});
