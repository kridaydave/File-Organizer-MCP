/**
 * Manifest content hashing — the format change behind issue #36.
 *
 * `manifest.hash` has always been a digest over the manifest's actions list,
 * i.e. over the paths an operation intended to touch. It says nothing about
 * the bytes at those paths, which is why nothing could diff a rehash against
 * it. These tests pin the new per-action `contentHash`: that a manifest
 * records one inside a byte budget, that a budget of zero records none, and
 * that a manifest with no digest is still a manifest the undo path reads.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

const { CONFIG } = await import("../../../../src/config.js");
const { RollbackService } =
  await import("../../../../src/core/organize/rollback.js");
const { verifyManifestFiles } =
  await import("../../../../src/core/organize/verify-integrity.js");

type RollbackAction = import("../../../../src/types.js").RollbackAction;

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("rollback manifest content hashes", () => {
  let testDir: string;
  let storageDir: string;
  let rollbackService: InstanceType<typeof RollbackService>;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "manifest-hash-"));
    storageDir = path.join(testDir, "rollback");
    rollbackService = new RollbackService(storageDir);
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [testDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function seed(name: string, content: string): Promise<string> {
    const filePath = path.join(testDir, name);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  /** Perform the move an organize would have performed, leaving the origin empty. */
  async function organize(
    original: string,
    destination: string,
    content: string,
  ): Promise<void> {
    await fs.mkdir(path.dirname(original), { recursive: true });
    await fs.writeFile(original, content);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(original, destination);
  }

  it("records the sha256 of each moved file", async () => {
    const destination = await seed("notes.txt", "organized content\n");
    const actions: RollbackAction[] = [
      {
        type: "move",
        originalPath: path.join(testDir, "incoming", "notes.txt"),
        currentPath: destination,
        timestamp: 1,
      },
    ];

    const manifestId = await rollbackService.createManifest("move one", actions);
    const manifest = await rollbackService.getManifest(manifestId);

    expect(manifest.actions[0]?.contentHash).toBe(sha256("organized content\n"));
    expect(manifest.actions[0]?.hashMethod).toBe("full");

    // The caller's own action object is left alone: recording a hash is the
    // manifest writer's business, not a mutation the organizer has to undo.
    expect(actions[0]?.contentHash).toBeUndefined();

    const report = await verifyManifestFiles(manifest);
    expect(report.checked).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(report.verified).toBe(true);
  });

  it("records nothing when the hash budget is zero", async () => {
    const destination = await seed("notes.txt", "organized content\n");

    const manifestId = await rollbackService.createManifest(
      "move one, unverified",
      [
        {
          type: "move",
          originalPath: path.join(testDir, "incoming", "notes.txt"),
          currentPath: destination,
          timestamp: 1,
        },
      ],
      { hashBudgetBytes: 0 },
    );
    const manifest = await rollbackService.getManifest(manifestId);

    expect(manifest.actions[0]?.contentHash).toBeUndefined();
    expect(manifest.actions[0]?.hashMethod).toBeUndefined();

    // The manifest is still valid and still reads back; it just cannot answer
    // the integrity question.
    const verification = await verifyManifestFiles(manifest);
    expect(verification.checked).toBe(0);
    expect(verification.unverifiable).toBe(1);
    expect(verification.verified).toBe(false);
  });

  it("stops spending the budget once it is used up, but keeps going for a smaller file", async () => {
    const big = await seed("big.bin", "x".repeat(4096));
    const small = await seed("small.txt", "tiny\n");

    const manifestId = await rollbackService.createManifest(
      "two moves",
      [
        {
          type: "move",
          originalPath: path.join(testDir, "incoming", "big.bin"),
          currentPath: big,
          timestamp: 1,
        },
        {
          type: "move",
          originalPath: path.join(testDir, "incoming", "small.txt"),
          currentPath: small,
          timestamp: 2,
        },
      ],
      { hashBudgetBytes: 1024 },
    );
    const manifest = await rollbackService.getManifest(manifestId);

    // The 4KB file does not fit in a 1KB budget, so it goes unrecorded...
    expect(manifest.actions[0]?.contentHash).toBeUndefined();
    // ...while the 4-byte file behind it still does, rather than the whole
    // batch losing its hashes to the first file that did not fit.
    expect(manifest.actions[1]?.contentHash).toBe(sha256("tiny\n"));
  });

  it("records the backup copy a delete leaves behind", async () => {
    const backup = await seed("backup-uuid_original.bin", "deleted bytes\n");

    const manifestId = await rollbackService.createManifest("delete one", [
      {
        type: "delete",
        // Vacated by the delete, so there is nothing here to hash.
        originalPath: path.join(testDir, "original.bin"),
        backupPath: backup,
        timestamp: 1,
      },
    ]);
    const manifest = await rollbackService.getManifest(manifestId);

    expect(manifest.actions[0]?.contentHash).toBe(sha256("deleted bytes\n"));

    const report = await verifyManifestFiles(manifest);
    expect(report.unchanged).toBe(1);
    expect(report.verified).toBe(true);
  });

  // Backward compatibility is the point of keeping contentHash optional: a
  // manifest already on disk has no digest, and both the reader and the undo
  // path must still accept it.
  it("still loads and undoes a manifest that predates content hashing", async () => {
    const original = path.join(testDir, "incoming", "legacy.txt");
    const destination = path.join(testDir, "organized", "legacy.txt");
    await organize(original, destination, "legacy bytes\n");

    const manifestId = await rollbackService.createManifest(
      "legacy manifest",
      [
        {
          type: "move",
          originalPath: original,
          currentPath: destination,
          timestamp: 1,
        },
      ],
      { hashBudgetBytes: 0 },
    );

    const onDisk = JSON.parse(
      await fs.readFile(path.join(storageDir, `${manifestId}.json`), "utf-8"),
    );
    // The stored shape is the pre-change one: no digest anywhere on the action.
    expect(onDisk.actions[0].contentHash).toBeUndefined();
    expect(onDisk.version).toBe("1.0");

    const manifest = await rollbackService.getManifest(manifestId);
    expect(manifest.id).toBe(manifestId);

    const result = await rollbackService.rollback(manifestId);

    expect(result.failed).toBe(0);
    expect(result.success).toBe(1);
    expect(await fs.readFile(original, "utf-8")).toBe("legacy bytes\n");
    expect(await fs.access(destination).then(() => true).catch(() => false)).toBe(
      false,
    );
  });

  it("still undoes a manifest that carries content hashes", async () => {
    const original = path.join(testDir, "incoming", "hashed.txt");
    const destination = path.join(testDir, "organized", "hashed.txt");
    await organize(original, destination, "hashed bytes\n");

    const manifestId = await rollbackService.createManifest("hashed manifest", [
      {
        type: "move",
        originalPath: original,
        currentPath: destination,
        timestamp: 1,
      },
    ]);

    const manifest = await rollbackService.getManifest(manifestId);
    expect(manifest.actions[0]?.contentHash).toBe(sha256("hashed bytes\n"));

    const result = await rollbackService.rollback(manifestId);

    expect(result.failed).toBe(0);
    expect(result.success).toBe(1);
    expect(await fs.readFile(original, "utf-8")).toBe("hashed bytes\n");
  });
});
