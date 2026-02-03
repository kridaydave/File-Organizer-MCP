
import fs from 'fs/promises';
import path from 'path';
import { handleOrganizeFiles } from '../../src/tools/file-organization.js';
import { handleListFiles } from '../../src/tools/file-listing.js';
import { handleUndoLastOperation } from '../../src/tools/rollback.js';
import { jest } from '@jest/globals';

describe('Integration: Full Organization Flow', () => {
    let testDir: string;
    let baseTempDir: string;

    beforeEach(async () => {
        baseTempDir = path.join(process.cwd(), 'tests', 'temp');
        await fs.mkdir(baseTempDir, { recursive: true });
        testDir = await fs.mkdtemp(path.join(baseTempDir, 'int-org-'));
    });

    afterEach(async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should organize a messy directory and support undo', async () => {
        // 1. Setup Messy State
        const files = [
            { name: 'document.pdf', content: 'pdf' },
            { name: 'image.jpg', content: 'img' },
            { name: 'setup.exe', content: 'bin' },
            { name: 'notes.txt', content: 'text' }
        ];

        for (const f of files) {
            await fs.writeFile(path.join(testDir, f.name), f.content);
        }

        // 2. Run Organization
        const orgResult = await handleOrganizeFiles({ directory: testDir });
        expect(orgResult.content[0].text).toContain('Organization Result');
        expect(orgResult.content[0].text).toContain('Total Files Processed:** 4'); // Note: I fixed the bolding expectation in unit test so reusing it here

        // 3. Verify Organized State
        const listResult = await handleListFiles({ directory: testDir, response_format: 'json' });
        const listData = typeof listResult.structuredContent === 'string'
            ? JSON.parse(listResult.structuredContent)
            : listResult.structuredContent as any;
        const fileNames = listData?.items?.map((i: any) => i.name) || [];

        // Files should be moved, so root should mainly have directories
        // But listFiles does not recurse by default. So we see directories.
        // Expect 'Documents', 'Images', 'Executables'
        // 'text' maps to Documents usually.

        // listFiles only returns FILES, so it should be empty now if everything moved
        expect(fileNames).not.toContain('image.jpg');
        expect(fileNames).not.toContain('document.pdf');
        expect(fileNames).not.toContain('setup.exe');
        expect(fileNames).not.toContain('notes.txt');

        // Verify subdirectories exist and contain files
        await expect(fs.access(path.join(testDir, 'Images', 'image.jpg'))).resolves.not.toThrow();
        await expect(fs.access(path.join(testDir, 'Documents', 'document.pdf'))).resolves.not.toThrow();
        await expect(fs.access(path.join(testDir, 'Executables', 'setup.exe'))).resolves.not.toThrow();

        // 4. Undo
        // We need the result to know if undo is possible? Undo uses rollback service which tracks last operation.
        // But undo tool works globally on the history.

        const undoResult = await handleUndoLastOperation({});
        expect(undoResult.content[0].text).toContain('Restored:');

        // 5. Verify Reverted State
        const listResultUndo = await handleListFiles({ directory: testDir, response_format: 'json' });
        const undoData = typeof listResultUndo.structuredContent === 'string'
            ? JSON.parse(listResultUndo.structuredContent)
            : listResultUndo.structuredContent as any;
        const fileNamesUndo = undoData?.items?.map((i: any) => i.name) || [];

        expect(fileNamesUndo).toContain('image.jpg');
        expect(fileNamesUndo).toContain('document.pdf');
    });
});
