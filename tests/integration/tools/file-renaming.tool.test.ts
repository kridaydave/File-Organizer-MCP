
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { handleBatchRename } from '../../../src/tools/file-renaming.js';

describe('file_organizer_batch_rename Tool', () => {
    let testDir: string;

    beforeEach(async () => {
        const sandboxRoot = path.join(process.cwd(), 'tests', 'sandbox');
        await fs.mkdir(sandboxRoot, { recursive: true });
        testDir = await fs.mkdtemp(path.join(sandboxRoot, 'tool-test-'));
    });

    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (e) {
            // ignore
        }
    });

    it('should return error if neither files nor directory provided', async () => {
        const result = await handleBatchRename({
            rules: [{ type: 'case', conversion: 'lowercase' }]
        });

        expect(result.content[0].text).toContain('Error');
        expect(result.content[0].text).toContain('must be provided');
    });

    it('should generate markdown preview in dry_run (default)', async () => {
        const file = path.join(testDir, 'TEST.txt');
        await fs.writeFile(file, 'content');

        const result = await handleBatchRename({
            files: [file],
            rules: [{ type: 'case', conversion: 'lowercase' }]
            // dry_run defaults to true
        });

        const output = result.content[0].text;
        expect(output).toContain('Batch Rename (Dry Run)');
        expect(output).toContain('TEST.txt');
        expect(output).toContain('test.txt');
        expect(output).toContain('✅ OK');

        // File should not be renamed
        const onDisk = await fs.readdir(testDir);
        expect(onDisk).toContain('TEST.txt');
    });

    it('should execute rename when dry_run is false', async () => {
        const file = path.join(testDir, 'ToRename.txt');
        await fs.writeFile(file, 'content');

        const result = await handleBatchRename({
            files: [file],
            rules: [{ type: 'case', conversion: 'snake_case' }],
            dry_run: false
        });

        const output = result.content[0].text;
        expect(output).toContain('Execution Summary');
        expect(output).toContain('Renamed:** 1');

        // File should be renamed
        const onDisk = await fs.readdir(testDir);
        expect(onDisk).toContain('to_rename.txt');
        expect(onDisk).not.toContain('ToRename.txt');
    });

    it('should handle directory scanning', async () => {
        await fs.writeFile(path.join(testDir, 'A.txt'), 'content');
        await fs.writeFile(path.join(testDir, 'B.txt'), 'content');

        const result = await handleBatchRename({
            directory: testDir,
            rules: [{ type: 'case', conversion: 'lowercase' }],
            dry_run: false
        });

        if (!result.content[0].text.includes('Renamed:** 2')) {
            console.log('Failing Result:', result.content[0].text);
        }

        const output = result.content[0].text;
        expect(output).toContain('Renamed:** 2');

        const onDisk = await fs.readdir(testDir);
        expect(onDisk).toContain('a.txt');
        expect(onDisk).toContain('b.txt');
    });
});
