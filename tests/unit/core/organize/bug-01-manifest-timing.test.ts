import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { OrganizerService } from '../../../../src/core/organize/organizer.js';
import { CategorizerService } from '../../../../src/services/categorizer.service.js';
import { RollbackService } from '../../../../src/core/organize/rollback.js';
import { getRollbackDirectory } from '../../../../src/core/config/paths.js';
import { FileWithSize } from '../../../../src/types.js';

describe('BUG-01: manifest written before/during moves', () => {
  let organizer: OrganizerService;
  let testDir: string;
  let rollbackDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bug-01-test-'));
    organizer = new OrganizerService(new CategorizerService());
    rollbackDir = getRollbackDirectory();
    await fs.mkdir(rollbackDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
    try {
      const files = await fs.readdir(rollbackDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          await fs.unlink(path.join(rollbackDir, f)).catch(() => {});
        }
      }
    } catch {}
  });

  it('should have manifest with completed actions if final manifest write fails', async () => {
    const files: FileWithSize[] = [
      {
        name: 'a.txt',
        path: path.join(testDir, 'a.txt'),
        size: 10,
        modified: new Date(),
      },
      {
        name: 'b.txt',
        path: path.join(testDir, 'b.txt'),
        size: 10,
        modified: new Date(),
      },
      {
        name: 'c.txt',
        path: path.join(testDir, 'c.txt'),
        size: 10,
        modified: new Date(),
      },
    ];

    for (const f of files) {
      await fs.writeFile(f.path, 'test');
    }

    const rollbackService = new RollbackService(rollbackDir);
    const originalCreateManifest = rollbackService.createManifest.bind(rollbackService);
    let callCount = 0;
    rollbackService.createManifest = async function (
      description: string,
      actions: any[],
      manifestId?: string,
    ) {
      callCount++;
      // Fail on the final call (after all moves are done)
      if (callCount >= 5) {
        throw new Error('Simulated manifest write failure');
      }
      return originalCreateManifest(description, actions, manifestId);
    } as any;

    organizer = new OrganizerService(new CategorizerService(), undefined as any, rollbackService);

    const result = await organizer.organize(testDir, files, {
      conflictStrategy: 'rename',
    });

    // All files should be moved
    expect(result.successCount).toBe(3);
    expect(result.actions.length).toBe(3);

    // With the fix, manifest should exist with all actions from incremental writes
    const manifests = await rollbackService.listManifests();
    expect(manifests.length).toBeGreaterThan(0);
    const manifest = manifests[0];
    expect(manifest.actions.length).toBe(3);
  });
});
