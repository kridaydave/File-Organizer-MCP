/**
 * Ticket #102: rollback manifests expire by age and are deleted on read.
 *
 * The window is 30 days by default, comes from `rollback.retentionDays` when
 * the config sets it, and clamps to "keep everything" at 0 or below. The prune
 * runs under the manifest lock, so it skips rather than unlinks while an undo
 * holds the directory.
 *
 * Nothing is mocked except `loadUserConfig`, which is the one knob under test.
 * Every assertion is on a file that did or did not survive on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { jest } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { RollbackManifest } from "../../../../src/core/types/system.js";

/** What the mocked `loadUserConfig` reports. */
let retentionDays: number | undefined;

const actualLoader = await import("../../../../src/core/config/loader.js");
jest.unstable_mockModule("../../../../src/core/config/loader.js", () => ({
  ...actualLoader,
  loadUserConfig: () => ({ rollback: { retentionDays } }),
}));

const { RollbackService } = await import(
  "../../../../src/core/organize/rollback.js"
);
const { ManifestLockService } = await import(
  "../../../../src/core/organize/manifest-lock.js"
);
const { manifestIntegrityService } = await import(
  "../../../../src/core/organize/manifest-integrity.js"
);

type RollbackServiceInstance = InstanceType<typeof RollbackService>;

const DAY_MS = 24 * 60 * 60 * 1000;

describe("rollback manifests expire by age on read", () => {
  let storageDir: string;
  let rollbackService: RollbackServiceInstance;

  beforeEach(async () => {
    retentionDays = undefined;
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "prune-retention-"));
    rollbackService = new RollbackService(storageDir);
  });

  afterEach(async () => {
    retentionDays = undefined;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  /**
   * Rewrite a manifest so it was recorded `backMs` ago.
   *
   * The hash and the signature both cover the timestamp, so both are
   * recomputed here rather than left stale — a manifest that fails its own
   * integrity check would still be prunable, but it would be a different code
   * path than the one this file is about.
   */
  async function ageManifest(manifestId: string, backMs: number): Promise<void> {
    const filePath = path.join(storageDir, `${manifestId}.json`);
    const manifest = JSON.parse(
      await fs.readFile(filePath, "utf-8"),
    ) as RollbackManifest;
    manifest.timestamp = Date.now() - backMs;
    manifest.hash = manifestIntegrityService.computeHash(
      manifest.actions,
      manifest.timestamp,
    );
    manifest.signature = manifestIntegrityService.computeSignature(manifest);
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));
  }

  /** Write a manifest with one no-op action, so there is a real file to age. */
  async function seedManifest(): Promise<string> {
    return rollbackService.createManifest("One file moved", [
      {
        type: "move",
        originalPath: path.join(storageDir, "from.txt"),
        currentPath: path.join(storageDir, "to.txt"),
        timestamp: Date.now(),
      },
    ]);
  }

  /** Whether a manifest file is still on disk. */
  async function exists(manifestId: string): Promise<boolean> {
    return fs
      .access(path.join(storageDir, `${manifestId}.json`))
      .then(() => true, () => false);
  }

  it("prunes a manifest past the 30-day default and keeps one inside it", async () => {
    retentionDays = undefined;
    const expired = await seedManifest();
    const live = await seedManifest();
    await ageManifest(expired, 31 * DAY_MS);
    await ageManifest(live, 29 * DAY_MS);

    const listed = await rollbackService.listManifests();

    expect(listed.map((m) => m.id)).toEqual([live]);
    await expect(exists(expired)).resolves.toBe(false);
    await expect(exists(live)).resolves.toBe(true);
  });

  it("reads the window from rollback.retentionDays", async () => {
    retentionDays = 1;
    const expired = await seedManifest();
    const live = await seedManifest();
    await ageManifest(expired, 2 * DAY_MS);
    await ageManifest(live, 1 * DAY_MS - 60_000);

    await rollbackService.listManifests();

    await expect(exists(expired)).resolves.toBe(false);
    await expect(exists(live)).resolves.toBe(true);
  });

  it("keeps everything when the window clamps to 0 from a negative config value", async () => {
    // A negative window must not reach `retentionMs`: a window in the past
    // would make every manifest look expired and empty the directory on the
    // next read. It clamps to 0, and 0 means no pruning.
    retentionDays = -5;
    const old = await seedManifest();
    await ageManifest(old, 400 * DAY_MS);

    await rollbackService.listManifests();

    await expect(exists(old)).resolves.toBe(true);
  });

  it("keeps everything when the config sets retentionDays to 0", async () => {
    retentionDays = 0;
    const old = await seedManifest();
    await ageManifest(old, 400 * DAY_MS);

    await rollbackService.listManifests();

    await expect(exists(old)).resolves.toBe(true);
  });

  it("refuses to prune while another process holds the manifest lock", async () => {
    retentionDays = 1;
    const expired = await seedManifest();
    await ageManifest(expired, 3 * DAY_MS);

    const lock = new ManifestLockService(storageDir, 5_000);
    await lock.runExclusive(async () => {
      // The listing still succeeds — a prune that cannot get the lock skips
      // rather than blocking the caller or unlinking under an undo.
      await expect(rollbackService.listManifests()).resolves.toBeDefined();
      await expect(exists(expired)).resolves.toBe(true);
    });

    await expect(exists(expired)).resolves.toBe(true);

    // The lock is back, so the next read prunes it after all.
    await rollbackService.listManifests();
    await expect(exists(expired)).resolves.toBe(false);
  });
});
