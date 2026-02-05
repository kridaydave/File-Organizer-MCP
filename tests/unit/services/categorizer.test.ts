import { jest } from '@jest/globals';
import { CategorizerService } from '../../../src/services/categorizer.service.js';
import { CATEGORIES } from '../../../src/constants.js';

describe('CategorizerService', () => {
    let categorizer: CategorizerService;

    beforeEach(() => {
        categorizer = new CategorizerService();
    });

    describe('getCategory', () => {
        it('should correctly categorize common extensions', () => {
            expect(categorizer.getCategory('image.jpg')).toBe('Images');
            expect(categorizer.getCategory('image.png')).toBe('Images');
            expect(categorizer.getCategory('doc.pdf')).toBe('Documents');
            expect(categorizer.getCategory('data.json')).toBe('Code');
            expect(categorizer.getCategory('main.ts')).toBe('Code');
            expect(categorizer.getCategory('unknown.xyz')).toBe('Others');
        });

        it('should handle uppercase extensions', () => {
            expect(categorizer.getCategory('PHOTO.JPG')).toBe('Images');
            expect(categorizer.getCategory('README.MD')).toBe('Documents');
        });

        it('should categorize based on patterns', () => {
            expect(categorizer.getCategory('my_test.ts')).toBe('Tests');
            expect(categorizer.getCategory('app.spec.js')).toBe('Tests');
            expect(categorizer.getCategory('debug.log')).toBe('Logs');
            expect(categorizer.getCategory('server.log')).toBe('Logs');
            expect(categorizer.getCategory('deploy_script.sh')).toBe('Scripts');
            expect(categorizer.getCategory('demo_app.py')).toBe('Demos');
        });

        it('should respect custom rules', () => {
            categorizer.setCustomRules([
                {
                    extensions: ['.xyz'],
                    category: 'Secret',
                    priority: 10
                },
                {
                    filenamePattern: '^secret_.*',
                    category: 'TopSecret',
                    priority: 20
                }
            ]);

            expect(categorizer.getCategory('file.xyz')).toBe('Secret');
            // Higher priority regex match
            expect(categorizer.getCategory('secret_file.txt')).toBe('TopSecret');
        });
    });

    describe('categorizeFiles', () => {
        it('should group files and calculate stats', () => {
            const files = [
                { name: 'a.jpg', path: '/a.jpg', size: 1000, modified: new Date() },
                { name: 'b.png', path: '/b.png', size: 2000, modified: new Date() },
                { name: 'notes.txt', path: '/notes.txt', size: 500, modified: new Date() }
            ];

            const result = categorizer.categorizeFiles(files);

            expect(result['Images']).toBeDefined();
            expect(result['Images']?.count).toBe(2);
            expect(result['Images']?.total_size).toBe(3000);

            expect(result['Documents']).toBeDefined();
            expect(result['Documents']?.count).toBe(1);
        });

        it('should omit empty categories', () => {
            const files = [
                { name: 'a.jpg', path: '/a.jpg', size: 1000, modified: new Date() }
            ];
            const result = categorizer.categorizeFiles(files);
            expect(result['Audio']).toBeUndefined();
        });
    });
});
