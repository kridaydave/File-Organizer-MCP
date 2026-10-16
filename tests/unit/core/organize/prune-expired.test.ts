/**
 * Ticket #102: rollback manifests expire by age and are deleted on read.
 *
 * Two rules are in tension here. A manifest this install wrote and that is
 * past the window should go, and a manifest that cannot be verified, or that
 * the window does not actually cover, should stay. The second rule wins: the
 * prune only ever deletes what it has proven it owns and what the config asked
 * it to delete.
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

const { RollbackService, DEFAULT_RETENTION_DAYS } = await import(
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

describe("pruneExpiredManifests", () => {
  let storageDir: string;
  let rollbackService: RollbackServiceInstance;

  beforeEach(async () => {
    retentionDays = undefined;
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "prune-expired-"));
    // One minute of retention: an hour-old manifest is expired, a fresh one
    // is not, with no waiting on the clock.
    rollbackService = new RollbackService({ storageDir, retentionMs: 60_000 });
  });

  afterEach(async () => {
    retentionDays = undefined;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  async function readManifest(manifestId: string): Promise<RollbackManifest> {
    const filePath = path.join(storageDir, `${manifestId}.json`);
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as RollbackManifest;
  }

  /** Date a manifest back, keeping its hash and signature valid. */
  async function ageManifest(manifestId: string, backMs: number): Promise<void> {
    const manifest = await readManifest(manifestId);
    manifest.timestamp = Date.now() - backMs;
    manifest.hash = manifestIntegrityService.computeHash(
      manifest.actions,
      manifest.timestamp,
    );
    manifest.signature = manifestIntegrityService.computeSignature(manifest);
    await fs.writeFile(
      path.join(storageDir, `${manifestId}.json`),
      JSON.stringify(manifest, null, 2),
    );
  }

  /** Break the hash the way tampering would, leaving an expired timestamp. */
  async function tamperWithManifest(manifestId: string): Promise<void> {
    const manifest = await readManifest(manifestId);
    manifest.hash = `tampered-${manifest.hash ?? "none"}`;
    await fs.writeFile(
      path.join(storageDir, `${manifestId}.json`),
      JSON.stringify(manifest, null, 2),
    );
  }

  /** Write a manifest, so there is a real file to age. */
  async function seedManifest(description = "One file moved"): Promise<string> {
    return rollbackService.createManifest(description, []);
  }

  async function exists(manifestId: string): Promise<boolean> {
    return fs
      .access(path.join(storageDir, `${manifestId}.json`))
      .then(() => true)
      .catch(() => false);
  }

  it("prunes an expired manifest this install wrote", async () => {
    const manifestId = await seedManifest();
    await ageManifest(manifestId, 3_600_000);

    const removed = await rollbackService.pruneExpiredManifests();

    expect(removed).toBe(1);
    expect(await exists(manifestId)).toBe(false);
  });

  it("leaves an expired manifest it cannot verify", async () => {
    const manifestId = await seedManifest();
    await ageManifest(manifestId, 3_600_000);
    await tamperWithManifest(manifestId);

    const removed = await rollbackService.pruneExpiredManifests();

    expect(removed).toBe(0);
    expect(await exists(manifestId)).toBe(true);
  });

  it("leaves a fresh manifest alone", async () => {
    const manifestId = await seedManifest();

    const removed = await rollbackService.pruneExpiredManifests();

    expect(removed).toBe(0);
    expect(await exists(manifestId)).toBe(true);
  });

  it("prunes past the 30-day default and keeps one inside it", async () => {
    // No override and no config: whatever the default is has to decide here.
    const defaulted = new RollbackService(storageDir);
    const expired = await seedManifest();
    const live = await seedManifest();
    await ageManifest(expired, (DEFAULT_RETENTION_DAYS + 1) * DAY_MS);
    await ageManifest(live, (DEFAULT_RETENTION_DAYS - 1) * DAY_MS);

    const listed = await defaulted.listManifests();

    expect(listed.map((m) => m.id)).toEqual([live]);
    expect(await exists(expired)).toBe(false);
    expect(await exists(live)).toBe(true);
  });

  it("reads the window from rollback.retentionDays", async () => {
    // Retention comes from the user config when no override is passed.
    const fromConfig = new RollbackService(storageDir);
    retentionDays = 1;
    const expired = await seedManifest();
    const live = await seedManifest();
    await ageManifest(expired, 2 * DAY_MS);
    await ageManifest(live, 1 * DAY_MS - 60_000);

    await fromConfig.listManifests();

    expect(await exists(expired)).toBe(false);
    expect(await exists(live)).toBe(true);
  });

  it("keeps everything when the window clamps to 0 from a negative config value", async () => {
    // A negative window must not reach the cutoff: a window in the past would
    // make every manifest look expired and empty the directory on the next
    // read. It clamps to 0, and 0 means no pruning.
    const fromConfig = new RollbackService(storageDir);
    retentionDays = -5;
    const old = await seedManifest();
    await ageManifest(old, 400 * DAY_MS);

    await fromConfig.listManifests();

    expect(await exists(old)).toBe(true);
  });

  it("keeps everything when the config sets retentionDays to 0", async () => {
    // 0 is the documented "keep every manifest" value, so it must not become
    // "expire everything older than right now".
    const fromConfig = new RollbackService(storageDir);
    retentionDays = 0;
    const old = await seedManifest();
    await ageManifest(old, 400 * DAY_MS);

    await fromConfig.listManifests();

    expect(await exists(old)).toBe(true);
  });

  it("keeps everything when the retention override is 0", async () => {
    const keepAll = new RollbackService({ storageDir, retentionMs: 0 });
    const old = await seedManifest();
    await ageManifest(old, 400 * DAY_MS);

    await keepAll.listManifests();

    expect(await exists(old)).toBe(true);
  });

  it("refuses to prune while another process holds the manifest lock", async () => {
    const shortWindow = new RollbackService({
      storageDir,
      retentionMs: 60_000,
    });
    const expired = await seedManifest();
    await ageManifest(expired, 3_600_000);

    const lock = new ManifestLockService(storageDir, 5_000);
    await lock.runExclusive(async () => {
      // The listing still succeeds — a prune that cannot get the lock skips
      // rather than blocking the caller or unlinking under an undo.
      await expect(shortWindow.listManifests()).resolves.toBeDefined();
      expect(await exists(expired)).toBe(true);
    });

    expect(await exists(expired)).toBe(true);

    // The lock is back, so the next read prunes it after all.
    await shortWindow.listManifests();
    expect(await exists(expired)).toBe(false);
  });
});
