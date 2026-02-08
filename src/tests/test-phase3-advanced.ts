import path from 'path';
import fs from 'fs/promises';
import { handlePreviewOrganization } from '../tools/organization-preview.js';
import { handleUndoLastOperation } from '../tools/rollback.js';
import { OrganizerService } from '../services/organizer.service.js';
import { globalCategorizerService } from '../services/index.js';
import { FileScannerService } from '../services/file-scanner.service.js';

const testDir = path.resolve('./test-phase3-advanced-env');

async function createTestFiles(files: Record<string, string>, times: Record<string, Date> = {}) {
  await fs.mkdir(testDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(testDir, name);
    await fs.writeFile(filePath, content);
    if (times[name]) {
      await fs.utimes(filePath, times[name], times[name]);
    }
  }
}

async function runTests() {
  console.log(`Setting up advanced test environment in ${testDir}...`);
  const organizer = new OrganizerService();
  const scanner = new FileScannerService();

  try {
    // Cleanup old test dir
    await fs.rm(testDir, { recursive: true, force: true });

    // --- Test 1: Rollback ---
    console.log('\n--- Test 1: Rollback ---');
    await createTestFiles({
      'undo_me.txt': 'move me',
      'undo_me_2.log': 'move me too',
    });

    const files1 = await scanner.getAllFiles(testDir);
    // Organize
    await organizer.organize(testDir, files1, { dryRun: false });

    // Check if moved
    try {
      await fs.stat(path.join(testDir, 'Documents/undo_me.txt'));
      console.log('Moved successfully.');
    } catch {
      console.error('❌ Failed to move files.');
    }

    // Undo
    console.log('Undoing...');
    const undoRes = await handleUndoLastOperation({});
    console.log((undoRes.content[0] as any).text);

    // Verify restoration
    try {
      await fs.stat(path.join(testDir, 'undo_me.txt'));
      console.log('✅ Rollback successful: undo_me.txt restored.');
    } catch {
      console.error('❌ Rollback failed: undo_me.txt missing.');
    }

    // --- Test 2: Conflict - Overwrite ---
    console.log('\n--- Test 2: Conflict - Overwrite ---');
    // Setup: 'Documents/conflict.txt' (old content) and 'conflict.txt' (new content)
    await fs.mkdir(path.join(testDir, 'Documents'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'Documents/conflict.txt'), 'OLD CONTENT');
    await fs.writeFile(path.join(testDir, 'conflict.txt'), 'NEW CONTENT');

    const files2 = await scanner.getAllFiles(testDir);
    // Organize with overwrite
    await organizer.organize(
      testDir,
      files2.filter((f) => f.name === 'conflict.txt'),
      {
        dryRun: false,
        conflictStrategy: 'overwrite',
      }
    );

    const content = await fs.readFile(path.join(testDir, 'Documents/conflict.txt'), 'utf-8');
    if (content === 'NEW CONTENT') {
      console.log('✅ Overwrite strategy successful.');
    } else {
      console.log('❌ Overwrite failed. Content:', content);
    }
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    // Cleanup
    // await fs.rm(testDir, { recursive: true, force: true });
  }
}

runTests();
