import path from 'path';
import fs from 'fs/promises';
import { OrganizerService } from '../services/organizer.service.js';
import { RollbackService } from '../services/rollback.service.js';
import { FileWithSize } from '../types.js';

const testDir = path.resolve('./test-overwrite-bug');

async function runTests() {
    console.log(`Setting up overwrite bug test environment in ${testDir}...`);
    const service = new OrganizerService();
    const rollbackService = new RollbackService();

    try {
        await fs.rm(testDir, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });

        const docDir = path.join(testDir, 'Documents');
        await fs.mkdir(docDir, { recursive: true });

        // 1. Create a "Pre-existing" file at destination
        const destFile = path.join(docDir, 'overwritten.txt');
        await fs.writeFile(destFile, 'IMPORTANT ORIGINAL CONTENT');

        // 2. Create the "Source" file to move
        const sourceFile = path.join(testDir, 'overwritten.txt');
        await fs.writeFile(sourceFile, 'New Content');

        const files: FileWithSize[] = [{
            name: 'overwritten.txt',
            path: sourceFile,
            size: 100,
            modified: new Date()
        }];

        console.log('Running organize with overwrite (simulate strategy)...');
        // We force "overwrite" strategy
        const result = await service.organize(testDir, files, { conflictStrategy: 'overwrite' });

        console.log('Organize Result:', result.actions.length, 'actions');

        // Verify "New Content" is there
        const currentContent = await fs.readFile(destFile, 'utf-8');
        if (currentContent === 'New Content') {
            console.log('✅ File was overwritten as expected.');
        } else {
            console.error('❌ File was NOT overwritten (unexpected).');
        }

        // 3. Attempt Rollback
        // We need the manifest ID.
        // The service doesn't return ID directly in organize result, but we can list manifests.
        const manifests = await rollbackService.listManifests();
        const latest = manifests[0];

        if (!latest) {
            throw new Error("No manifest created!");
        }

        console.log(`Rolling back manifest ${latest.id}...`);

        await rollbackService.rollback(latest.id);

        // 4. Verify Restoration
        // Expected: 'IMPORTANT ORIGINAL CONTENT' should be back at destFile
        // Actual Bug: It's gone forever.
        try {
            const restoredContent = await fs.readFile(destFile, 'utf-8');
            if (restoredContent === 'IMPORTANT ORIGINAL CONTENT') {
                console.log('✅ Success: Original content restored!');
            } else {
                console.error(`❌ Failed: Content is "${restoredContent}" (Expected "IMPORTANT ORIGINAL CONTENT")`);
            }
        } catch (e) {
            console.error('❌ Failed: File missing after rollback:', e);
        }

    } catch (error) {
        console.error('Test Failed:', error);
    } finally {
        await fs.rm(testDir, { recursive: true, force: true });
    }
}

runTests();
