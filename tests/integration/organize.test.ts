
import path from 'path';
import fs from 'fs/promises';
import { OrganizerService } from '../../src/services/organizer.service';
import { FileScannerService } from '../../src/services/file-scanner.service';

describe('OrganizerService', () => {
  let testDir: string;
  let organizer: OrganizerService;
  let scanner: FileScannerService;

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

  it('should organize a file with unicode characters in its name', async () => {
    const unicodeFileName = 'unicode_🚀.txt';
    await fs.writeFile(path.join(testDir, unicodeFileName), 'content');

    const files = await scanner.getAllFiles(testDir);
    const result = await organizer.organize(testDir, files);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].file).toBe(unicodeFileName);
    expect(result.actions[0].to).toContain(path.join('Documents', unicodeFileName));

    const newPath = path.join(testDir, 'Documents', unicodeFileName);
    const stats = await fs.stat(newPath);
    expect(stats.isFile()).toBe(true);
  });
});
