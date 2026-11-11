import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { handleOrganizeFiles } from '../../src/tools/file-organization.js';
import { handleUndoLastOperation } from '../../src/tools/rollback.js';

describe('Undo JSON includes manifest id', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'undo-json-'));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('returns manifest id in json and matches markdown', async () => {
    await fs.writeFile(path.join(testDir, 'note.txt'), 'hello');

    const orgResult = await handleOrganizeFiles({ directory: testDir, dry_run: false });
    expect(orgResult.content[0].text).toBeDefined();

    const undoJson = await handleUndoLastOperation({ response_format: 'json' });
    expect(undoJson.content[0].text).toBeDefined();
    const parsed = JSON.parse(undoJson.content[0].text);
    expect(parsed).toHaveProperty('manifest_id');
    expect(typeof parsed.manifest_id).toBe('string');
    expect(parsed.manifest_id.length).toBeGreaterThan(0);
    expect(parsed).toHaveProperty('success');
    expect(parsed).toHaveProperty('failed');
    expect(parsed).toHaveProperty('errors');

    const undoMd = await handleUndoLastOperation({ response_format: 'markdown' });
    expect(undoMd.content[0].text).toContain(parsed.manifest_id);
    expect(undoMd.content[0].text).toContain('Manifest ID');
  });
});
