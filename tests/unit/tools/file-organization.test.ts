
import fs from 'fs/promises';
import path from 'path';
import { handleOrganizeFiles } from '../../../src/tools/file-organization.js';
import { jest } from '@jest/globals';

describe('organizeFiles Tool', () => {
    let testDir: string;
    let baseTempDir: string;

    beforeEach(async () => {
        baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'test-organize-tool-'));
    });

    afterEach(async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should organize files in a directory', async () => {
        // Create a file to organize
        const file = path.join(testDir, 'test.jpg');
        await fs.writeFile(file, 'content');

        // ensure Images directory exists if organizer doesn't create it? 
        // Organizer service usually creates directories.

        const result = await handleOrganizeFiles({ directory: testDir });

        // Check text content
        const text = result.content[0].text;
        expect(text).toContain('Organization Result');
        expect(text).toContain('**Total Files Processed:** 1');
        // It might move it to Images/test.jpg or similar.
        // We can check if it says "Moved"
        expect(text).toContain('Moved');

        // Verify file moved on disk
        const imagesDir = path.join(testDir, 'Images');
        const movedFile = path.join(imagesDir, 'test.jpg');
        await expect(fs.access(movedFile)).resolves.not.toThrow();
    });

    it('should support dry_run', async () => {
        const file = path.join(testDir, 'test.pdf');
        await fs.writeFile(file, 'pdf content');

        const result = await handleOrganizeFiles({ directory: testDir, dry_run: true });

        expect(result.content[0].text).toContain('(Dry Run)');
        expect(result.content[0].text).toContain('Moved'); // It lists the "Moved" action even in dry run

        // Verify file did NOT move
        await expect(fs.access(file)).resolves.not.toThrow();
        // Verify dest dir does not exist (or file not in it)
        const docsDir = path.join(testDir, 'Documents');
        // Documents dir might not be created in dry run? Or maybe it is?
        // Organizer service dry run usually returns actions without executing.
        try {
            await fs.access(docsDir);
            // If exists, check file
            await expect(fs.access(path.join(docsDir, 'test.pdf'))).rejects.toThrow();
        } catch {
            // Dir doesn't exist, which is good
        }
    });

    it('should return empty result for non-existent directory', async () => {
        const result = await handleOrganizeFiles({ directory: path.join(testDir, 'fake') });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('**Total Files Processed:** 0');
    });
});
