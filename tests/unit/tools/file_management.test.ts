import { jest } from '@jest/globals';
import {
    handleGetCategories,
    handleSetCustomRules
} from '../../../src/tools/file-management.js';

describe('File Management Tools', () => {
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
            expect(result.content[0].type).toBe('text');
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
        it('should apply custom rules successfully', async () => {
            const customRules = {
                rules: [
                    {
                        category: 'ProjectFiles',
                        extensions: ['vue', 'svelte'],
                        priority: 10
                    }
                ]
            };

            const result = await handleSetCustomRules(customRules);

            expect(result.content).toBeDefined();
            expect(result.content[0].type).toBe('text');
            expect(result.content[0].text).toContain('Applied');
            expect(result.content[0].text).toContain('custom organization rules');
        });

        it('should handle multiple rules', async () => {
            const customRules = {
                rules: [
                    {
                        category: 'WebDev',
                        extensions: ['html', 'css', 'js'],
                        priority: 5
                    },
                    {
                        category: 'DataFiles',
                        extensions: ['csv', 'json', 'xml'],
                        priority: 3
                    }
                ]
            };

            const result = await handleSetCustomRules(customRules);

            expect(result.content[0].text).toContain('2');
        });

        it('should handle rules with filename patterns', async () => {
            const customRules = {
                rules: [
                    {
                        category: 'ConfigFiles',
                        filename_pattern: '.*\\.config\\..*',
                        priority: 8
                    }
                ]
            };

            const result = await handleSetCustomRules(customRules);

            expect(result.content[0].text).toContain('Applied');
        });

        it('should return error for invalid rules format', async () => {
            const invalidRules = {
                rules: 'not-an-array'
            };

            const result = await handleSetCustomRules(invalidRules as any);

            expect(result.content[0].text).toContain('Error');
        });

        it('should return error for missing rules', async () => {
            const result = await handleSetCustomRules({});

            expect(result.content[0].text).toContain('Error');
        });

        it('should handle rules with extensions only', async () => {
            const customRules = {
                rules: [
                    {
                        category: 'CustomCategory',
                        extensions: ['custom1', 'custom2'],
                        priority: 0
                    }
                ]
            };

            const result = await handleSetCustomRules(customRules);

            expect(result.content[0].text).toContain('Applied');
        });

        it('should validate priority is an integer', async () => {
            const customRules = {
                rules: [
                    {
                        category: 'TestCategory',
                        extensions: ['test'],
                        priority: 3.5 // Should fail - not an integer
                    }
                ]
            };

            const result = await handleSetCustomRules(customRules);

            // Zod should reject non-integer priority
            expect(result.content[0].text).toContain('Error');
        });

        it('should validate priority is non-negative', async () => {
            const customRules = {
                rules: [
                    {
                        category: 'TestCategory',
                        extensions: ['test'],
                        priority: -1 // Should fail - negative
                    }
                ]
            };

            const result = await handleSetCustomRules(customRules);

            expect(result.content[0].text).toContain('Error');
        });

        it('should handle empty rules array', async () => {
            const result = await handleSetCustomRules({ rules: [] });

            expect(result.content[0].text).toContain('No valid Custom Rules');
        });
    });
});
