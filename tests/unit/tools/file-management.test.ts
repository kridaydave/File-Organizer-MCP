
import { jest } from '@jest/globals';
import { handleGetCategories, handleSetCustomRules } from '../../../src/tools/file-management.js';
import { globalCategorizerService } from '../../../src/services/index.js';


describe('File Management Tools', () => {
    describe('handleGetCategories', () => {
        it('should return markdown list of categories by default', async () => {
            const result = await handleGetCategories({});
            expect(result.content[0].text).toContain('Available Categories');
            expect(result.content[0].text).toContain('Images');
            expect(result.content[0].text).toContain('Documents');
        });

        it('should return JSON when requested', async () => {
            const result = await handleGetCategories({ response_format: 'json' });
            if (!result.structuredContent) throw new Error('Expected structuredContent');

            const categories = (result.structuredContent as any).categories;
            expect(categories).toBeDefined();
            expect(categories.Images).toBeDefined();
        });
    });

    describe('handleSetCustomRules', () => {
        let setCustomRulesSpy: any;

        beforeEach(() => {
            // Spy on the real service instance
            setCustomRulesSpy = jest.spyOn(globalCategorizerService, 'setCustomRules');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should set custom rules successfully', async () => {
            setCustomRulesSpy.mockReturnValue(1);

            const rules = [
                { category: 'Images', extensions: ['jpg'], priority: 10 }
            ];

            const result = await handleSetCustomRules({ rules });

            expect(globalCategorizerService.setCustomRules).toHaveBeenCalledWith(rules);
            expect(result.content[0].text).toContain('Applied 1 custom organization rules');
        });

        it('should handle zero rules applied', async () => {
            setCustomRulesSpy.mockReturnValue(0);

            const result = await handleSetCustomRules({ rules: [{ category: 'Images' }] });

            expect(result.content[0].text).toContain('No valid Custom Rules were applied');
        });

        it('should validation error for invalid input', async () => {
            const result = await handleSetCustomRules({ rules: 'invalid' });
            expect(result.content[0].text).toContain('Error');
        });
    });
});
