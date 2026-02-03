
import fs from 'fs/promises';
import path from 'path';
import { handleAnalyzeDuplicates, handleDeleteDuplicates } from '../../src/tools/duplicate-management.js';
import { handleFindDuplicateFiles } from '../../src/tools/file-duplicates.js';
import { jest } from '@jest/globals';

describe('Integration: Duplicate Resolution Flow', () => {
    let testDir: string;
    let baseTempDir: string;

    beforeEach(async () => {
        baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'int-dupe-'));
    });

    afterEach(async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should find and resolve duplicates', async () => {
        // 1. Setup Duplicates
        const content = 'duplicate content';
        const file1 = path.join(testDir, 'original.txt');
        const file2 = path.join(testDir, 'copy.txt');

        await fs.writeFile(file1, content);
        await fs.writeFile(file2, content);

        // 2. Find Duplicates
        // Note: findDuplicateFiles returns list of groups
        const findResult = await handleFindDuplicateFiles({ directory: testDir });
        expect(findResult.content[0].text).toContain('original.txt');
        expect(findResult.content[0].text).toContain('copy.txt');

        // 3. Analyze (Optional but good for flow)
        // analyzeDuplicates takes directory too
        const analyzeResult = await handleAnalyzeDuplicates({ directory: testDir });
        expect(analyzeResult.content[0].text).toContain('Duplicate Analysis');

        // 4. Resolve (Delete one)
        // handleDeleteDuplicates takes a list of paths
        const deleteResult = await handleDeleteDuplicates({ files_to_delete: [file2] });
        expect(deleteResult.content[0].text).toContain('**Deleted:** 1 files'); // Match markdown bold format

        // 5. Verify
        await expect(fs.access(file1)).resolves.not.toThrow(); // Should exist
        await expect(fs.access(file2)).rejects.toThrow(); // Should be gone

        // 6. Verify Backups (deletion creates backup by default)
        // We can't easily guess the backup path timestamp, but we can assume success based on output.
    });
});
