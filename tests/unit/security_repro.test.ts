
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { validateStrictPath } from '../../src/services/path-validator.service.js';
import { DuplicateFinderService } from '../../src/services/duplicate-finder.service.js';
import { handleScanDirectory } from '../../src/tools/file-scanning.js';

// Console usage unmocked to verify output
// global.console = { ... } as any;

describe('Security Repro Suite (Refactored)', () => {

    describe('Test 1: Windows Reserved Names', () => {
        it('should block usage of CON.txt', async () => {
            const badPath = path.join(os.homedir(), 'Desktop', 'CON.txt');
            await expect(validateStrictPath(badPath))
                .rejects
                .toThrow(/Windows reserved name/);
        });

        it('should block usage of aux', async () => {
            const badPath = path.join(os.homedir(), 'Desktop', 'aux');
            await expect(validateStrictPath(badPath))
                .rejects
                .toThrow(/Windows reserved name/);
        });
    });

    describe('Test 2: Max Depth Limit', () => {
        it('should block max_depth > 100', async () => {
            const result = await handleScanDirectory({
                directory: process.cwd(),
                max_depth: 101,
                include_subdirs: true
            });
            console.log('DEBUG_MAX_DEPTH:', JSON.stringify(result.content[0].text));
            expect(result.content[0].text).toMatch(/^Error:/);
        });
    });

    describe('Test 3: Unvalidated Deletion', () => {
        let duplicateFinder: DuplicateFinderService;

        beforeEach(async () => {
            duplicateFinder = new DuplicateFinderService();
        });

        it('should block deletion of files outside allowed directories', async () => {
            let forbiddenPath = '';
            if (process.platform === 'win32') {
                forbiddenPath = 'C:\\Windows\\System32\\calc.exe';
            } else {
                forbiddenPath = '/etc/passwd';
            }

            const result = await duplicateFinder.deleteFiles([forbiddenPath], {
                createBackupManifest: false
            });

            expect(result.failed).toHaveLength(1);
            const errorMsg = result.failed[0].error;
            expect(errorMsg).toMatch(/Access denied|outside the allowed directory|Path is outside|reserved name/i);
        });
    });
});
