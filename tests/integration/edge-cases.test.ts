
import path from 'path';
import fs from 'fs/promises';

import { isolateRollbackStorage } from '../helpers/rollback-storage.js';

/**
 * Private rollback storage.
 *
 * Every organize here moves real files and therefore writes a manifest through
 * the default `getRollbackDirectory()`, which under jest is one directory shared
 * by every worker. Those manifests decide which manifest is globally newest, so
 * a no-id undo in another file can restore this file's batch. The redirect is
 * registered before the modules under test are imported, so they are dynamic.
 */
const storage = await isolateRollbackStorage('fom-edge-cases-');

const { OrganizerService } = await import('../../src/core/organize/organizer.js');
const { FileScannerService } = await import('../../src/core/scan/scanner.js');

describe('OrganizerService Edge Cases', () => {
  let testDir: string;
  // The classes arrive through a dynamic import, so the binding is a value and
  // not a type name. `InstanceType` reads the instance back off the constructor.
  let organizer: InstanceType<typeof OrganizerService>;
  let scanner: InstanceType<typeof FileScannerService>;

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

  afterAll(async () => {
    await storage.remove();
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

    // We now skip reserved names on ALL platforms for consistency and safety.
    expect(result.actions).toHaveLength(0);
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
