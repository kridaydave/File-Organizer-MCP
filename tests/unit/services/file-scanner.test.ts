
import fs from 'fs/promises';
import path from 'path';
import { FileScannerService } from '../../../src/services/file-scanner.service.js';
import { FileInfo } from '../../../src/types.js';

describe('FileScannerService', () => {
    let fileScanner: FileScannerService;
    let testDir: string;
    let baseTempDir: string;

    beforeEach(async () => {
        baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'test-scanner-'));
        fileScanner = new FileScannerService();
    });

    afterEach(async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    const createFile = async (name: string, content: string = 'content') => {
        const filePath = path.join(testDir, name);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
        return filePath;
    };

    const createDir = async (name: string) => {
        const dirPath = path.join(testDir, name);
        await fs.mkdir(dirPath, { recursive: true });
        return dirPath;
    };

    describe('scanDirectory', () => {
        it('should scan files in the root directory', async () => {
            await createFile('file1.txt');
            await createFile('file2.txt');
            // Should ignore dotfiles
            await createFile('.hidden');

            const results = await fileScanner.scanDirectory(testDir);

            expect(results.length).toBe(2);
            expect(results.map(f => f.name).sort()).toEqual(['file1.txt', 'file2.txt']);
        });

        it('should scan recursively when includeSubdirs is true', async () => {
            await createFile('root.txt');
            await createFile('sub/child.txt');

            const results = await fileScanner.scanDirectory(testDir, { includeSubdirs: true });

            expect(results.length).toBe(2);
            expect(results.map(f => f.name).sort()).toEqual(['child.txt', 'root.txt']);
        });

        it('should not scan recursively when includeSubdirs is false', async () => {
            await createFile('root.txt');
            await createFile('sub/child.txt');

            const results = await fileScanner.scanDirectory(testDir, { includeSubdirs: false });

            expect(results.length).toBe(1);
            expect(results[0].name).toBe('root.txt');
        });

        it('should respect maxDepth limit', async () => {
            // Structure: level1/level2/level3/file.txt
            await createFile('level1/level2/level3/deep.txt');
            await createFile('level1/shallow.txt');

            // Max depth 1: Should find level1 items. level1/level2 is depth 2 (relative to root? Or recursive steps?)
            // scanDir logic: currentDepth starts at 0.
            // root items are depth 0.
            // sub folder items (level1/shallow.txt) are depth 1.
            // level1/level2/level3 is depth 3.

            const results = await fileScanner.scanDirectory(testDir, { includeSubdirs: true, maxDepth: 1 });

            // Should find 'shallow.txt' (depth 1) but NOT 'deep.txt' (depth 3)
            // Wait, level1 is a dir. 'shallow.txt' is inside 'level1'.
            // Root has 'level1' dir.
            // Recurse into 'level1' (depth 1). 
            // Inside 'level1', we find 'shallow.txt'.
            // We also see 'level2' directory.
            // Should we recurse into 'level2' (depth 2)? No, if maxDepth is 1.

            const fileNames = results.map(f => f.name);
            expect(fileNames).toContain('shallow.txt');
            expect(fileNames).not.toContain('deep.txt');
        });

        it('should ignore skipped directories (node_modules, .git)', async () => {
            await createFile('normal.txt');
            await createFile('node_modules/package.json');
            await createFile('.git/config');

            const results = await fileScanner.scanDirectory(testDir, { includeSubdirs: true });

            expect(results.length).toBe(1);
            expect(results[0].name).toBe('normal.txt');
        });

        it('should respect maxFiles limit', async () => {
            const smallScanner = new FileScannerService(2); // Max 2 files
            await createFile('file1.txt');
            await createFile('file2.txt');
            await createFile('file3.txt');

            await expect(smallScanner.scanDirectory(testDir)).rejects.toThrow('Maximum file limit');
        });
    });

    describe('getAllFiles', () => {
        it('should return simplified file list', async () => {
            await createFile('file1.txt');
            const results = await fileScanner.getAllFiles(testDir);

            expect(results.length).toBe(1);
            expect(results[0]).toHaveProperty('size');
            expect(results[0]).toHaveProperty('path');
            expect(results[0]).not.toHaveProperty('extension'); // FileWithSize vs FileInfo (FileInfo has extension)
        });
    });
});
