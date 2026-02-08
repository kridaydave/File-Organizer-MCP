import path from 'path';
import fs from 'fs/promises';
import { OrganizerService } from '../services/organizer.service.js';
import { FileWithSize } from '../types.js';

const testDir = path.resolve('./test-organizer-conflict');

async function runTests() {
  console.log(`Setting up conflict test environment in ${testDir}...`);
  const service = new OrganizerService();

  try {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });

    // Setup: We need a category folder. Let's assume files go to "Others" or "Documents".
    // Let's create a file that goes to "Others" (unknown ext) or just force it via mock?
    // Real categorizer uses rules. .txt -> Documents usually.

    const docDir = path.join(testDir, 'Documents');
    await fs.mkdir(docDir, { recursive: true });

    // Scenario:
    // 1. Documents/file.txt EXISTS
    // 2. Documents/file_1.txt EXISTS
    // 3. We organize a NEW "file.txt".
    // Expected: Documents/file_2.txt
    // Buggy behavior: Documents/file.txt_1.txt or Documents/file_1_1.txt

    await fs.writeFile(path.join(docDir, 'file.txt'), 'original');
    await fs.writeFile(path.join(docDir, 'file_1.txt'), 'conflict 1');

    // Input file
    const sourceFile = path.join(testDir, 'file.txt');
    await fs.writeFile(sourceFile, 'new content');

    const files: FileWithSize[] = [
      {
        name: 'file.txt',
        path: sourceFile,
        size: 100,
        modified: new Date(),
      },
    ];

    console.log('Running organize...');
    const result = await service.organize(testDir, files);

    console.log('Result:', result);

    // Verify result
    const expectedPath = path.join(docDir, 'file_2.txt');
    try {
      await fs.stat(expectedPath);
      console.log('✅ Success: file_2.txt created.');
    } catch {
      console.error('❌ Failed: file_2.txt NOT found.');
      // debugging what WAS created
      const created = await fs.readdir(docDir);
      console.log('Files in Documents:', created);
    }

    // Verify NO recursive weirdness
    const weird1 = path.join(docDir, 'file_1_1.txt');
    const weird2 = path.join(docDir, 'file.txt_1.txt');

    try {
      await fs.stat(weird1);
      console.error('❌ Failed: Found file_1_1.txt');
    } catch {}
    try {
      await fs.stat(weird2);
      console.error('❌ Failed: Found file.txt_1.txt');
    } catch {}
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

runTests();
