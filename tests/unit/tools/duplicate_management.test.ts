
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleFindDuplicateFiles } from '../../../src/tools/file-duplicates.js'; // Check import path
import { handleDeleteDuplicates } from '../../../src/tools/duplicate-management.js'; // Check import path

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
        // Add a copy so verification passes
        await fs.writeFile(path.join(testDir, 'original_copy.txt'), 'content');
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

    describe('verification is on by default (issue #22 item 2)', () => {
        it('refuses to delete a last copy that the MCP caller passed in', async () => {
            // No other file in the tree has this content, so deleting it would
            // be unrecoverable data loss. autoVerify was previously unreachable
            // from the tool surface, so this went through.
            const lonely = path.join(testDir, 'lonely.txt');
            await fs.writeFile(lonely, 'content nobody else has');

            const result = await handleDeleteDuplicates({
                files_to_delete: [lonely]
            });

            const stillThere = await fs.access(lonely).then(() => true).catch(() => false);
            expect(stillThere).toBe(true);
            expect(result.content[0].text).toContain('last copy');
        });

        it('reports that the run was verified', async () => {
            const dupe = path.join(testDir, 'dupe.txt');
            await fs.writeFile(dupe, 'shared content');
            await fs.writeFile(path.join(testDir, 'keeper.txt'), 'shared content');

            const result = await handleDeleteDuplicates({
                files_to_delete: [dupe]
            });

            expect(result.content[0].text).toContain('Verified:');
        });

        it('surfaces the manifest_id needed to undo the deletion', async () => {
            const dupe = path.join(testDir, 'dupe2.txt');
            await fs.writeFile(dupe, 'shared content two');
            await fs.writeFile(path.join(testDir, 'keeper2.txt'), 'shared content two');

            const result = await handleDeleteDuplicates({
                files_to_delete: [dupe],
                response_format: 'json'
            });

            const structured = result.structuredContent as Record<string, unknown>;
            expect(structured.manifest_id).toBeTruthy();
            expect(structured.verified).toBe(true);
        });

        it('honours verify_before_delete: false as an explicit opt-out', async () => {
            const lonely = path.join(testDir, 'lonely_optout.txt');
            await fs.writeFile(lonely, 'content nobody else has either');

            const result = await handleDeleteDuplicates({
                files_to_delete: [lonely],
                verify_before_delete: false
            });

            const gone = await fs.access(lonely).then(() => false).catch(() => true);
            expect(gone).toBe(true);
            // The opt-out is disclosed, never silent.
            expect(result.content[0].text).toContain('Unverified:');
        });
    });

    describe('skipped files are reported (issue #22 item 1)', () => {
        it('includes a skipped array in the JSON response', async () => {
            await fs.writeFile(path.join(testDir, 'a.txt'), 'same');
            await fs.writeFile(path.join(testDir, 'b.txt'), 'same');
            await fs.writeFile(path.join(testDir, 'empty.txt'), '');

            const result = await handleFindDuplicateFiles({
                directory: testDir,
                response_format: 'json'
            });

            const structured = result.structuredContent as {
                skipped: { name: string; reason: string }[];
                skipped_bytes: number;
            };

            expect(Array.isArray(structured.skipped)).toBe(true);
            expect(structured.skipped.map(s => s.name)).toContain('empty.txt');
            expect(structured.skipped.find(s => s.name === 'empty.txt')?.reason)
                .toBe('empty_file');
        });
    });
});
