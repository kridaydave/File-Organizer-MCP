
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DuplicateFinderService } from '../../../src/services/duplicate-finder.service.js';
import { FileWithSize } from '../../../src/types.js';
import { jest } from '@jest/globals';

describe('DuplicateFinderService', () => {
    let duplicateFinder: DuplicateFinderService;
    let testDir: string;

    beforeEach(async () => {
        // Use local temp dir to satisfy PathValidatorService (which restricts to process.cwd())
        const baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'test-duplicates-'));
        duplicateFinder = new DuplicateFinderService();
    });

    afterEach(async () => {
        try {
            // Add a small delay to ensure file handles are released (Windows)
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    const createFile = async (name: string, content: string, modifiedTime?: Date) => {
        const filePath = path.join(testDir, name);
        // Ensure parent dir exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
        const stats = await fs.stat(filePath);

        if (modifiedTime) {
            await fs.utimes(filePath, new Date(), modifiedTime);
        }

        return {
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            modified: modifiedTime || stats.mtime
        } as FileWithSize;
    };

    describe('findWithScoring', () => {
        it('should identify identical files as duplicates', async () => {
            const content = 'duplicate content';
            const file1 = await createFile('file1.txt', content);
            const file2 = await createFile('file2.txt', content);
            const file3 = await createFile('unique.txt', 'unique content');

            const duplicates = await duplicateFinder.findWithScoring([file1, file2, file3]);

            expect(duplicates.length).toBe(1);
            expect(duplicates[0].file_count).toBe(2);
            expect(duplicates[0].files.map(f => f.path).sort()).toEqual(
                expect.arrayContaining([file1.path, file2.path].sort())
            );
        });

        it('should score files based on strategy: best_location', async () => {
            const content = 'duplicate content';
            // Simulate folders
            const docFile = await createFile('Documents/doc.txt', content);
            const dlFile = await createFile('Downloads/doc.txt', content);

            const duplicates = await duplicateFinder.findWithScoring(
                [docFile, dlFile],
                'best_location'
            );

            expect(duplicates.length).toBe(1);
            // Documents should be kept (higher score), Downloads deleted (lower score)
            // Service returns "recommended_keep" as the one with highest score

            const group = duplicates[0];
            const keepPath = group.recommended_keep;

            expect(keepPath).toBe(docFile.path);

            // Verify scoring details
            const docScore = group.files.find(f => f.path === docFile.path)?.score || 0;
            const dlScore = group.files.find(f => f.path === dlFile.path)?.score || 0;

            expect(docScore).toBeGreaterThan(dlScore);
        });

        it('should score files based on strategy: newest', async () => {
            const content = 'duplicate content';
            const oldDate = new Date('2023-01-01');
            const newDate = new Date('2024-01-01');

            const oldFile = await createFile('old.txt', content, oldDate);
            const newFile = await createFile('new.txt', content, newDate);

            const duplicates = await duplicateFinder.findWithScoring(
                [oldFile, newFile],
                'newest'
            );

            const group = duplicates[0];
            expect(group.recommended_keep).toBe(newFile.path); // Keep newest
        });
    });

    describe('deleteFiles', () => {
        it('should delete specified files and create rollback', async () => {
            const content = 'to be deleted';
            const fileToDelete = await createFile('delete_me.txt', content);

            // We need to verify verifyIsDuplicate calls calculateHash using a real handle.
            // Since we created the file, it exists.

            const result = await duplicateFinder.deleteFiles([fileToDelete.path], {
                createBackupManifest: true,
                autoVerify: false
            });

            expect(result.deleted).toContain(fileToDelete.path);
            expect(result.failed.length).toBe(0);
            expect(result.manifestPath).toBeDefined();

            // Verify file is gone from original location
            await expect(fs.access(fileToDelete.path)).rejects.toThrow();

            // Verify backup exists (simple check if we knew the backup path, but it generates a timestamped name)
            // We can check if .file-organizer-backups exists
            const backupDir = path.join(process.cwd(), '.file-organizer-backups');
            const backups = await fs.readdir(backupDir);
            expect(backups.length).toBeGreaterThan(0);

            // Cleanup backup dir (optional, but good practice)
            // Don't delete entire backup dir as it might affect other tests or user data if running locally?
            // Since we are running in a constrained environment, maybe it's fine.
            // But we should be careful. 
            // In test environment, maybe we should mock process.cwd() or similar, 
            // but the service uses process.cwd().
        });

        it('should fail if file does not exist', async () => {
            const result = await duplicateFinder.deleteFiles([path.join(testDir, 'nonexistent.txt')]);
            expect(result.failed.length).toBe(1);
            expect(result.failed[0].error).toContain('File not found');
        });

        // Updated Test: Simplified verification (accessibility only)
        it('should delete any accessible files (user responsible for identifying duplicates)', async () => {
            const file1 = await createFile('file1.txt', 'content A');
            const file2 = await createFile('file2.txt', 'content B'); // Different content

            const result = await duplicateFinder.deleteFiles([file1.path, file2.path], { autoVerify: false });

            // New behavior: Files are accessible, so they get deleted
            // User is responsible for identifying duplicates via analyze_duplicates first
            expect(result.deleted.length).toBe(2);
            expect(result.failed.length).toBe(0);

            // Verify both files are deleted
            await expect(fs.access(file1.path)).rejects.toThrow();
            await expect(fs.access(file2.path)).rejects.toThrow();
        });

        it('should successfully delete actual duplicate files', async () => {
            const content = 'same content for duplicates';
            const dup1 = await createFile('dup1.txt', content);
            const dup2 = await createFile('dup2.txt', content);
            const dup3 = await createFile('dup3.txt', content);

            const result = await duplicateFinder.deleteFiles([dup1.path, dup2.path, dup3.path], { autoVerify: false });

            // All should be deleted successfully
            expect(result.deleted.length).toBe(3);
            expect(result.failed.length).toBe(0);
            expect(result.manifestPath).toBeDefined();

            // Verify all files are gone
            await expect(fs.access(dup1.path)).rejects.toThrow();
            await expect(fs.access(dup2.path)).rejects.toThrow();
            await expect(fs.access(dup3.path)).rejects.toThrow();
        });

        it('should delete files with different content if user requests (trust user intent)', async () => {
            const dup1 = await createFile('dup1.txt', 'duplicate content');
            const dup2 = await createFile('dup2.txt', 'duplicate content');
            const unique = await createFile('unique.txt', 'different content');

            const result = await duplicateFinder.deleteFiles([dup1.path, dup2.path, unique.path], { autoVerify: false });

            // New behavior: All files are accessible, all get deleted
            // Tool trusts user has verified duplicates via analyze_duplicates
            expect(result.deleted.length).toBe(3);
            expect(result.failed.length).toBe(0);

            // All files should be deleted
            await expect(fs.access(dup1.path)).rejects.toThrow();
            await expect(fs.access(dup2.path)).rejects.toThrow();
            await expect(fs.access(unique.path)).rejects.toThrow();
        });

        it('should successfully delete multiple duplicate groups in one batch', async () => {
            // Group 1: file1 = file2
            const file1 = await createFile('file1.txt', 'content A');
            const file2 = await createFile('file2.txt', 'content A');

            // Group 2: file3 = file4
            const file3 = await createFile('file3.txt', 'content B');
            const file4 = await createFile('file4.txt', 'content B');

            // Delete all 4 files in one batch (2 duplicate groups)
            const result = await duplicateFinder.deleteFiles([
                file1.path, file2.path, file3.path, file4.path
            ], { autoVerify: false });

            // All should be deleted successfully
            expect(result.deleted.length).toBe(4);
            expect(result.failed.length).toBe(0);
            expect(result.manifestPath).toBeDefined();

            // Verify all files are gone
            await expect(fs.access(file1.path)).rejects.toThrow();
            await expect(fs.access(file2.path)).rejects.toThrow();
            await expect(fs.access(file3.path)).rejects.toThrow();
            await expect(fs.access(file4.path)).rejects.toThrow();
        });

        it('should handle single file deletion (edge case)', async () => {
            const file = await createFile('single.txt', 'content');

            // Single file has nothing to compare against, should succeed if verification disabled
            const result = await duplicateFinder.deleteFiles([file.path], { autoVerify: false });

            expect(result.deleted.length).toBe(1);
            expect(result.failed.length).toBe(0);
        });

        it('should delete single duplicate file (keeping another copy)', async () => {
            const dup1 = await createFile('dup1.txt', 'same content');
            const dup2 = await createFile('dup2.txt', 'same content');

            // Delete only dup2, keep dup1
            const result = await duplicateFinder.deleteFiles([dup2.path]);

            expect(result.deleted).toContain(dup2.path);
            expect(result.failed.length).toBe(0);

            // dup2 is gone, dup1 remains
            await expect(fs.access(dup2.path)).rejects.toThrow();
            await expect(fs.access(dup1.path)).resolves.toBeUndefined();
        });

        it('should partially succeed with mixed accessible/inaccessible files', async () => {
            const validFile = await createFile('valid.txt', 'content');
            const invalidPath = path.join(testDir, 'nonexistent.txt');

            const result = await duplicateFinder.deleteFiles([validFile.path, invalidPath], { autoVerify: false });

            // Valid file deleted, invalid file failed
            expect(result.deleted).toContain(validFile.path);
            expect(result.failed.length).toBe(1);
            expect(result.failed[0].path).toBe(invalidPath);
            expect(result.failed[0].error).toContain('File not found');
        });

        // Auto-Verification Tests
        it('should reject deleting last copy of file (auto-verify enabled)', async () => {
            const uniqueFile = await createFile('unique_verify.txt', 'unique content');

            const result = await duplicateFinder.deleteFiles([uniqueFile.path], { autoVerify: true }); // autoVerify=true explicitly

            expect(result.failed.length).toBe(1);
            expect(result.failed[0].error).toContain('last copy');
            expect(result.deleted.length).toBe(0);
        });

        it('should allow deleting when duplicate exists (auto-verify enabled)', async () => {
            const file1 = await createFile('file1_keep.txt', 'shared content');
            const file2 = await createFile('file2_del.txt', 'shared content');

            // Delete file2, file1 remains
            const result = await duplicateFinder.deleteFiles([file2.path], { autoVerify: true }); // autoVerify=true

            expect(result.deleted).toContain(file2.path);
            expect(result.failed.length).toBe(0);

            // Verify file1 still exists
            await expect(fs.access(file1.path)).resolves.toBeUndefined();
        });

        it('should reject deleting all copies (auto-verify enabled)', async () => {
            const file1 = await createFile('file1_all.txt', 'shared content all');
            const file2 = await createFile('file2_all.txt', 'shared content all');

            // Try to delete both
            const result = await duplicateFinder.deleteFiles([file1.path, file2.path], { autoVerify: true });

            expect(result.failed.length).toBe(2); // Should reject both
            expect(result.deleted.length).toBe(0);
        });
    });
});
