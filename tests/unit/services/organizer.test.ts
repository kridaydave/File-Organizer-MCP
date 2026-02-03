
import fs from 'fs/promises';

import path from 'path';
import os from 'os';
import { OrganizerService } from '../../../src/services/organizer.service.js';
import { CategorizerService } from '../../../src/services/categorizer.service.js';
import { FileWithSize } from '../../../src/types.js';

describe('OrganizerService', () => {
    let organizer: OrganizerService;
    let testDir: string;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-organizer-'));
        organizer = new OrganizerService(new CategorizerService());
    });

    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    describe('generateOrganizationPlan', () => {
        it('should plan moves correctly based on categories', async () => {
            const files: FileWithSize[] = [
                { name: 'pic.jpg', path: path.join(testDir, 'pic.jpg'), size: 100, modified: new Date() },
                { name: 'doc.pdf', path: path.join(testDir, 'doc.pdf'), size: 200, modified: new Date() }
            ];

            const plan = await organizer.generateOrganizationPlan(testDir, files);

            expect(plan.moves.length).toBe(2);

            const jpgMove = plan.moves.find(m => m.source.endsWith('pic.jpg'));
            expect(jpgMove?.destination).toContain('Images');
            expect(jpgMove?.category).toBe('Images');

            const pdfMove = plan.moves.find(m => m.source.endsWith('doc.pdf'));
            expect(pdfMove?.destination).toContain('Documents');
        });

        it('should handle conflict strategy: rename', async () => {
            // Mock file existence for conflict
            // Since we can't easily mock fileExists in integration-ish test,
            // we will create the file on disk.

            const imagesDir = path.join(testDir, 'Images');
            await fs.mkdir(imagesDir, { recursive: true });

            await fs.writeFile(path.join(imagesDir, 'pic.jpg'), 'existing');

            const files: FileWithSize[] = [
                { name: 'pic.jpg', path: path.join(testDir, 'pic.jpg'), size: 100, modified: new Date() }
            ];

            // Strategy is 'rename' by default
            const plan = await organizer.generateOrganizationPlan(testDir, files, 'rename');

            const move = plan.moves[0];
            if (!move) throw new Error('Expected a move');

            expect(move.hasConflict).toBe(true);
            expect(move.conflictResolution).toBe('rename');
            expect(move.destination).toMatch(/pic_1\.jpg$/);
        });

        it('should handle conflict strategy: skip', async () => {
            const imagesDir = path.join(testDir, 'Images');
            await fs.mkdir(imagesDir, { recursive: true });
            await fs.writeFile(path.join(imagesDir, 'pic.jpg'), 'existing');

            const files: FileWithSize[] = [
                { name: 'pic.jpg', path: path.join(testDir, 'pic.jpg'), size: 100, modified: new Date() }
            ];

            const plan = await organizer.generateOrganizationPlan(testDir, files, 'skip');

            const move = plan.moves[0];
            if (!move) throw new Error('Expected a move');

            expect(move.hasConflict).toBe(true);
            expect(move.conflictResolution).toBe('skip');
        });
    });
});
