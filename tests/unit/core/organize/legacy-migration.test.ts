/**
 * Legacy rollback migration only carries manifests it can verify.
 *
 * `RollbackService` migrates manifests out of `.file-organizer-rollbacks` in the
 * directory the server was launched from, which is no install's own directory.
 * Copying whatever is found there is the attack the manifest signature exists to
 * stop: anyone who can write into the launch directory gets a file into the
 * undo history. It also made the verify sandbox non-hermetic, because a sandbox
 * launched from the repo inherited whatever the test suite had left in the
 * worktree, and `undo_last_operation` with no id then reported "possible
 * tampering detected" on a manifest it had just copied in itself.
 *
 * Both are the same defect seen from two ends, so one test pins the property:
 * a manifest that does not verify stays where it is.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "@jest/globals";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";

import { RollbackService } from "../../../../src/core/organize/rollback.js";
import { manifestIntegrityService } from "../../../../src/core/organize/manifest-integrity.js";
import type { RollbackManifest } from "../../../../src/types.js";

const tmpRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), "fo-migrate-"));

/**
 * Trigger the storage bootstrap the migration hangs off.
 *
 * `listManifests` deliberately does not call `ensureStorage`, so reading the
 * directory cannot exercise the migration. `getManifest` does, and then reports
 * a miss for an id that was never there, which is the expected outcome here.
 */
async function triggerMigration(storageDir: string): Promise<void> {
  await new RollbackService(storageDir)
    .getManifest("00000000-0000-4000-8000-000000000000")
    .catch(() => undefined);
}

/** A manifest that this install could legitimately have written. */
function signedManifest(id: string): RollbackManifest {
  return manifestIntegrityService.signManifest({
    id,
    timestamp: Date.now(),
    description: `legacy ${id}`,
    actions: [],
    version: "1.0",
  });
}

describe("legacy rollback migration", () => {
  let launchDir: string;
  let storageDir: string;
  let legacyDir: string;
  let originalCwd: string;
  let originalNodeEnv: string | undefined;
  let originalWorkerId: string | undefined;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalNodeEnv = process.env.NODE_ENV;
    originalWorkerId = process.env.JEST_WORKER_ID;

    // The migration is a no-op under jest on purpose, so the guard has to come
    // off to exercise it. Put it back in afterEach.
    delete process.env.NODE_ENV;
    delete process.env.JEST_WORKER_ID;

    launchDir = await fs.mkdtemp(path.join(tmpRoot, "launch-"));
    storageDir = path.join(launchDir, "new-install", "rollbacks");
    legacyDir = path.join(launchDir, ".file-organizer-rollbacks");
    await fs.mkdir(legacyDir, { recursive: true });
    process.chdir(launchDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalWorkerId === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = originalWorkerId;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(launchDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("leaves a manifest whose signature does not verify where it is", async () => {
    const forged = { ...signedManifest("forged-id"), signature: "deadbeef" };
    await fs.writeFile(
      path.join(legacyDir, "forged-id.json"),
      JSON.stringify(forged),
    );

    await triggerMigration(storageDir);

    // The storage dir is created so the install works, but nothing lands in it.
    const carried = await fs
      .readdir(storageDir)
      .then((files) => files.filter((f) => f.endsWith(".json")));
    expect(carried).toEqual([]);

    // And the legacy file is untouched, not deleted: it is not ours to remove.
    await expect(
      fs.access(path.join(legacyDir, "forged-id.json")),
    ).resolves.toBeUndefined();
  });

  it("leaves a file that does not parse at all where it is", async () => {
    await fs.writeFile(path.join(legacyDir, "junk.json"), "{not json");

    await triggerMigration(storageDir);

    const carried = await fs
      .readdir(storageDir)
      .then((files) => files.filter((f) => f.endsWith(".json")));
    expect(carried).toEqual([]);
  });

  it("still carries a manifest it can verify, so real history survives", async () => {
    await fs.writeFile(
      path.join(legacyDir, "genuine-id.json"),
      JSON.stringify(signedManifest("genuine-id")),
    );

    await triggerMigration(storageDir);

    const carried = await fs.readdir(storageDir);
    expect(carried).toContain("genuine-id.json");
  });
});