import path from 'path';
import fs from 'fs/promises';
import { RollbackService } from '../services/rollback.service.js';
import { RollbackAction } from '../types.js';

const testDir = path.resolve('./test-rollback-fix-env');
const backupDir = path.resolve('./test-rollback-backups');

async function runTests() {
  console.log(`Setting up rollback fix test environment in ${testDir}...`);
  const service = new RollbackService();

  try {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(backupDir, { recursive: true, force: true });

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(backupDir, { recursive: true });

    // --- Test 1: Undo Copy ---
    console.log('\n--- Test 1: Undo Copy ---');
    const copiedFile = path.join(testDir, 'copy.txt');
    await fs.writeFile(copiedFile, 'content');

    const copyActions: RollbackAction[] = [
      {
        type: 'copy',
        originalPath: '/original/source',
        currentPath: copiedFile,
        timestamp: Date.now(),
      },
    ];

    const copyManifestId = await service.createManifest('Test Copy Undo', copyActions);
    console.log(`Created copy manifest ${copyManifestId}`);

    const copyRes = await service.rollback(copyManifestId);
    console.log('Copy Rollback result:', copyRes);

    try {
      await fs.stat(copiedFile);
      console.error('❌ Failed: Copied file still exists.');
    } catch {
      console.log('✅ Success: Copied file deleted.');
    }

    // --- Test 2: Undo Delete (Data Loss Fix) ---
    console.log('\n--- Test 2: Undo Delete (Data Loss Fix) ---');
    const fileToDeleteParams = path.join(testDir, 'deleted.txt');
    // Simulate that the file WAS at 'fileToDeleteParams' but is now in backup
    const backupFile = path.join(backupDir, 'deleted.txt.bak');
    await fs.writeFile(backupFile, 'important content');

    const deleteActions: RollbackAction[] = [
      {
        type: 'delete',
        originalPath: fileToDeleteParams,
        backupPath: backupFile,
        timestamp: Date.now(),
      },
    ];

    const deleteManifestId = await service.createManifest('Test Delete Undo', deleteActions);
    console.log(`Created delete manifest ${deleteManifestId}`);

    const deleteRes = await service.rollback(deleteManifestId);
    console.log('Delete Rollback result:', deleteRes);

    try {
      await fs.stat(fileToDeleteParams);
      const content = await fs.readFile(fileToDeleteParams, 'utf-8');
      if (content === 'important content') {
        console.log('✅ Success: Deleted file restored correctly.');
      } else {
        console.error('❌ Failed: Content mismatch.');
      }
    } catch {
      console.error('❌ Failed: Deleted file NOT restored.');
    }

    // --- Test 3: Manifest Deletion ---
    console.log('\n--- Test 3: Manifest Deletion ---');
    const manifests = await service.listManifests();
    const found = manifests.find((m) => m.id === copyManifestId || m.id === deleteManifestId);

    if (found) {
      console.error('❌ Failed: Manifest still exists in list.');
    } else {
      console.log('✅ Success: Manifests removed from list.');
    }
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(backupDir, { recursive: true, force: true });
  }
}

runTests();
