
import path from 'path';
import fs from 'fs/promises';
import { OrganizerService } from '../../src/services/organizer.service.js';
import { FileScannerService } from '../../src/services/file-scanner.service.js';

describe('OrganizerService Edge Cases', () => {
  let testDir: string;
  let organizer: OrganizerService;
  let scanner: FileScannerService;

  beforeEach(async () => {
    testDir = path.resolve('./test-edge-cases');
    organizer = new OrganizerService();
    scanner = new FileScannerService();
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should handle files with reserved Windows names', async () => {
    // These names are problematic on Windows. The test will likely only run on non-Windows,
    // but the service should handle them gracefully.
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
    for (const name of reservedNames) {
      // We can't create these files on Windows, so we'll just check that the organizer doesn't crash.
      // On other platforms, we can create them.
      try {
        await fs.writeFile(path.join(testDir, name), 'content');
      } catch (e) {
        // Ignore errors, as we can't create these on Windows.
      }
    }

    const files = await scanner.getAllFiles(testDir);
    const result = await organizer.organize(testDir, files);

    if (process.platform === 'win32') {
      // On Windows, these files should fail to create, so actions should be empty
      expect(result.actions).toHaveLength(0);
    } else {
      // On Linux/Mac, they exist, so they should be organized
      expect(result.actions.length).toBeGreaterThan(0);
    }
  });

  it('should handle files with very long names', async () => {
    const longName = 'a'.repeat(150) + '.txt';
    await fs.writeFile(path.join(testDir, longName), 'content');

    const files = await scanner.getAllFiles(testDir);
    const result = await organizer.organize(testDir, files);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.file).toBe(longName);
    expect(result.actions[0]!.to).toContain(path.join('Documents', longName));
  });

  it('should handle empty files', async () => {
    await fs.writeFile(path.join(testDir, 'empty.txt'), '');

    const files = await scanner.getAllFiles(testDir);
    const result = await organizer.organize(testDir, files);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.file).toBe('empty.txt');
    expect(result.actions[0]!.to).toContain(path.join('Documents', 'empty.txt'));
  });

  it('should handle files with no extension', async () => {
    await fs.writeFile(path.join(testDir, 'file-no-ext'), 'content');

    const files = await scanner.getAllFiles(testDir);
    const result = await organizer.organize(testDir, files);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.file).toBe('file-no-ext');
    expect(result.actions[0]!.to).toContain(path.join('Others', 'file-no-ext'));
  });

  it('should skip hidden files', async () => {
    await fs.writeFile(path.join(testDir, '.hiddenfile'), 'content');

    const files = await scanner.getAllFiles(testDir);
    const result = await organizer.organize(testDir, files);

    expect(result.actions).toHaveLength(0);
  });

  it('should handle read-only files', async () => {
    const readonlyFile = path.join(testDir, 'readonly.txt');
    await fs.writeFile(readonlyFile, 'content');
    await fs.chmod(readonlyFile, 0o444);

    const files = await scanner.getAllFiles(testDir);
    const result = await organizer.organize(testDir, files);

    // The organizer should still be able to move the file, as it's the directory permissions that matter.
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.file).toBe('readonly.txt');
    expect(result.actions[0]!.to).toContain(path.join('Documents', 'readonly.txt'));
  });
});
