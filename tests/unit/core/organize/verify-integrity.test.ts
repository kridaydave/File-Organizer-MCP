/**
 * verifyManifestFiles — the drift report behind file_organizer_verify_integrity.
 *
 * The manifest under test is built in memory with digests this file computes
 * itself, so an expectation can only hold if the implementation compares the
 * right bytes. The path each file was recorded at is returned verbatim from the
 * manifest, so assertions compare against the same strings the test wrote
 * rather than against a platform's idea of where the sandbox really is.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

const { CONFIG } = await import("../../../../src/config.js");
const { verifyManifestFiles } =
  await import("../../../../src/core/organize/verify-integrity.js");

type RollbackManifest = import("../../../../src/types.js").RollbackManifest;
type RollbackAction = import("../../../../src/types.js").RollbackAction;

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("verifyManifestFiles", () => {
  let testDir: string;
  let restoreCustomAllowed: string[] | undefined;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-integrity-"));
    restoreCustomAllowed = CONFIG.paths._overrideCustomAllowed;
    CONFIG.paths.customAllowed = [testDir];
  });

  afterEach(async () => {
    CONFIG.paths.customAllowed = restoreCustomAllowed;
    // Windows can still hold a handle on a freshly-read file, which makes
    // fs.rm fail intermittently. The delay is the documented workaround.
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true });
  });

  function manifest(actions: RollbackAction[]): RollbackManifest {
    return {
      id: "11111111-1111-4111-8111-111111111111",
      timestamp: 1_700_000_000_000,
      description: "Organization of a test directory (3 files)",
      actions,
      version: "1.0",
    };
  }

  async function seed(name: string, content: string): Promise<string> {
    const filePath = path.join(testDir, name);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it("reports each file as unchanged, modified, or missing", async () => {
    const kept = await seed("kept.txt", "kept content\n");
    const edited = await seed("edited.txt", "before\n");
    const gone = await seed("gone.txt", "deleted later\n");

    const actions: RollbackAction[] = [
      {
        type: "move",
        originalPath: path.join(testDir, "src", "kept.txt"),
        currentPath: kept,
        timestamp: 1,
        contentHash: sha256("kept content\n"),
        hashMethod: "full",
      },
      {
        type: "move",
        originalPath: path.join(testDir, "src", "edited.txt"),
        currentPath: edited,
        timestamp: 2,
        contentHash: sha256("before\n"),
        hashMethod: "full",
      },
      {
        type: "move",
        originalPath: path.join(testDir, "src", "gone.txt"),
        currentPath: gone,
        timestamp: 3,
        contentHash: sha256("deleted later\n"),
        hashMethod: "full",
      },
    ];

    // The drift happens after the manifest was written, which is the whole
    // point of checking it later.
    await fs.writeFile(edited, "after\n");
    await fs.rm(gone);

    const report = await verifyManifestFiles(manifest(actions));

    expect(report.manifest_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(report.recorded_at).toBe(1_700_000_000_000);
    expect(report.total_files).toBe(3);
    expect(report.checked).toBe(3);
    expect(report.unchanged).toBe(1);
    expect(report.modified).toBe(1);
    expect(report.missing).toBe(1);
    expect(report.unverifiable).toBe(0);
    expect(report.drift_detected).toBe(true);
    expect(report.verified).toBe(false);

    const byPath = new Map(report.files.map((f) => [f.path, f]));
    expect(byPath.get(kept)?.status).toBe("unchanged");
    expect(byPath.get(edited)?.status).toBe("modified");
    // A modified file reports both digests, so the change can be attributed.
    expect(byPath.get(edited)?.expected_hash).toBe(sha256("before\n"));
    expect(byPath.get(edited)?.actual_hash).toBe(sha256("after\n"));
    expect(byPath.get(gone)?.status).toBe("missing");
  });

  it("verifies only when every file in the manifest was rechecked and matched", async () => {
    const a = await seed("a.txt", "alpha\n");
    const b = await seed("b.txt", "beta\n");

    const report = await verifyManifestFiles(
      manifest([
        {
          type: "move",
          originalPath: a,
          currentPath: a,
          timestamp: 1,
          contentHash: sha256("alpha\n"),
          hashMethod: "full",
        },
        {
          type: "move",
          originalPath: b,
          currentPath: b,
          timestamp: 2,
          contentHash: sha256("beta\n"),
          hashMethod: "full",
        },
      ]),
    );

    expect(report.checked).toBe(2);
    expect(report.unchanged).toBe(2);
    expect(report.drift_detected).toBe(false);
    expect(report.verified).toBe(true);
    expect(
      report.files.map((f) => f.status),
    ).toEqual(["unchanged", "unchanged"]);
  });

  // The issue this ships: a manifest written before content hashing existed
  // must not read as a clean bill of health.
  it("calls an unhashed action unverifiable and withholds the verified flag", async () => {
    const hashed = await seed("hashed.txt", "recorded\n");
    const legacy = await seed("legacy.txt", "no digest was stored\n");

    const report = await verifyManifestFiles(
      manifest([
        {
          type: "move",
          originalPath: hashed,
          currentPath: hashed,
          timestamp: 1,
          contentHash: sha256("recorded\n"),
          hashMethod: "full",
        },
        {
          // Exactly the shape of a manifest on disk from before this change.
          type: "move",
          originalPath: legacy,
          currentPath: legacy,
          timestamp: 2,
        },
      ]),
    );

    expect(report.total_files).toBe(2);
    expect(report.checked).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(report.unverifiable).toBe(1);
    expect(report.modified).toBe(0);
    expect(report.missing).toBe(0);
    expect(report.verified).toBe(false);
    expect(report.drift_detected).toBe(false);

    const entry = report.files.find((f) => f.path === legacy);
    expect(entry?.status).toBe("unverifiable");
    expect(entry?.reason).toMatch(/no content hash/i);
    // No digest means no comparison happened, so no digest is claimed.
    expect(entry?.actual_hash).toBeUndefined();
  });

  it("refuses to answer for a path outside the allowed directories", async () => {
    const outside = path.join(path.parse(os.tmpdir()).root, "no-such-file.txt");

    const report = await verifyManifestFiles(
      manifest([
        {
          type: "move",
          originalPath: outside,
          currentPath: outside,
          timestamp: 1,
          contentHash: sha256("anything\n"),
          hashMethod: "full",
        },
      ]),
    );

    expect(report.checked).toBe(0);
    expect(report.unverifiable).toBe(1);
    expect(report.verified).toBe(false);
    expect(report.files[0]?.status).toBe("unverifiable");
    expect(report.files[0]?.reason).toMatch(/allowed directories/i);
  });

  it("reports a method change as unverifiable rather than as drift", async () => {
    const file = await seed("sampled-once.txt", "content\n");

    const report = await verifyManifestFiles(
      manifest([
        {
          type: "move",
          originalPath: file,
          currentPath: file,
          timestamp: 1,
          // Recorded against sampled content; a small file can now only be
          // compared in full, and the two digests are not comparable values.
          contentHash: `sampled:${sha256("content\n")}`,
          hashMethod: "sampled",
        },
      ]),
    );

    expect(report.modified).toBe(0);
    expect(report.missing).toBe(0);
    expect(report.unverifiable).toBe(1);
    expect(report.verified).toBe(false);
    expect(report.files[0]?.status).toBe("unverifiable");
    expect(report.files[0]?.reason).toMatch(/sampled/);
  });

  it("checks the backup copy a delete left behind, not the vacated path", async () => {
    const backup = await seed("backup-uuid_file.bin", "recoverable bytes\n");

    const report = await verifyManifestFiles(
      manifest([
        {
          type: "delete",
          // The delete emptied this path, so nothing here can be rehashed.
          originalPath: path.join(testDir, "original.bin"),
          backupPath: backup,
          timestamp: 1,
          contentHash: sha256("recoverable bytes\n"),
          hashMethod: "full",
        },
      ]),
    );

    expect(report.checked).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(report.verified).toBe(true);
    expect(report.files[0]?.path).toBe(backup);
  });

  it("reports an action with no recorded path as unverifiable", async () => {
    const report = await verifyManifestFiles(
      manifest([
        {
          type: "rename",
          originalPath: path.join(testDir, "nowhere.txt"),
          timestamp: 1,
          contentHash: sha256("nothing\n"),
          hashMethod: "full",
        },
      ]),
    );

    expect(report.checked).toBe(0);
    expect(report.unverifiable).toBe(1);
    expect(report.verified).toBe(false);
    expect(report.files[0]?.reason).toMatch(/no path/i);
  });

  it("never claims a manifest with no files is verified", async () => {
    const report = await verifyManifestFiles(manifest([]));

    expect(report.total_files).toBe(0);
    expect(report.checked).toBe(0);
    expect(report.verified).toBe(false);
    expect(report.files).toEqual([]);
  });
});
