import fs from 'fs/promises';
import path from 'path';
import { handleOrganizeFiles } from '../../src/tools/file-organization.js';
import { handleUndoLastOperation } from '../../src/tools/rollback.js';
import { RollbackService } from '../../src/core/organize/rollback.js';

describe('Undo JSON includes manifest id', () => {
  let testDir: string;

  beforeEach(async () => {
    const sandboxRoot = path.join(process.cwd(), 'tests', 'sandbox');
    await fs.mkdir(sandboxRoot, { recursive: true });
    testDir = await fs.mkdtemp(path.join(sandboxRoot, 'undo-json-'));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // A successful undo deletes its manifest, so each format gets its own
  // organize + undo pair. The manifest is looked up by description instead
  // of "newest", which parallel test files would race on.
  async function organizeAndFindManifest(): Promise<string> {
    await fs.writeFile(path.join(testDir, 'note.txt'), 'hello');
    const orgResult = await handleOrganizeFiles({
      directory: testDir,
      dry_run: false,
    });
    expect(orgResult.isError).toBeFalsy();

    const manifests = await new RollbackService().listManifests();
    const ours = manifests.find((m) => m.description.includes(testDir));
    expect(ours).toBeDefined();
    return ours!.id;
  }

  it('returns manifest id in json and matches markdown', async () => {
    const jsonManifestId = await organizeAndFindManifest();
    const undoJson = await handleUndoLastOperation({
      manifest_id: jsonManifestId,
      response_format: 'json',
    });
    expect(undoJson.content[0].text).toBeDefined();
    const parsed = JSON.parse(undoJson.content[0].text);
    expect(parsed).toHaveProperty('manifest_id');
    expect(parsed.manifest_id).toBe(jsonManifestId);
    expect(typeof parsed.manifest_id).toBe('string');
    expect(parsed.manifest_id.length).toBeGreaterThan(0);
    expect(parsed).toHaveProperty('success');
    expect(parsed).toHaveProperty('failed');
    expect(parsed).toHaveProperty('errors');

    const mdManifestId = await organizeAndFindManifest();
    const undoMd = await handleUndoLastOperation({
      manifest_id: mdManifestId,
      response_format: 'markdown',
    });
    expect(undoMd.content[0].text).toContain(mdManifestId);
    expect(undoMd.content[0].text).toContain('Manifest ID');
  });
});
