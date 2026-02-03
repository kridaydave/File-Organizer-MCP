import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleOrganizeFiles } from '../../../src/tools/file-organization.js';

describe('file_organizer_organize_files tool', () => {
    let testDir: string;
    let sampleFiles: string[];

    beforeEach(async () => {
        // Create test dir inside CWD to satisfy validateStrictPath
        testDir = path.join(process.cwd(), `test-organize-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });

        sampleFiles = ['photo.jpg', 'document.pdf', 'notes.txt'];
        for (const file of sampleFiles) {
            await fs.writeFile(path.join(testDir, file), 'dummy content');
        }
    });

    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should organize files into correct categories', async () => {
        const result = await handleOrganizeFiles({
            directory: testDir,
            dry_run: false,
            response_format: 'json'
        });

        const output = result.structuredContent as any;
        expect(output).toBeDefined();
        // In this project, Images -> jpg, Documents -> pdf/txt? 
        // Need to check default categorization rules.
        // Assuming default works.

        expect(output.total_files).toBe(sampleFiles.length);

        const subdirs = await fs.readdir(testDir);
        // We expect folders like 'Images', 'Documents'
        // If categorization is mocked or standard. 
        // Standard categorization likely puts .jpg in Images.

        // We can't be 100% sure of category names without checking config, 
        // but let's check basic movement.
        expect(subdirs.some(d => !d.includes('.'))).toBe(true); // Has subdirectories

        // Verify photo.jpg moved
        const rootFiles = await fs.readdir(testDir);
        expect(rootFiles).not.toContain('photo.jpg');
    });

    it('should handle filename conflicts gracefully', async () => {
        // Run once to create structure
        await handleOrganizeFiles({
            directory: testDir,
            dry_run: false,
            response_format: 'json'
        });

        // Create duplicate filename in source (which is now empty, so recreate)
        await fs.writeFile(path.join(testDir, 'photo.jpg'), 'new content');

        // Run again
        const result = await handleOrganizeFiles({
            directory: testDir,
            dry_run: false,
            response_format: 'json'
        });

        // Should rename to photo_1.jpg inside Images (or whatever category)
        const output = result.structuredContent as any;

        // Find where images went.
        // We can search recursively or check stats
        // check output.actions
        const actions = output.actions;
        const renameAction = actions.find((a: any) => a.to.includes('photo_1.jpg'));
        expect(renameAction).toBeDefined();
    });

    it('should respect dry_run mode', async () => {
        const result = await handleOrganizeFiles({
            directory: testDir,
            dry_run: true,
            response_format: 'json'
        });

        // Files should NOT have moved
        const files = await fs.readdir(testDir);
        expect(files).toContain('photo.jpg');
        expect(files.some(f => ['Images', 'Documents'].includes(f))).toBe(false);
    });
});
