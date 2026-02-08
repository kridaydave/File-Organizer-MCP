import path from 'path';
import fs from 'fs/promises';
import { handlePreviewOrganization } from '../tools/organization-preview.js';
import { OrganizerService } from '../services/organizer.service.js';
import { FileScannerService } from '../services/file-scanner.service.js';

const testDir = path.resolve('./test-dryrun-env');

async function runTests() {
  console.log(`Setting up dry-run test environment in ${testDir}...`);
  const organizer = new OrganizerService();
  const scanner = new FileScannerService();

  try {
    // Cleanup old test dir
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });

    // Setup Conflict:
    // doc.txt -> Documents/doc.txt
    // But Documents/doc.txt ALREADY exists
    await fs.mkdir(path.join(testDir, 'Documents'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'Documents/doc.txt'), 'EXISTING');
    await fs.writeFile(path.join(testDir, 'doc.txt'), 'MOVING');

    const files = await scanner.getAllFiles(testDir);
    const movingFiles = files.filter((f) => f.name === 'doc.txt');

    console.log('\n--- Test: Dry Run Conflict Preview ---');
    // Dry Run
    const result = await organizer.organize(testDir, movingFiles, {
      dryRun: true,
      conflictStrategy: 'rename', // default
    });

    console.log('Dry Run Actions:', result.actions);

    const action = result.actions.find((a) => a.file === 'doc.txt');
    if (action) {
      console.log(`Action To: ${action.to}`);
      // We expect "doc_1.txt" or similar
      if (action.to.match(/doc_\d+\.txt$/)) {
        console.log('✅ Dry Run previewed RENAME correctly.');
      } else if (action.to.endsWith('doc.txt')) {
        console.log('❌ Dry Run Preview FAILED: Showed conflict path.');
      } else {
        console.log('❓ Unexpected path:', action.to);
      }
    } else {
      console.log('❌ No action found for doc.txt');
    }
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    // Cleanup
    // await fs.rm(testDir, { recursive: true, force: true });
  }
}

runTests();
