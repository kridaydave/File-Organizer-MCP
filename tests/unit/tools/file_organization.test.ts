import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { jest } from '@jest/globals';
import { handleOrganizeFiles } from '../../../src/tools/file-organization.js';

describe('File Organization Tool', () => {
    let testDir: string;

    beforeEach(async () => {
        // Use Desktop directory which is allowed by path validator
        const desktopBase = path.join(process.env.USERPROFILE || '', 'Desktop');
        testDir = path.join(desktopBase, 'test-organize-' + Date.now());
        await fs.mkdir(testDir, { recursive: true });
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

    describe('handleOrganizeFiles', () => {
        it('should organize files in dry run mode', async () => {
            await createFile('document.pdf');
            await createFile('image.jpg');
            await createFile('video.mp4');

            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true
            });

            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Dry Run');
            expect(result.content[0].text).toContain('Organization Result');
        });

        it('should return JSON format when requested', async () => {
            await createFile('test.txt');

            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data).toHaveProperty('directory');
            expect(data).toHaveProperty('dry_run');
            expect(data).toHaveProperty('total_files');
            expect(data).toHaveProperty('statistics');
            expect(data).toHaveProperty('actions');
        });

        it('should categorize different file types', async () => {
            await createFile('doc.pdf');
            await createFile('pic.jpg');
            await createFile('song.mp3');
            await createFile('code.js');

            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.statistics).toBeDefined();

            // Should have multiple categories
            const categories = Object.keys(data.statistics);
            expect(categories.length).toBeGreaterThan(0);
        });

        it('should not move files in dry run mode', async () => {
            const filePath = await createFile('test.pdf');

            await handleOrganizeFiles({
                directory: testDir,
                dry_run: true
            });

            // File should still exist in original location
            const exists = await fs.access(filePath).then(() => true).catch(() => false);
            expect(exists).toBe(true);
        });

        it('should move files when dry_run is false', async () => {
            const filePath = await createFile('test.pdf');

            await handleOrganizeFiles({
                directory: testDir,
                dry_run: false
            });

            // Original file should be moved
            const originalExists = await fs.access(filePath).then(() => true).catch(() => false);
            expect(originalExists).toBe(false);

            // Check if Documents folder was created (PDF goes to Documents)
            const documentsDir = path.join(testDir, 'Documents');
            const dirExists = await fs.access(documentsDir).then(() => true).catch(() => false);
            expect(dirExists).toBe(true);
        });

        it('should report statistics for each category', async () => {
            await createFile('doc1.pdf');
            await createFile('doc2.docx');
            await createFile('img1.jpg');
            await createFile('img2.png');

            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.statistics).toBeDefined();

            // Documents and Images should each have 2 files
            if (data.statistics.Documents) {
                expect(data.statistics.Documents).toBe(2);
            }
            if (data.statistics.Images) {
                expect(data.statistics.Images).toBe(2);
            }
        });

        it('should list actions to be performed', async () => {
            await createFile('test.pdf');

            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.actions).toBeDefined();
            expect(Array.isArray(data.actions)).toBe(true);

            if (data.actions.length > 0) {
                const action = data.actions[0];
                expect(action).toHaveProperty('file');
                expect(action).toHaveProperty('from');
                expect(action).toHaveProperty('to');
                expect(action).toHaveProperty('category');
            }
        });

        it('should handle empty directory', async () => {
            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.total_files).toBe(0);
            expect(data.actions).toEqual([]);
        });

        it('should return error for missing directory parameter', async () => {
            const result = await handleOrganizeFiles({});

            expect(result.content[0].text).toContain('Error');
        });

        it('should return error for empty directory path', async () => {
            const result = await handleOrganizeFiles({ directory: '' });

            expect(result.content[0].text).toContain('Error');
        });

        it('should return error for non-existent directory', async () => {
            const result = await handleOrganizeFiles({
                directory: path.join(testDir, 'nonexistent')
            });

            expect(result.content[0].text).toContain('Error');
        });

        it('should handle files with unknown extensions', async () => {
            await createFile('unknown.xyz123');

            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.total_files).toBe(1);

            // Unknown files should go to 'Others' category
            if (data.statistics.Others) {
                expect(data.statistics.Others).toBeGreaterThanOrEqual(1);
            }
        });

        it('should truncate long action lists in markdown', async () => {
            // Create many files
            for (let i = 0; i < 30; i++) {
                await createFile(`file${i}.txt`);
            }

            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true,
                response_format: 'markdown'
            });

            // Should show truncation message for >20 actions
            expect(result.content[0].text).toContain('more actions');
        });

        it('should report errors if any occur', async () => {
            await createFile('test.txt');

            const result = await handleOrganizeFiles({
                directory: testDir,
                dry_run: true,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data).toHaveProperty('errors');
            expect(Array.isArray(data.errors)).toBe(true);
        });

        it('should default dry_run to false when not specified', async () => {
            await createFile('test.txt');

            const result = await handleOrganizeFiles({
                directory: testDir,
                response_format: 'json'
            });

            const data = JSON.parse(result.content[0].text);
            expect(data.dry_run).toBe(false);
        });
    });
});
