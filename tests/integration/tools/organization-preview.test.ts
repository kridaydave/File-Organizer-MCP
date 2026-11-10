import fs from 'fs/promises';
import path from 'path';
import { handleOrganizeFiles } from '../../../src/tools/file-organization.js';
import { handlePreviewOrganization } from '../../../src/tools/organization-preview.js';

describe('file_organizer_preview_organization collision handling', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), `test-preview-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    for (const file of ['photo.jpg', 'document.pdf', 'notes.txt']) {
      await fs.writeFile(path.join(testDir, file), 'dummy content');
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  it('shows renamed destination when file already exists at destination', async () => {
    await handleOrganizeFiles({
      directory: testDir,
      dry_run: false,
      response_format: 'json',
    });

    await fs.writeFile(path.join(testDir, 'photo.jpg'), 'new content');

    const result = await handlePreviewOrganization({
      directory: testDir,
      response_format: 'json',
    });

    const output = result.structuredContent as any;
    expect(output).toBeDefined();
    const move = output.moves.find((m: any) =>
      String(m.source).endsWith('photo.jpg'),
    );
    expect(move).toBeDefined();
    expect(String(move.destination)).toContain('photo_1.jpg');
  });
});