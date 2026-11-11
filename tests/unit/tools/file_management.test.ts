/**
 * file-management tools: get_categories + set_custom_rules
 *
 * set_custom_rules writes to the user config, so this suite redirects
 * getUserConfigPath at a temp dir. The previous version of this file called
 * the handler for real, which meant running the unit suite rewrote the
 * developer's own config.json.
 *
 * Assertions read the written file back rather than trusting the reply text,
 * so they fail if the handler stops persisting (or persists the wrong shape).
 */
import { jest, describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CustomRule } from '../../../src/types.js';
import type { UserConfig } from '../../../src/core/config/loader.js';
import { first } from '../../helpers/safe-index.js';

const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'test-custom-rules-'));
const configPath = path.join(tempDir, 'config.json');
let activeConfigPath = configPath;

// Import the real module before registering the mock — importing the same
// specifier inside the factory would resolve to the mock and loop forever.
const actualPaths = await import('../../../src/core/config/paths.js');

jest.unstable_mockModule('../../../src/core/config/paths.js', () => ({
    ...actualPaths,
    getUserConfigPath: () => activeConfigPath,
}));

const { handleGetCategories, handleSetCustomRules } = await import(
    '../../../src/tools/file-management.js'
);
const { loadUserConfig } = await import('../../../src/config.js');

function readPersistedConfig(): UserConfig {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as UserConfig;
}

