import path from 'path';
import fs from 'fs/promises';
import { RenamingService } from '../../../src/services/renaming.service.js';
import { RenameRule } from '../../../src/schemas/rename.schemas.js';
import { RollbackService } from '../../../src/services/rollback.service.js';
import os from 'os';

describe('RenamingService Integration', () => {
  let service: RenamingService;
  let testDir: string;
  let rollbackService: RollbackService;

  const createTestFile = async (name: string, content: string = 'test') => {
    await fs.writeFile(path.join(testDir, name), content);
  };

  beforeEach(async () => {
    // Create a separate temp dir in CWD to ensure PathValidator allows it (since CWD is in Desktop)
    const sandboxRoot = path.join(process.cwd(), 'tests', 'sandbox');
    await fs.mkdir(sandboxRoot, { recursive: true });
    testDir = await fs.mkdtemp(path.join(sandboxRoot, 'test-'));

    rollbackService = new RollbackService();
    service = new RenamingService(rollbackService);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  it('should rename files on disk using find/replace', async () => {
    await createTestFile('test-v1.txt');
    await createTestFile('test-v2.txt');

    const files = [path.join(testDir, 'test-v1.txt'), path.join(testDir, 'test-v2.txt')];
    const rules: RenameRule[] = [
      {
        type: 'find_replace',
        find: 'v',
        replace: 'version',
        use_regex: false,
        global: true,
        case_sensitive: false,
      },
    ];

    // 1. Preview
    const preview = await service.applyRenameRules(files, rules);
    expect(preview).toHaveLength(2);
    expect(preview[0].new).toContain('test-version1.txt');
    expect(preview[0].willChange).toBe(true);

    // 2. Execute
    const result = await service.executeRename(preview);
    expect(result.statistics.renamed).toBe(2);
    expect(result.statistics.failed).toBe(0);

    // 3. Verify on disk
    const filesOnDisk = await fs.readdir(testDir);
    expect(filesOnDisk).toContain('test-version1.txt');
    expect(filesOnDisk).toContain('test-version2.txt');
    expect(filesOnDisk).not.toContain('test-v1.txt');
  });

  it('should handle complex chaining of rules', async () => {
    // "Draft - My Document 2023.txt"
    // 1. Remove "Draft - " (trim/find replace?) Let's use FindReplace
    // 2. Replace spaces with underscores
    // 3. Lowercase
    // -> "my_document_2023.txt"

    const fname = 'Draft - My Document 2023.txt';
    await createTestFile(fname);

    const files = [path.join(testDir, fname)];
    const rules: RenameRule[] = [
      {
        type: 'find_replace',
        find: 'Draft - ',
        replace: '',
        global: false,
        use_regex: false,
        case_sensitive: true,
      },
      {
        type: 'find_replace',
        find: ' ',
        replace: '_',
        global: true,
        use_regex: false,
        case_sensitive: false,
      },
      { type: 'case', conversion: 'lowercase' },
    ];

    const preview = await service.applyRenameRules(files, rules);
    const result = await service.executeRename(preview);

    expect(result.statistics.renamed).toBe(1);
    const filesOnDisk = await fs.readdir(testDir);
    expect(filesOnDisk).toContain('my_document_2023.txt');
  });

  it('should fail gracefully on disk conflict', async () => {
    await createTestFile('a.txt');
    await createTestFile('b.txt');

    // Trying to rename a.txt -> b.txt
    const files = [path.join(testDir, 'a.txt')];
    const rules: RenameRule[] = [
      {
        type: 'find_replace',
        find: 'a',
        replace: 'b',
        global: false,
        use_regex: false,
        case_sensitive: false,
      },
    ];

    const preview = await service.applyRenameRules(files, rules);
    // Preview MUST show conflict because b.txt exists
    expect(preview[0].conflict).toBe(true);

    // Try executing anyway (should skip)
    const result = await service.executeRename(preview);
    expect(result.statistics.renamed).toBe(0);
    expect(result.statistics.failed).toBe(1); // It failed/skipped
    expect(result.errors.length).toBeGreaterThan(0);

    // Files should be unchanged
    const filesOnDisk = await fs.readdir(testDir);
    expect(filesOnDisk).toContain('a.txt');
    expect(filesOnDisk).toContain('b.txt');
  });

  it('should support rollback', async () => {
    await createTestFile('original.txt');

    const files = [path.join(testDir, 'original.txt')];
    const rules: RenameRule[] = [
      {
        type: 'add_text',
        text: '_renamed',
        position: 'end',
      },
    ];

    const preview = await service.applyRenameRules(files, rules);
    const result = await service.executeRename(preview);
    expect(result.statistics.renamed).toBe(1);

    // Verify rename happened
    await expect(fs.access(path.join(testDir, 'original_renamed.txt'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(testDir, 'original.txt'))).rejects.toThrow();

    // Find manifest
    const manifests = await rollbackService.listManifests();
    expect(manifests.length).toBeGreaterThan(0);
    const latestId = manifests[0].id;

    // Rollback
    const rollbackResult = await rollbackService.rollback(latestId);
    expect(rollbackResult.success).toBe(1);

    // Verify restored
    await expect(fs.access(path.join(testDir, 'original.txt'))).resolves.toBeUndefined();
    // The renamed file should be gone (renamed back)
    await expect(fs.access(path.join(testDir, 'original_renamed.txt'))).rejects.toThrow();
  }, 20000); // 20s timeout for CI stability
});
