
import { describe, it, expect, beforeEach } from '@jest/globals';
import { CategorizerService } from '../../../src/services/categorizer.service.js';
import { CustomRule } from '../../../src/types.js';

describe('Custom Rules Functionality', () => {
    let categorizer: CategorizerService;

    beforeEach(() => {
        categorizer = new CategorizerService();
    });

    it('should prioritize higher priority rules', () => {
        const rules: CustomRule[] = [
            { category: 'LowPriority', extensions: ['.txt'], priority: 10 },
            { category: 'HighPriority', extensions: ['.txt'], priority: 20 }
        ];

        categorizer.setCustomRules(rules);

        const cat = categorizer.getCategory('file.txt');
        expect(cat).toBe('HighPriority');
    });

    it('should match regex patterns', () => {
        const rules: CustomRule[] = [
            { category: 'LogFiles', filenamePattern: '^log_.*\\.txt$', priority: 10 }
        ];

        categorizer.setCustomRules(rules);

        expect(categorizer.getCategory('log_2023.txt')).toBe('LogFiles');
        expect(categorizer.getCategory('other.txt')).not.toBe('LogFiles');
    });

    it('should fall back to extension if regex mismatch', () => {
        const rules: CustomRule[] = [
            { category: 'Images', extensions: ['.png'], priority: 10 }
        ];
        categorizer.setCustomRules(rules);
        expect(categorizer.getCategory('image.png')).toBe('Images');
    });
});