describe('File Management Tools', () => {
    beforeEach(() => {
        activeConfigPath = configPath;
        fs.rmSync(configPath, { force: true, recursive: true });
        fs.rmSync(path.join(tempDir, 'blocked.json'), { force: true, recursive: true });
    });

    afterAll(async () => {
        // Windows keeps handles briefly after a write; give them a moment.
        await new Promise((resolve) => setTimeout(resolve, 100));
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('handleGetCategories', () => {
        it('should return categories in markdown format by default', async () => {
            const result = await handleGetCategories({});

            expect(result.content).toBeDefined();
            expect(result.content.length).toBeGreaterThan(0);
            expect(result.content[0].type).toBe('text');
            expect(result.content[0].text).toContain('### Available Categories');
            expect(result.content[0].text).toContain('Documents');
            expect(result.content[0].text).toContain('Images');
        });

        it('should return categories in JSON format when requested', async () => {
            const result = await handleGetCategories({ response_format: 'json' });

            expect(result.content).toBeDefined();
            expect(result.content[0].type).toBe('text');

            const jsonData = JSON.parse(result.content[0].text);
            expect(jsonData.categories).toBeDefined();
            expect(typeof jsonData.categories).toBe('object');
        });

        it('should handle empty arguments', async () => {
            const result = await handleGetCategories({});

            expect(result.content).toBeDefined();
            expect(result.content.length).toBeGreaterThan(0);
        });

        it('should include standard categories', async () => {
            const result = await handleGetCategories({ response_format: 'json' });
            const jsonData = JSON.parse(result.content[0].text);

            expect(jsonData.categories).toHaveProperty('Documents');
            expect(jsonData.categories).toHaveProperty('Images');
            expect(jsonData.categories).toHaveProperty('Videos');
            expect(jsonData.categories).toHaveProperty('Code');
        });
    });

    describe('handleSetCustomRules', () => {
        it('should write the accepted rules to the user config', async () => {
            const result = await handleSetCustomRules({
                rules: [
                    {
                        category: 'ProjectFiles',
                        extensions: ['vue', 'svelte'],
                        priority: 10
                    }
                ]
            });

            expect(result.isError).toBeFalsy();
            expect(result.content[0].text).toContain('Applied 1 custom organization rules');

            const expected: CustomRule[] = [
                { category: 'ProjectFiles', extensions: ['vue', 'svelte'], priority: 10 }
            ];
            expect(readPersistedConfig().customRules).toEqual(expected);
        });

        it('should persist snake_case patterns as the internal camelCase shape', async () => {
            await handleSetCustomRules({
                rules: [{ category: 'ConfigFiles', filename_pattern: '.*\\.config\\..*', priority: 8 }]
            });

            const persisted = readPersistedConfig().customRules ?? [];
            expect(persisted).toHaveLength(1);
            const rule = first(persisted);
            expect(rule.filenamePattern).toBe('.*\\.config\\..*');
            expect((rule as unknown as Record<string, unknown>).filename_pattern).toBeUndefined();
        });

        it('should load the persisted rules on the next request', async () => {
            await handleSetCustomRules({
                rules: [{ category: 'Widgets', filename_pattern: '\\.widget$', priority: 100 }]
            });

            // A later request builds its context from the config file, so this
            // is what survives a restart rather than in-memory state.
            const reloaded = loadUserConfig().customRules ?? [];
            expect(reloaded).toHaveLength(1);
            const rule = first(reloaded);
            expect(rule.category).toBe('Widgets');
            expect(rule.filenamePattern).toBe('\\.widget$');
            expect(rule.priority).toBe(100);
        });

        it('should persist every valid rule in a multi-rule call', async () => {
            const result = await handleSetCustomRules({
                rules: [
                    { category: 'WebDev', extensions: ['html', 'css', 'js'], priority: 5 },
                    { category: 'DataFiles', extensions: ['csv', 'json', 'xml'], priority: 3 }
                ]
            });

            expect(result.content[0].text).toContain('2 custom organization rules');
            const persisted = readPersistedConfig().customRules ?? [];
            expect(persisted.map((rule) => rule.category)).toEqual(['WebDev', 'DataFiles']);
        });

        it('should skip invalid rules and persist the rest', async () => {
            const result = await handleSetCustomRules({
                rules: [
                    { category: 'Widgets', filename_pattern: '\\.widget$', priority: 100 },
                    { category: '', filename_pattern: 'invalid', priority: 10 }
                ]
            });

            expect(result.content[0].text).toContain('1 custom organization rules');
            const persisted = readPersistedConfig().customRules ?? [];
            expect(persisted).toHaveLength(1);
            expect(first(persisted).category).toBe('Widgets');
        });

        it('should replace the rules saved by an earlier call', async () => {
            await handleSetCustomRules({
                rules: [{ category: 'Widgets', filename_pattern: '\\.widget$', priority: 100 }]
            });
            await handleSetCustomRules({
                rules: [{ category: 'Gadgets', extensions: ['gadget'], priority: 1 }]
            });

            const persisted = readPersistedConfig().customRules ?? [];
            expect(persisted).toHaveLength(1);
            expect(first(persisted).category).toBe('Gadgets');
        });

        it('should not claim success when the rules cannot be written', async () => {
            const blockedPath = path.join(tempDir, 'blocked.json');
            fs.mkdirSync(blockedPath, { recursive: true });
            activeConfigPath = blockedPath;

            const result = await handleSetCustomRules({
                rules: [{ category: 'Widgets', filename_pattern: '\\.widget$', priority: 100 }]
            });

            // Silent failure here is the bug: the caller would believe the
            // rules are saved and they would vanish on the next session.
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('could not be written');
            expect(fs.readdirSync(tempDir)).toEqual(['blocked.json']);
        });

        it('should not leak the config path in an error reply', async () => {
            const result = await handleSetCustomRules({
                rules: [{ category: 'Bad[', filename_pattern: '((', priority: 1 }]
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).not.toContain(tempDir);
        });

        it('should return error for invalid rules format', async () => {
            const result = await handleSetCustomRules({ rules: 'not-an-array' });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error');
        });

        it('should return error for missing rules', async () => {
            const result = await handleSetCustomRules({});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error');
        });

        it('should validate priority is an integer', async () => {
            const result = await handleSetCustomRules({
                rules: [{ category: 'TestCategory', extensions: ['test'], priority: 3.5 }]
            });

            // Zod should reject non-integer priority
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error');
        });

        it('should validate priority is non-negative', async () => {
            const result = await handleSetCustomRules({
                rules: [{ category: 'TestCategory', extensions: ['test'], priority: -1 }]
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error');
        });

        it('should handle empty rules array', async () => {
            const result = await handleSetCustomRules({ rules: [] });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('No valid Custom Rules');
        });
    });
});