
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

            const result = await duplicateFinder.deleteFiles([fileToDelete.path], { createBackupManifest: true });

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
    });
});
