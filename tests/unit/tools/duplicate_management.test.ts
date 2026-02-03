
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleFindDuplicateFiles } from '../../../src/tools/file-duplicates.js'; // Check import path
import { handleDeleteDuplicates } from '../../../src/tools/duplicate-management.js'; // Check import path
import { DuplicateFinderService } from '../../../src/services/duplicate-finder.service.js';

describe('Duplicate Management Tools', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = path.join(process.cwd(), `test-dupes-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
        jest.restoreAllMocks();
    });

    it('should find duplicate files', async () => {
        // Create duplicates
        await fs.writeFile(path.join(testDir, 'original.txt'), 'content');
        await fs.writeFile(path.join(testDir, 'dupe1.txt'), 'content');
        await fs.writeFile(path.join(testDir, 'dupe2.txt'), 'content');
        // Different content
        await fs.writeFile(path.join(testDir, 'diff.txt'), 'diff');

        const result = await handleFindDuplicateFiles({
            directory: testDir
        });

        // Parse markdown or check structured content? 
        // handleFindDuplicateFiles returns text content usually.
        // But let's check text content for filenames.
        const text = result.content[0].text;
        expect(text).toContain('original.txt');
        expect(text).toContain('dupe1.txt');
        expect(text).toContain('dupe2.txt');
        expect(text).not.toContain('diff.txt');
    });

    it('should delete duplicate files w/ verification', async () => {
        const fileToDelete = path.join(testDir, 'dupe_to_delete.txt');
        await fs.writeFile(fileToDelete, 'content');
        // We need another file to be the "original"? 
        // DuplicateFinder usually checks against a set of files or just deletes what passed?
        // handleDeleteDuplicates(files_to_delete) calls DuplicateFinder.deleteFiles.
        // It verifies they exist and (optionally) if they are duplicates of something?
        // Actually `deleteFiles` just deletes them. `delete_duplicates` tool usually implies they were identified.

        // Mock DuplicateFinderService.verifyDuplicates if needed?
        // But let's test the tool end-to-end.

        const result = await handleDeleteDuplicates({
            files_to_delete: [fileToDelete]
            // verify_duplicates removed from schema
        });

        if (result.content[0].text.includes('Failed')) {
            console.log('DEBUG_DUPE_FAIL:', result.content[0].text);
        }

        const deleted = await fs.access(fileToDelete).then(() => false).catch(() => true);
        expect(deleted).toBe(true);
        expect(result.content[0].text).toContain('Deleted:');
    });

    it('should fail to delete missing files', async () => {
        const missingFile = path.join(testDir, 'missing.txt');
        const result = await handleDeleteDuplicates({
            files_to_delete: [missingFile]
        });

        expect(result.content[0].text).toContain('Failures:'); // Returns "Failures:" section
        // Detailed check if we had IsError behavior
    });
});
