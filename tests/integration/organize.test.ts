
import path from 'path';
import fs from 'fs/promises';
import { first } from '../helpers/safe-index.js';

import { isolateRollbackStorage } from '../helpers/rollback-storage.js';

/**
 * Private rollback storage.
 *
 * `organizer.organize()` builds a `RollbackService` off the default
 * `getRollbackDirectory()`, which under jest is one directory shared by every
 * worker. Manifests written there decide which manifest is globally newest, so
 * this file's batch can become another file's no-id undo target. The redirect
 * is registered before the modules under test are imported, so they are dynamic.
 */
const storage = await isolateRollbackStorage('fom-int-organize-');

const { OrganizerService } = await import('../../src/core/organize/organizer.js');
const { FileScannerService } = await import('../../src/core/scan/scanner.js');

describe('OrganizerService', () => {
  let testDir: string;
  // The classes arrive through a dynamic import, so the binding is a value and
  // not a type name. `InstanceType` reads the instance back off the constructor.
  let organizer: InstanceType<typeof OrganizerService>;
  let scanner: InstanceType<typeof FileScannerService>;

  beforeEach(async () => {
    testDir = path.resolve('./test-organizer-unicode');
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

  it('should organize a file with unicode characters in its name', async () => {
    const unicodeFileName = 'unicode_🚀.txt';
    await fs.writeFile(path.join(testDir, unicodeFileName), 'content');

    const files = await scanner.getAllFiles(testDir);
    const result = await organizer.organize(testDir, files);

    expect(result.actions).toHaveLength(1);
    expect(first(result.actions).file).toBe(unicodeFileName);
    expect(first(result.actions).to).toContain(
      path.join('Documents', unicodeFileName),
    );

    const newPath = path.join(testDir, 'Documents', unicodeFileName);
    const stats = await fs.stat(newPath);
    expect(stats.isFile()).toBe(true);
  });
});
