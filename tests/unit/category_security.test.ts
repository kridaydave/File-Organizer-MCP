
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CategorizerService } from '../../src/services/categorizer.service.js';
import { CustomRule } from '../../src/types.js';

describe('Category Security Tests', () => {
    let categorizer: CategorizerService;
    let consoleSpy: any;

    beforeEach(() => {
        categorizer = new CategorizerService();
        consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should reject XSS in category names', () => {
        const xssRules: CustomRule[] = [{
            category: '<script>alert("xss")</script>',
            extensions: ['.js'],
            priority: 100
        }];
        const count = categorizer.setCustomRules(xssRules);
        expect(count).toBe(0);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid rule'));
        expect(categorizer.getCategory('evil.js')).not.toBe('<script>alert("xss")</script>');
    });

    it('should reject Shell Injection characters', () => {
        const shellRules: CustomRule[] = [{
            category: '$(rm -rf /)',
            extensions: ['.sh'],
            priority: 100
        }];
        const count = categorizer.setCustomRules(shellRules);
        expect(count).toBe(0);
    });

    it('should reject Path Traversal/Absolute paths', () => {
        const pathRules: CustomRule[] = [
            { category: '../etc/passwd', extensions: ['.conf'], priority: 100 },
            { category: 'C:\\Windows\\System32', extensions: ['.exe'], priority: 100 }
        ];
        const count = categorizer.setCustomRules(pathRules);
        expect(count).toBe(0);
    });

    it('should reject Windows Reserved Names', () => {
        const reservedRules: CustomRule[] = [{
            category: 'CON',
            extensions: ['txt'],
            priority: 100
        }];
        const count = categorizer.setCustomRules(reservedRules);
        expect(count).toBe(0);
    });
});
