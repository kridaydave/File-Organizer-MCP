/**
 * Pruning deletes expired manifests, and only manifests this install wrote.
 *
 * Before the fix, any `.json` file carrying an expired numeric timestamp was
 * unlinked: a foreign or tampered file vanished during `listManifests` even
 * though the listing contract keeps unverified files visible. The prune now
 * verifies first and leaves what it cannot verify.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { RollbackManifest } from "../../../../src/core/types/system.js";

const { RollbackService } = await import(
  "../../../../src/core/organize/rollback.js"
);
const { manifestIntegrityService } = await import(
  "../../../../src/core/organize/manifest-integrity.js"
);

type RollbackServiceInstance = InstanceType<typeof RollbackService>;

describe("pruneExpiredManifests", () => {
  let storageDir: string;
  let rollbackService: RollbackServiceInstance;

  beforeEach(async () => {
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "prune-expired-"));
    // One minute of retention: an hour-old manifest is expired, a fresh one
    // is not, with no waiting on the clock.
    rollbackService = new RollbackService({ storageDir, retentionMs: 60_000 });
  });

  afterEach(async () => {
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

  async function exists(manifestId: string): Promise<boolean> {
    return fs
      .access(path.join(storageDir, `${manifestId}.json`))
      .then(() => true)
      .catch(() => false);
  }

  it("prunes an expired manifest this install wrote", async () => {
    const manifestId = await rollbackService.createManifest("Old move", []);
    await ageManifest(manifestId, 3_600_000);

    const removed = await rollbackService.pruneExpiredManifests();

    expect(removed).toBe(1);
    expect(await exists(manifestId)).toBe(false);
  });

  it("leaves an expired manifest it cannot verify", async () => {
    const manifestId = await rollbackService.createManifest("Old move", []);
    await ageManifest(manifestId, 3_600_000);
    await tamperWithManifest(manifestId);

    const removed = await rollbackService.pruneExpiredManifests();

    expect(removed).toBe(0);
    expect(await exists(manifestId)).toBe(true);
  });

  it("leaves a fresh manifest alone", async () => {
    const manifestId = await rollbackService.createManifest("Fresh move", []);

    const removed = await rollbackService.pruneExpiredManifests();

    expect(removed).toBe(0);
    expect(await exists(manifestId)).toBe(true);
  });
});
