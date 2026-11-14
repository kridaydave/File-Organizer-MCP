import fs from 'fs/promises';
import path from 'path';
import { handlePreviewOrganization } from '../../src/tools/organization-preview.js';
import { handleOrganizeFiles } from '../../src/tools/file-organization.js';
import { jest } from '@jest/globals';

describe('Integration: Preview and organize agree with content analysis', () => {
  let testDir: string;
  let baseTempDir: string;

  beforeEach(async () => {
    baseTempDir = path.join(process.cwd(), 'tests', 'temp');
    await fs.mkdir(baseTempDir, { recursive: true });
    testDir = await fs.mkdtemp(path.join(baseTempDir, 'int-content-'));
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await new Promise((resolve) => setImmediate(resolve));

    let retries = 5;
    while (retries > 0) {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error('Cleanup failed after retries:', error);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
  });

  it('preview with use_content_analysis true matches organize destinations for mismatched content', async () => {
    const pngWithTxtExt = path.join(testDir, 'image_named_txt.txt');
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await fs.writeFile(pngWithTxtExt, pngHeader);

    const previewResult = await handlePreviewOrganization({
      directory: testDir,
      use_content_analysis: true,
    });
    const previewText = previewResult.content[0].text;
    expect(previewText).toContain('Images');

    const orgResult = await handleOrganizeFiles({
      directory: testDir,
      dry_run: true,
      use_content_analysis: true,
    });
    const orgText = orgResult.content[0].text;
    expect(orgText).toContain('Images');
  });
});
